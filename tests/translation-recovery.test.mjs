import test from "node:test";
import assert from "node:assert/strict";
import { Script } from "node:vm";
import { fileURLToPath } from "node:url";
import { bundleContent } from "../scripts/bundle-content.mjs";
import { MessageType } from "../src/shared/messages.js";
import { LocalTranslator } from "../src/translation/translator.js";
import { MixedLanguageTranslator } from "../src/translation/mixed-language-translator.js";
import { TranslationQueue } from "../src/translation/translation-queue.js";

function installTranslator(t, create) {
  const previous = globalThis.Translator;
  t.after(() => { globalThis.Translator = previous; });
  globalThis.Translator = { async availability() { return "available"; }, create };
}

function genericFailure() {
  return Object.assign(new Error("Other generic failures occurred."), { name: "UnknownError" });
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

test("a generic failure recreates only the failed pair, retries the text and restores listening", async (t) => {
  const created = [];
  const calls = [];
  const destroyed = [];
  installTranslator(t, async ({ sourceLanguage, targetLanguage }) => {
    const id = created.length;
    created.push([sourceLanguage, targetLanguage]);
    return {
      async translate(text) {
        calls.push([id, text]);
        if (id === 1) throw genericFailure();
        return `訳:${text}`;
      },
      destroy() { destroyed.push(id); }
    };
  });
  const states = [];
  const translator = new LocalTranslator({ onState: state => states.push(state) });
  const otherPair = await translator.prepare("id", "ja");
  assert.equal(await translator.translate("hello", "en-US", "ja"), "訳:hello");
  assert.equal(await translator.translate("next", "en", "ja"), "訳:next");
  assert.deepEqual(created, [["id", "ja"], ["en", "ja"], ["en", "ja"]]);
  assert.deepEqual(calls, [[1, "hello"], [2, "hello"], [2, "next"]]);
  assert.deepEqual(destroyed, [1]);
  assert.equal(translator.instances.get("id:ja"), otherPair);
  assert.equal(states.at(-1), "listening");
});

test("persistent generic failures stop after one retry and give Japanese recovery instructions", async (t) => {
  let created = 0;
  let destroyed = 0;
  let healthy = false;
  installTranslator(t, async () => {
    created += 1;
    return {
      async translate() { if (!healthy) throw genericFailure(); return "復旧"; },
      destroy() { destroyed += 1; }
    };
  });
  const translator = new LocalTranslator();
  await assert.rejects(translator.translate("hello", "en", "ja"), error => {
    assert.equal(error.code, "service_failed");
    assert.match(error.message, /EN → JA/);
    assert.match(error.message, /OFF.*ON.*Chromeを再起動/);
    assert.doesNotMatch(error.message, /Other generic failures/);
    assert.equal(error.cause.name, "UnknownError");
    return true;
  });
  assert.equal(created, 2);
  assert.equal(destroyed, 2);
  assert.equal(translator.instances.size, 0);
  healthy = true;
  assert.equal(await translator.translate("next", "en", "ja"), "復旧");
  assert.equal(created, 3);
});

test("the generic error text is recoverable even without the native error name", async (t) => {
  let created = 0;
  let destroyed = 0;
  installTranslator(t, async () => {
    const id = created++;
    return {
      async translate() { if (id === 0) throw new Error("Other generic failures occurred."); return "你好"; },
      destroy() { destroyed += 1; throw new Error("service already disposed"); }
    };
  });
  const translator = new LocalTranslator();
  assert.equal(await translator.translate("hello", "en-US", "zh-Hans"), "你好");
  assert.equal(created, 2);
  assert.equal(destroyed, 1);
  assert.equal(translator.instances.has("en:zh"), true);
});

test("permission, cancellation and unrelated translation errors are not retried", async (t) => {
  let created = 0;
  let failure;
  installTranslator(t, async () => {
    created += 1;
    return { async translate() { throw failure; }, destroy() { assert.fail("Must retain the instance"); } };
  });
  const translator = new LocalTranslator();
  for (const name of ["AbortError", "NotAllowedError", "SecurityError", "TypeError"]) {
    failure = Object.assign(new Error("unrelated failure"), { name });
    await assert.rejects(translator.translate("hello", "en", "ja"), error => error === failure);
  }
  assert.equal(created, 1);
});

test("failure to create a replacement remains a model preparation error without another retry", async (t) => {
  let created = 0;
  installTranslator(t, async () => {
    created += 1;
    if (created === 2) throw genericFailure();
    return { async translate() { throw genericFailure(); }, destroy() {} };
  });
  await assert.rejects(new LocalTranslator().translate("hello", "en", "ja"), { code: "model_install_failed" });
  assert.equal(created, 2);
});

test("concurrent failures share a replacement and cannot destroy the newer instance", async (t) => {
  const lateFailure = deferred();
  let created = 0;
  const destroyed = [];
  installTranslator(t, async () => {
    const id = created++;
    return {
      async translate(text) {
        if (id === 0) {
          if (text === "late") return lateFailure.promise;
          throw genericFailure();
        }
        return `訳:${text}`;
      },
      destroy() { destroyed.push(id); }
    };
  });
  const translator = new LocalTranslator();
  await translator.prepare("en", "ja");
  const late = translator.translate("late", "en", "ja");
  assert.equal(await translator.translate("first", "en", "ja"), "訳:first");
  lateFailure.reject(genericFailure());
  assert.equal(await late, "訳:late");
  assert.equal(created, 2);
  assert.deepEqual(destroyed, [0]);
});

test("reset during translation prevents an old failure from restarting the translator", async (t) => {
  const pending = deferred();
  let created = 0;
  installTranslator(t, async () => {
    created += 1;
    return { translate() { return pending.promise; }, destroy() {} };
  });
  const translator = new LocalTranslator();
  const translating = translator.translate("hello", "en", "ja");
  await new Promise(setImmediate);
  translator.reset();
  const failure = genericFailure();
  pending.reject(failure);
  await assert.rejects(translating, { name: "AbortError", code: "aborted" });
  assert.equal(created, 1);
  assert.equal(translator.instances.size, 0);
});

test("reset during recovery disposes of the late model without clearing a newer preparation", async (t) => {
  const oldCreation = deferred();
  const newCreation = deferred();
  let created = 0;
  let destroyed = 0;
  installTranslator(t, async () => {
    created += 1;
    if (created === 2) return oldCreation.promise;
    if (created === 3) return newCreation.promise;
    return { async translate() { throw genericFailure(); }, destroy() {} };
  });
  const translator = new LocalTranslator();
  const recovering = translator.translate("hello", "en", "ja");
  await new Promise(setImmediate);
  assert.equal(created, 2);
  translator.reset();
  const freshPreparation = translator.prepare("en", "ja");
  await new Promise(setImmediate);
  oldCreation.resolve({ destroy() { destroyed += 1; } });
  await assert.rejects(recovering, { name: "AbortError", code: "aborted" });
  assert.equal(destroyed, 1);
  assert.equal(translator.instances.size, 0);
  assert.equal(translator.preparing.size, 1);
  const samePreparation = translator.prepare("en", "ja");
  const freshInstance = { async translate() { return "新しい翻訳"; }, destroy() {} };
  newCreation.resolve(freshInstance);
  assert.equal(await freshPreparation, freshInstance);
  assert.equal(await samePreparation, freshInstance);
  assert.equal(created, 3);
  assert.equal(translator.instances.get("en:ja"), freshInstance);
});

test("the speech translation queue completes the failed utterance and continues after recovery", async (t) => {
  let created = 0;
  installTranslator(t, async () => {
    const id = created++;
    return { async translate(text) { if (id === 0) throw genericFailure(); return `訳:${text}`; }, destroy() {} };
  });
  const mixed = new MixedLanguageTranslator({ detector: { async detect() { return [{ detectedLanguage: "en", confidence: 1 }]; } } });
  const results = [];
  const errors = [];
  const queue = new TranslationQueue({
    translator: { translate: text => mixed.translate(text, "en-US", "ja") },
    onResult: result => results.push(result),
    onError: error => errors.push(error)
  });
  queue.enqueue({ id: "first", text: "hello world" });
  queue.enqueue({ id: "second", text: "next utterance" });
  await queue.drain();
  assert.deepEqual(results.map(({ id, translated }) => [id, translated]), [["first", "訳:hello world"], ["second", "訳:next utterance"]]);
  assert.deepEqual(errors, []);
  assert.equal(created, 2);
});

async function speechHarness(create) {
  const source = await bundleContent(fileURLToPath(new URL("../src/offscreen/offscreen.js", import.meta.url)));
  let receive;
  const recognizers = [];
  const messages = [];
  class SpeechRecognition {
    processLocally = true;
    static async available() { return "available"; }
    start() { recognizers.push(this); this.onstart?.(); }
    abort() { this.onend?.(); }
  }
  const track = { readyState: "live", stop() {} };
  new Script(source).runInNewContext({
    SpeechRecognition, performance, crypto: globalThis.crypto, setTimeout, clearTimeout,
    navigator: { mediaDevices: { async getUserMedia() { return { getAudioTracks: () => [track], getTracks: () => [track] }; } } },
    Translator: { async availability() { return "available"; }, create },
    LanguageDetector: {
      async availability() { return "available"; },
      async create() { return { async detect() { return [{ detectedLanguage: "en", confidence: 1 }]; }, destroy() {} }; }
    },
    chrome: { runtime: {
      onMessage: { addListener(listener) { receive = listener; } },
      async sendMessage(message) { messages.push(message); return { ok: true }; }
    } }
  });
  const dispatch = message => new Promise(resolve => receive({ ...message, target: "offscreen" }, {}, resolve));
  const start = (settings = {}) => dispatch({ type: "session:start-capture", tabId: 17, videoId: "video", streamId: "stream", settings: { enabled: true, sourceLanguage: "en-US", targetLanguage: "ja", translateChat: false, ...settings } });
  const stop = () => dispatch({ type: "session:offscreen-stop" });
  const utterance = text => recognizers.at(-1).onresult({ resultIndex: 0, results: [{ 0: { transcript: text, confidence: 1 }, isFinal: true }] });
  return { start, stop, utterance, messages, recognizers };
}

test("a restarted speech recognizer reports recovery before receiving another transcript", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const h = await speechHarness(async () => ({ async translate() { return "翻訳"; }, destroy() {} }));
  t.after(() => h.stop());
  await h.start();
  const recognition = h.recognizers.at(-1);
  recognition.onerror({ error: "network" });
  const failure = h.messages.at(-1);
  assert.equal(failure.type, MessageType.OFFSCREEN_ERROR);
  assert.equal(failure.scope, "speech");
  recognition.onend();
  t.mock.timers.tick(500);
  await Promise.resolve();
  assert.equal(h.recognizers.length, 2);
  assert.equal(h.messages.at(-1).state, "listening");
  assert.equal(h.messages.at(-1).scope, "speech");
  const count = h.messages.length;
  recognition.onerror({ error: "network" });
  recognition.onstart();
  assert.equal(h.messages.length, count, "late events from the old instance cannot overwrite recovery");
});

test("a healthy auto-language transcript recovers a competing recognizer's error", async (t) => {
  const h = await speechHarness(async () => ({ async translate() { return "翻訳"; }, destroy() {} }));
  t.after(() => h.stop());
  await h.start({ sourceLanguage: "auto" });
  h.recognizers.find(recognition => recognition.lang === "en-US").onerror({ error: "network" });
  assert.equal(h.messages.at(-1).scope, "speech");
  const japanese = h.recognizers.find(recognition => recognition.lang === "ja-JP");
  const errorCount = h.messages.length;
  japanese.onresult({ resultIndex: 0, results: [{ 0: { transcript: "", confidence: 1 }, isFinal: false }] });
  assert.equal(h.messages.length, errorCount, "an empty result is not evidence of recovery");
  japanese.onresult({ resultIndex: 0, results: [{ 0: { transcript: "今日もおはようございます", confidence: 1 }, isFinal: false }] });
  const recovery = h.messages.at(-2);
  assert.equal(recovery.type, MessageType.OFFSCREEN_STATE);
  assert.equal(recovery.state, "listening");
  assert.equal(recovery.scope, "speech");
  assert.equal(h.messages.at(-1).type, MessageType.OFFSCREEN_TRANSCRIPT);
  assert.equal(h.messages.at(-1).original, "今日もおはようございます");
  const count = h.messages.length;
  japanese.onresult({ resultIndex: 0, results: [{ 0: { transcript: "今日もおはようございます皆さん", confidence: 1 }, isFinal: false }] });
  assert.equal(h.messages.length, count + 1, "normal transcripts do not repeat state notifications");
  await h.stop();
  const stoppedCount = h.messages.length;
  japanese.onerror({ error: "network" });
  japanese.onstart();
  assert.equal(h.messages.length, stoppedCount);
});

test("a fixed-language final transcript reports speech recovery without waiting for translation", async (t) => {
  const h = await speechHarness(async () => ({ async translate() { assert.fail("Matching source and target need no translation"); }, destroy() {} }));
  t.after(() => h.stop());
  await h.start({ sourceLanguage: "ja-JP" });
  const recognition = h.recognizers.at(-1);
  recognition.onerror({ error: "network" });
  h.utterance("今日もおはようございます");
  assert.equal(h.messages.at(-2).state, "listening");
  assert.equal(h.messages.at(-2).scope, "speech");
  assert.equal(h.messages.at(-1).type, MessageType.OFFSCREEN_TRANSCRIPT);
  assert.equal(h.messages.at(-1).willTranslate, false);
});

test("starting audio translation recovers the first native failure and sends the translated result", async () => {
  let created = 0;
  const h = await speechHarness(async () => {
    const id = created++;
    return { async translate(text) { if (id === 0) throw genericFailure(); return `訳:${text}`; }, destroy() {} };
  });
  assert.equal((await h.start()).ok, true);
  h.utterance("hello world");
  await new Promise(setImmediate);
  assert.equal(created, 2);
  const result = h.messages.find(message => message.type === MessageType.OFFSCREEN_TRANSLATION);
  assert.equal(result?.original, "hello world");
  assert.equal(result?.translated, "訳:hello world");
  assert.equal(h.messages.some(message => message.type === MessageType.OFFSCREEN_ERROR), false);
  assert.equal(h.messages.filter(message => message.type === MessageType.OFFSCREEN_STATE).at(-1)?.state, "listening");
  await h.stop();
});

test("a stopped audio session cannot restart translation or report its late failure to a new session", async () => {
  const pending = deferred();
  let created = 0;
  const h = await speechHarness(async () => {
    const id = created++;
    return { async translate() { return id === 0 ? pending.promise : "新しい翻訳"; }, destroy() {} };
  });
  await h.start();
  h.utterance("hello world");
  await new Promise(setImmediate);
  await h.stop();
  await h.start();
  pending.reject(genericFailure());
  await new Promise(setImmediate);
  assert.equal(created, 2);
  assert.equal(h.messages.some(message => message.type === MessageType.OFFSCREEN_ERROR), false);
  assert.equal(h.messages.some(message => message.type === MessageType.OFFSCREEN_TRANSLATION), false);
  await h.stop();
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { ensureSpeechLanguage } from "../src/speech/speech-language.js";
import { applySpeechPhraseHints } from "../src/speech/speech-recognizer.js";
import { MessageType } from "../src/shared/messages.js";

test("popup omits the local-processing copy", async () => {
  const [html, script] = await Promise.all([
    readFile(new URL("../src/popup/popup.html", import.meta.url), "utf8"),
    readFile(new URL("../src/popup/popup.js", import.meta.url), "utf8")
  ]);
  assert.doesNotMatch(`${html}\n${script}`, /端末内で処理/);
});

test("prepares local speech with the same default quality used by recognition", async () => {
  let installed = false;
  const optionsSeen = [];
  class SpeechRecognition {
    processLocally = true;
    static async available(options) {
      optionsSeen.push(options);
      if (options.quality === "conversation") return "unavailable";
      return installed ? "available" : "downloadable";
    }
    static async install(options) {
      optionsSeen.push(options);
      installed = true;
      return true;
    }
  }
  const states = [];
  const result = await ensureSpeechLanguage({ language: "ja-JP", scope: { SpeechRecognition }, onState: state => states.push(state) });
  assert.equal(result.status, "available");
  assert.deepEqual(states, ["downloading"]);
  for (const options of optionsSeen) assert.deepEqual(options, { langs: ["ja-JP"], processLocally: true });
});

test("unavailable local speech is not treated as a completed download", async () => {
  class SpeechRecognition {
    processLocally = true;
    static async available() { return "unavailable"; }
    static async install() { assert.fail("Must not install unsupported speech"); }
  }
  await assert.rejects(ensureSpeechLanguage({ scope: { SpeechRecognition } }), { code: "language_unavailable" });
});

test("applies contextual phrase hints only when the browser supports them", () => {
  class SpeechRecognitionPhrase {
    constructor(phrase, boost) { this.phrase = phrase; this.boost = boost; }
  }
  const recognition = { phrases: [] };
  assert.equal(applySpeechPhraseHints(recognition, [{ phrase: "あえんびえん", boost: 20 }], { SpeechRecognitionPhrase }), true);
  assert.equal(recognition.phrases[0].phrase, "あえんびえん");
  assert.equal(recognition.phrases[0].boost, 10);
  assert.equal(applySpeechPhraseHints({}, [{ phrase: "あえんびえん", boost: 8 }], { SpeechRecognitionPhrase }), false);
});

test("popup updates the detected language and clears a failed start state", async (t) => {
  const nodes = new Map();
  const document = { querySelector(id) {
    if (!nodes.has(id)) nodes.set(id, {
      hidden: true, checked: false, value: "en-US", textContent: "", style: {},
      options: [{ value: "en" }, { value: "ja" }], listeners: {},
      classList: { toggle() {} }, setAttribute() {}, removeAttribute() {},
      addEventListener(type, listener) { this.listeners[type] = listener; }
    });
    return nodes.get(id);
  } };
  let receive;
  const previousDocument = globalThis.document;
  const previousChrome = globalThis.chrome;
  t.after(() => { globalThis.document = previousDocument; globalThis.chrome = previousChrome; });
  globalThis.document = document;
  globalThis.chrome = { runtime: {
    onMessage: { addListener(listener) { receive = listener; } },
    async sendMessage(message) {
      if (message.type === MessageType.GET_POPUP_STATE) return { ok: true, settings: { enabled: true }, session: {}, tab: { id: 7 } };
      return { ok: false, error: "音声認識モデルを利用できません。", settings: { enabled: false } };
    }
  } };
  await import("../src/popup/popup.js");
  receive({ type: MessageType.POPUP_LANGUAGE, tabId: 8, detectedLanguage: "id-ID" });
  assert.equal(nodes.get("#status").textContent, "翻訳中・判定中→日本語");
  receive({ type: MessageType.POPUP_LANGUAGE, tabId: 7, detectedLanguage: "en-US" });
  assert.equal(nodes.get("#status").textContent, "翻訳中・英語→日本語");
  const enabled = nodes.get("#enabled");
  enabled.checked = true;
  await enabled.listeners.change();
  receive({ type: MessageType.OFFSCREEN_STATE, state: "downloading", progress: 1 });
  assert.equal(enabled.checked, false);
  assert.equal(enabled.disabled, false);
  assert.equal(nodes.get("#progress").hidden, true);
  assert.match(nodes.get("#status").textContent, /開始できませんでした/);
  assert.match(nodes.get("#error").textContent, /音声認識モデル/);
});

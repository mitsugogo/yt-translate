import test from "node:test";
import assert from "node:assert/strict";
import { Script } from "node:vm";
import { fileURLToPath } from "node:url";
import { bundleContent } from "../scripts/bundle-content.mjs";

async function harness({ onTranslate = text => `訳:${text}` } = {}) {
  const source = await bundleContent(fileURLToPath(new URL("../src/offscreen/offscreen.js", import.meta.url)));
  let receive;
  const calls = [];
  const states = [];
  class SpeechRecognition {
    processLocally = true;
    static async available() { return "available"; }
    start() { this.onstart?.(); }
    abort() { this.onend?.(); }
  }
  const track = { readyState: "live", stop() {} };
  new Script(source).runInNewContext({
    SpeechRecognition, performance, setTimeout, clearTimeout,
    navigator: { mediaDevices: { async getUserMedia() { return { getAudioTracks: () => [track], getTracks: () => [track] }; } } },
    Translator: {
      async availability() { return "available"; },
      async create(pair) {
        return { async translate(text) { calls.push({ text, ...pair }); return onTranslate(text, pair); }, destroy() {} };
      }
    },
    LanguageDetector: {
      async availability() { return "available"; },
      async create() {
        return { async detect(text) { return [{ detectedLanguage: /\p{Script=Han}/u.test(text) ? "zh" : "en", confidence: 0.99 }]; }, destroy() {} };
      }
    },
    chrome: { runtime: {
      onMessage: { addListener(listener) { receive = listener; } },
      async sendMessage(message) { states.push(message); return { ok: true }; }
    } }
  });
  const dispatch = message => new Promise(resolve => { receive({ ...message, target: "offscreen" }, {}, resolve); });
  const settings = { enabled: true, sourceLanguage: "en-US", targetLanguage: "ja" };
  const start = () => dispatch({ type: "session:start-capture", tabId: 17, videoId: "video", streamId: "stream", settings });
  const translate = (text, overrides = {}) => dispatch({ type: "chat:translate", tabId: 17, videoId: "video", text, targetLanguage: "ja", ...overrides });
  return { dispatch, start, translate, calls, states, settings };
}

test("offscreen chat translates independently of the speech source, and respects active session scope", async () => {
  const h = await harness();
  assert.equal((await h.translate("hello world")).status, "skipped");
  assert.equal((await h.start()).ok, true);
  assert.equal((await h.translate("hello world")).translated, "訳:hello world");
  assert.equal((await h.translate("今天的直播真的非常精彩")).sourceLanguage, "zh");
  assert.equal(h.calls[1].sourceLanguage, "zh");
  assert.equal(h.calls[1].targetLanguage, "ja");
  assert.equal((await h.translate("hello world", { tabId: 18 })).status, "skipped");
  assert.equal((await h.translate("hello world", { videoId: "old" })).status, "skipped");
  assert.equal((await h.translate("hello world", { targetLanguage: "ko" })).status, "skipped");
  assert.equal(h.states.some(message => message.type === "translation:result"), false, "chat results do not overwrite the speech panel");
  await h.dispatch({ type: "session:offscreen-stop" });
  assert.equal((await h.translate("hello world")).status, "skipped");
});

test("offscreen target changes invalidate pending chat output and use the new shared target", async () => {
  let resolve;
  const h = await harness({ onTranslate: (text, pair) => pair.targetLanguage === "ja" ? new Promise(done => { resolve = done; }) : `ko:${text}` });
  await h.start();
  const pending = h.translate("hello world");
  await new Promise(setImmediate);
  assert.equal((await h.dispatch({ type: "session:offscreen-settings", tabId: 17, settings: { ...h.settings, targetLanguage: "ko" } })).ok, true);
  resolve("古い翻訳");
  assert.equal((await pending).status, "skipped");
  assert.equal((await h.translate("hello world", { targetLanguage: "ko" })).translated, "ko:hello world");
  await h.dispatch({ type: "session:offscreen-stop" });
});

test("turning off chat discards in-flight output without restarting speech, and turning on resumes", async () => {
  let resolve;
  let defer = true;
  const h = await harness({ onTranslate: text => {
    if (!defer) return `訳:${text}`;
    defer = false;
    return new Promise(done => { resolve = done; });
  } });
  await h.start();
  const pending = h.translate("hello world");
  await new Promise(setImmediate);
  const stateCount = h.states.length;
  await h.dispatch({ type: "session:offscreen-settings", tabId: 17, settings: { ...h.settings, translateChat: false } });
  assert.equal(h.states.length, stateCount, "audio recognition is not restarted");
  assert.equal((await h.translate("another comment")).status, "skipped");
  resolve("古い翻訳");
  assert.equal((await pending).status, "skipped");
  await h.dispatch({ type: "session:offscreen-settings", tabId: 17, settings: { ...h.settings, translateChat: true } });
  assert.equal(h.states.length, stateCount);
  assert.equal((await h.translate("hello world")).translated, "訳:hello world");
  await h.dispatch({ type: "session:offscreen-stop" });
});

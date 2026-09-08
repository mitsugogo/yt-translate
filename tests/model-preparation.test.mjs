import test from "node:test";
import assert from "node:assert/strict";
import { ensureSpeechLanguage } from "../src/speech/speech-language.js";
import { MessageType } from "../src/shared/messages.js";

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

test("popup clears starting and progress after failure, including late progress", async (t) => {
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
      if (message.type === MessageType.GET_POPUP_STATE) return { ok: true, settings: {} };
      return { ok: false, error: "音声認識モデルを利用できません。", settings: { enabled: false } };
    }
  } };
  await import("../src/popup/popup.js");
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

import test from "node:test";
import assert from "node:assert/strict";
import { Script } from "node:vm";
import { fileURLToPath } from "node:url";
import { bundleContent } from "../scripts/bundle-content.mjs";
import { MessageType } from "../src/shared/messages.js";
import { normalizeSettings } from "../src/shared/settings.js";

async function harness(initialSettings) {
  const source = await bundleContent(fileURLToPath(new URL("../src/popup/popup.js", import.meta.url)));
  const nodes = new Map();
  const patches = [];
  let settings = normalizeSettings(initialSettings);
  new Script(source).runInNewContext({
    document: { querySelector(id) {
      if (!nodes.has(id)) nodes.set(id, {
        hidden: true, checked: false, value: "", textContent: "", style: {},
        options: ["ja", "en", "id", "ko", "zh-Hant", "zh-Hans"].map(value => ({ value, disabled: false })),
        listeners: {}, classList: { toggle() {} }, setAttribute() {}, removeAttribute() {},
        addEventListener(type, listener) { this.listeners[type] = listener; }
      });
      return nodes.get(id);
    } },
    chrome: { runtime: {
      onMessage: { addListener() {} },
      async sendMessage(message) {
        if (message.type === MessageType.SETTINGS_UPDATED) {
          patches.push(message.patch);
          settings = normalizeSettings({ ...settings, ...message.patch });
        }
        return { ok: true, settings };
      }
    } }
  });
  await new Promise(setImmediate);
  return { nodes, patches };
}

test("popup loads a Japanese speech and Japanese target setting without disabling it", async () => {
  const h = await harness({ sourceLanguage: "ja-JP", targetLanguage: "ja" });
  const target = h.nodes.get("#targetLanguage");
  assert.equal(target.value, "ja");
  assert.equal(target.options.find(option => option.value === "ja").disabled, false);
  assert.equal(h.nodes.get("#autoLanguagePreference").disabled, true);
});

test("popup keeps the target when speech changes and saves matching targets", async () => {
  const h = await harness({ sourceLanguage: "auto", targetLanguage: "ja" });
  const source = h.nodes.get("#sourceLanguage");
  const target = h.nodes.get("#targetLanguage");
  source.value = "ja-JP";
  await source.listeners.change();
  assert.equal(h.patches.at(-1).targetLanguage, "ja");
  assert.equal(target.value, "ja");
  for (const [sourceLanguage, targetLanguage] of [["ja-JP", "ja"], ["en-US", "en"], ["id-ID", "id"]]) {
    source.value = sourceLanguage;
    await source.listeners.change();
    assert.equal(target.options.find(option => option.value === targetLanguage).disabled, false);
    target.value = targetLanguage;
    await target.listeners.change();
    assert.equal(h.patches.at(-1).targetLanguage, targetLanguage);
    assert.equal(target.value, targetLanguage);
  }
  source.value = "auto";
  await source.listeners.change();
  assert.equal(h.nodes.get("#autoLanguagePreference").disabled, false);
  assert.equal(target.value, "id");
});

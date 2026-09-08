import test from "node:test";
import assert from "node:assert/strict";
import { TranslationQueue } from "../src/translation/translation-queue.js";
import { formatActiveTranslationStatus, formatLanguageDirection, normalizeSettings, resolveAutoLanguagePreference, shouldTranslateSource } from "../src/shared/settings.js";

test("defaults auto recognition to the channel preference and supports manual override", () => {
  assert.equal(normalizeSettings({}).autoLanguagePreference, "channel");
  assert.equal(normalizeSettings({ autoLanguagePreference: "none" }).autoLanguagePreference, "none");
  assert.equal(resolveAutoLanguagePreference("channel", "en"), "en");
  assert.equal(resolveAutoLanguagePreference("ja", "en"), "ja");
  assert.equal(resolveAutoLanguagePreference("none", "en"), null);
});

test("supports Japanese speech translated to English", () => {
  const settings = normalizeSettings({ sourceLanguage: "ja-JP", targetLanguage: "ja" });
  assert.equal(settings.sourceLanguage, "ja-JP");
  assert.equal(settings.targetLanguage, "en");
  assert.equal(formatLanguageDirection(settings.sourceLanguage, settings.targetLanguage), "JA → EN");
});

test("formats the popup status with the detected and target languages", () => {
  assert.equal(formatActiveTranslationStatus("en-US", "ja"), "翻訳中・英語→日本語");
  assert.equal(formatActiveTranslationStatus(null, "id"), "翻訳中・判定中→インドネシア語");
});

test("does not request translation when the adopted speech language is the target", () => {
  assert.equal(shouldTranslateSource("ja-JP", "ja"), false);
  assert.equal(shouldTranslateSource("en-US", "ja"), true);
  assert.equal(shouldTranslateSource("id-ID", "id"), false);
});

test("translates final utterances sequentially", async () => {
  const calls = [];
  const results = [];
  const queue = new TranslationQueue({
    translator: {
      translate: async (text) => {
        calls.push(text);
        await new Promise((resolve) => setTimeout(resolve, 2));
        return `JA:${text}`;
      }
    },
    onResult: (result) => results.push(result)
  });

  queue.enqueue({ id: "1", text: "first", timestamp: 1 });
  queue.enqueue({ id: "2", text: "second", timestamp: 2 });
  await queue.drain();

  assert.deepEqual(calls, ["first", "second"]);
  assert.deepEqual(results.map((result) => result.translated), ["JA:first", "JA:second"]);
});

test("bounds pending final utterances", async () => {
  const queue = new TranslationQueue({
    maxPending: 2,
    translator: { translate: async (text) => text }
  });
  queue.running = true;
  queue.enqueue({ id: "1", text: "one" });
  queue.enqueue({ id: "2", text: "two" });
  queue.enqueue({ id: "3", text: "three" });

  assert.deepEqual(queue.pending.map((item) => item.text), ["two", "three"]);
});

test("passes detected source language metadata to the translator", async () => {
  let received;
  const queue = new TranslationQueue({
    translator: { translate: async (text, item) => { received = { text, item }; return "翻訳"; } }
  });
  const item = { id: "mixed", text: "terima kasih", sourceLanguage: "id-ID" };
  queue.enqueue(item);
  await queue.drain();
  assert.deepEqual(received, { text: item.text, item });
});

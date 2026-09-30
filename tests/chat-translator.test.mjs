import test from "node:test";
import assert from "node:assert/strict";
import { ChatTranslator, ChatLanguageDetector, CHAT_CACHE_LIMIT, CHAT_AUTHOR_LIMIT, sameChatLanguage } from "../src/translation/chat-translator.js";
import { shouldSkipChatText } from "../src/shared/chat-text.js";

function harness({ results = [{ detectedLanguage: "en", confidence: 0.99 }], now } = {}) {
  const detections = [];
  const translations = [];
  const service = new ChatTranslator({
    now,
    detector: { async detect(text) { detections.push(text); return typeof results === "function" ? results(text) : results; } },
    translator: { async translate(...args) { translations.push(args); return `訳:${args[0]}`; } }
  });
  const translate = (text, authorId = "", targetLanguage = "ja") => service.translate({ text, authorId, targetLanguage });
  return { service, detections, translations, translate };
}

test("emoji, emote tokens, numbers and laughter skip detection and translation", async () => {
  const h = harness();
  for (const text of ["😂🤣", "🎉 🎉!!", "88888", "ｗｗｗ", "www", "草", "（笑）", "笑笑", "LOL!", "lol😂️", "lmao", "hahaha", "wkwkwk", "哈哈哈哈", "ㅋㅋㅋㅋ", "ㅎㅎㅎ", ":member_stamp: :smile:"]) {
    assert.equal(shouldSkipChatText(text), true, text);
    assert.equal((await h.translate(text)).status, "skipped", text);
  }
  for (const text of ["That was funny lol", "笑ってしまった", "Hello 😂", "www.example.com", "grass", ":stamp: Thank you"]) assert.equal(shouldSkipChatText(text), false, text);
  assert.equal(h.detections.length, 0);
  assert.equal(h.translations.length, 0);
});

test("Japanese and unknown comments stay unchanged while English uses the shared target", async () => {
  const h = harness({ results: text => text === "ambiguous" ? [{ detectedLanguage: "en", confidence: 0.45 }] : [{ detectedLanguage: "en", confidence: 0.99 }] });
  assert.equal((await h.translate("ありがとう！", "jp")).status, "same");
  assert.equal((await h.translate("ambiguous")).status, "unknown");
  assert.equal((await h.translate("hi")).status, "unknown");
  assert.equal((await h.translate("Thank you", "en")).translated, "訳:Thank you");
  await h.translate("Good morning", "en", "ko");
  assert.deepEqual(h.translations, [["Thank you", "en", "ja"], ["Good morning", "en", "ko"]]);
});

test("short Han-only comments require a recent hint from that same author", async () => {
  let time = 0;
  const h = harness({ now: () => time, results: [{ detectedLanguage: "zh-Hant", confidence: 0.99 }] });
  assert.equal((await h.translate("感謝", "unknown")).status, "unknown");
  assert.equal(h.detections.length, 0);
  await h.translate("今天的直播真的非常精彩", "cn");
  assert.equal((await h.translate("感謝", "cn")).sourceLanguage, "zh-Hant");
  assert.equal((await h.translate("感謝", "different")).status, "unknown");
  await h.translate("ありがとうございます", "jp");
  assert.equal((await h.translate("最高", "jp")).status, "same");
  time += 5 * 60 * 1000 + 1;
  assert.equal((await h.translate("感謝", "cn")).status, "unknown");
});

test("conflicting language candidates remain unknown and clear language switches replace hints", async () => {
  const h = harness({ results: text => text.startsWith("unclear")
    ? [{ detectedLanguage: "en", confidence: 0.83 }, { detectedLanguage: "id", confidence: 0.75 }]
    : [{ detectedLanguage: "zh", confidence: 0.99 }] });
  assert.equal((await h.translate("unclear phrase", "author")).status, "unknown");
  await h.translate("これは日本語です", "author");
  await h.translate("今天的直播真的非常精彩", "author");
  assert.equal((await h.translate("感謝", "author")).sourceLanguage, "zh");
});

test("repeated text reuses detection and translations without sharing ambiguous author hints", async () => {
  const h = harness();
  await h.translate("Thank you", "one");
  await h.translate("Thank you", "two");
  assert.equal(h.detections.length, 1);
  assert.equal(h.translations.length, 1);
  await h.translate("Thank you", "two", "ko");
  assert.equal(h.translations.length, 2);
  assert.equal((await h.translate("感謝", "one")).status, "unknown");
});

test("author, detection and translation caches remain bounded under a busy chat", async () => {
  const h = harness();
  for (let i = 0; i < 250; i++) await h.translate(`message ${i}`, `author-${i}`);
  assert.equal(h.service.authors.size, CHAT_AUTHOR_LIMIT);
  assert.equal(h.service.languages.size, CHAT_CACHE_LIMIT);
  assert.equal(h.service.cache.size, CHAT_CACHE_LIMIT);
  assert.equal(h.service.authors.has("author-0"), false);
});

test("in-flight work is serial and a closed session cannot return or retain stale translations", async () => {
  let resolve;
  let resets = 0;
  const service = new ChatTranslator({
    detector: { async detect() { return [{ detectedLanguage: "en", confidence: 0.99 }]; }, reset() { resets += 1; } },
    translator: { translate() { return new Promise(done => { resolve = done; }); }, reset() { resets += 1; } }
  });
  const first = service.translate({ text: "hello world", targetLanguage: "ja" });
  await new Promise(setImmediate);
  assert.equal((await service.translate({ text: "second message", targetLanguage: "ja" })).status, "skipped");
  service.close();
  assert.equal(resets, 0);
  resolve("こんにちは");
  assert.equal((await first).status, "skipped");
  assert.equal(resets, 2);
  assert.equal(service.cache.size, 0);
  assert.equal(service.authors.size, 0);
});

test("API failures and unsupported translation pairs leave the comment untouched", async () => {
  const service = new ChatTranslator({
    detector: { async detect() { return [{ detectedLanguage: "zh", confidence: 0.99 }]; } },
    translator: { async translate() { throw new Error("pair unavailable"); } }
  });
  assert.equal((await service.translate({ text: "今天的直播真的非常精彩", targetLanguage: "ja" })).status, "unavailable");
  assert.equal((await service.translate({ text: "x".repeat(501), targetLanguage: "ja" })).status, "unknown");
  assert.equal(sameChatLanguage("zh-Hant", "zh-Hans"), true);
  assert.equal(sameChatLanguage("ja-JP", "ja"), true);
  assert.equal(sameChatLanguage(null, "ja"), false);
});

test("chat detection preserves Chinese candidates instead of applying the speech language filter", async t => {
  const previous = globalThis.LanguageDetector;
  t.after(() => { globalThis.LanguageDetector = previous; });
  let created = 0;
  globalThis.LanguageDetector = {
    async availability() { return "available"; },
    async create() { created += 1; return { async detect() { return [{ detectedLanguage: "zh", confidence: 0.99 }]; } }; }
  };
  const detector = new ChatLanguageDetector();
  assert.equal((await detector.detect("中文"))[0].detectedLanguage, "zh");
  await detector.detect("中文");
  assert.equal(created, 1);
});

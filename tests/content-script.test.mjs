import test from "node:test";
import assert from "node:assert/strict";
import { Script } from "node:vm";
import { fileURLToPath } from "node:url";
import { bundleContent } from "../scripts/bundle-content.mjs";
import { findTranslationInsertionPoint } from "../src/content/youtube-dom.js";

async function createContentHarness({ sendMessage, enabled = true } = {}) {
  const source = await bundleContent(fileURLToPath(new URL("../src/content/youtube.js", import.meta.url)));
  const fields = new Map();
  const field = selector => {
    if (!fields.has(selector)) fields.set(selector, {
      textContent: "", dataset: {}, hidden: false, style: {}, listeners: {},
      classList: { toggle() {} }, setAttribute() {}, removeAttribute() {},
      addEventListener(type, listener) { this.listeners[type] = listener; }
    });
    return fields.get(selector);
  };
  let markup = "";
  const shadow = {
    set innerHTML(html) { markup = html; },
    querySelector: field
  };
  let inserted;
  let hostRemoved = false;
  const metadata = {};
  const parent = { insertBefore(host, before) { inserted = { host, before }; host.isConnected = true; } };
  metadata.parentElement = parent;
  const document = {
    documentElement: {}, addEventListener() {}, removeEventListener() {},
    querySelector(selector) { return selector.includes("ytd-watch-metadata") ? metadata : null; },
    createElement(tag) {
      return {
        tag, dataset: {}, style: { setProperty() {} }, attachShadow() { return shadow; },
        remove() { this.isConnected = false; hostRemoved = true; }
      };
    }
  };
  let receive;
  const messages = [];
  let observerCallback;
  let observerDisconnected = false;
  let intervalCleared = false;
  const runtime = {
    id: "test-extension",
    onMessage: { addListener(listener) { receive = listener; } },
    sendMessage(message) {
      messages.push(message);
      return sendMessage ? sendMessage(message) : Promise.resolve({ ok: true });
    }
  };
  new Script(source).runInNewContext({
    document, location: { href: "https://www.youtube.com/watch?v=example" }, URL,
    window: {
      addEventListener() {}, removeEventListener() {}, setInterval() { return 1; },
      clearInterval() { intervalCleared = true; }
    },
    MutationObserver: class {
      constructor(callback) { observerCallback = callback; }
      observe() {}
      disconnect() { observerDisconnected = true; }
    },
    setTimeout() { assert.fail("Metadata exists; mounting should not wait"); },
    clearTimeout() {},
    chrome: { runtime }
  });
  if (enabled) receive({
    type: "session:offscreen-settings",
    settings: { enabled: true, sourceLanguage: "auto", autoLanguagePreference: "channel", targetLanguage: "ja", showOriginal: true, showTranslation: true, fontSize: 15 }
  });
  return {
    source, fields, markup, metadata, inserted, messages, runtime,
    receive: message => receive(message),
    getInserted: () => inserted,
    invalidateFromDomChange() { runtime.id = undefined; observerCallback(); },
    status: () => ({ hostRemoved, observerDisconnected, intervalCleared })
  };
}

test("classic content bundle mounts the panel before metadata and accepts translations", async () => {
  const harness = await createContentHarness();
  const { fields, markup, metadata, inserted, messages, receive, source } = harness;
  assert.equal(inserted.before, metadata);
  assert.equal(inserted.host.tag, "yt-local-translator");
  assert.match(markup, /リアルタイム翻訳/);
  assert.match(markup, /<style>/);
  assert.match(markup, /:host-context\(html\[dark\]\) \.panel/);
  assert.match(markup, /--yt-spec-text-primary/);
  assert.doesNotMatch(markup, /prefers-color-scheme/);
  assert.doesNotMatch(markup, /data-action="toggle"/);
  assert.doesNotMatch(markup, />開始</);
  assert.match(markup, /音声を待っています/);
  assert.doesNotMatch(markup, /端末内で処理/);
  assert.ok(markup.indexOf('class="text"') < markup.indexOf('<span class="brand">リアルタイム翻訳</span>'));
  assert.doesNotMatch(source, /chrome\.runtime\.getURL/);
  assert.ok(messages.some(message => message.type === "content:ready"));
  receive({ type: "translation:result", videoId: "example", id: "en-1", original: "Hello", translated: "こんにちは" });
  assert.equal(fields.get('[data-role="original"]').textContent, "Hello");
  assert.equal(fields.get('[data-role="translation"]').textContent, "こんにちは");
  receive({ type: "transcript:result", videoId: "example", id: "ja-1", original: "こんばんは", sourceLanguage: "ja-JP", isFinal: true, willTranslate: false });
  assert.equal(fields.get('[data-role="original"]').textContent, "こんばんは");
  assert.equal(fields.get('[data-role="translation"]').textContent, "こんにちは");
  receive({ type: "translation:result", videoId: "example", id: "en-1", original: "Hello", translated: "遅れて届いた翻訳" });
  assert.equal(fields.get('[data-role="translation"]').textContent, "こんにちは");
  receive({ type: "session:state", videoId: "example", state: "downloading", detail: "言語判定モデル 100%", progress: 1 });
  assert.equal(fields.get('[data-role="progress"]').hidden, true);
  assert.equal(fields.get('[data-role="detail"]').hidden, true);
  receive({ type: "session:state", videoId: "example", state: "listening" });
  receive({ type: "session:state", videoId: "example", state: "downloading", detail: "遅れて届いた進捗", progress: 0.5 });
  assert.equal(fields.get('[data-role="state"]').textContent, "翻訳中");
  assert.equal(fields.get('[data-role="progress"]').hidden, true);
  receive({ type: "pipeline:error", videoId: "example", message: "音声認識を開始できませんでした。" });
  assert.equal(fields.get('[data-role="warning"]').textContent, "音声認識を開始できませんでした。");
  assert.equal(fields.get('[data-role="detail"]').hidden, true);
});

test("panel stays hidden while disabled and follows popup settings", async () => {
  const harness = await createContentHarness({ enabled: false });
  assert.equal(harness.getInserted(), undefined);
  harness.receive({
    type: "session:offscreen-settings",
    settings: { enabled: true, sourceLanguage: "auto", autoLanguagePreference: "channel", targetLanguage: "ja", showOriginal: true, showTranslation: true, fontSize: 15 }
  });
  assert.equal(harness.getInserted().host.tag, "yt-local-translator");
  harness.receive({
    type: "session:offscreen-settings",
    settings: { enabled: false, sourceLanguage: "auto", autoLanguagePreference: "channel", targetLanguage: "ja", showOriginal: true, showTranslation: true, fontSize: 15 }
  });
  assert.equal(harness.status().hostRemoved, true);
});

test("early translated chunks retain their provisional status in the panel", async () => {
  const { receive, fields } = await createContentHarness();
  receive({ type: "transcript:result", videoId: "example", id: "early-1", original: "早めに表示する部分", isFinal: false });
  receive({ type: "translation:result", videoId: "example", id: "early-1", original: "早めに表示する部分", translated: "An early segment", isFinal: false });
  assert.equal(fields.get('[data-role="original"]').dataset.final, "false");
  assert.equal(fields.get('[data-role="translation"]').textContent, "An early segment");
});

test("completed translation remains visible throughout subsequent interim and segment updates", async () => {
  const { receive, fields } = await createContentHarness();
  receive({ type: "transcript:result", videoId: "example", id: "chunk-1", original: "The first sentence", isFinal: false });
  receive({ type: "translation:result", videoId: "example", id: "chunk-1", original: "The first sentence", translated: "最初の文章です", isFinal: false });
  for (let index = 0; index < 20; index += 1) {
    receive({ type: "transcript:result", videoId: "example", id: "interim", original: `Next sentence ${index}`, isFinal: false });
    assert.equal(fields.get('[data-role="translation"]').textContent, "最初の文章です");
  }
  receive({ type: "transcript:result", videoId: "example", id: "chunk-2", original: "The second sentence", isFinal: true });
  assert.equal(fields.get('[data-role="translation"]').textContent, "最初の文章です");
  receive({ type: "translation:result", videoId: "example", id: "chunk-2", original: "The second sentence", translated: "次の文章です" });
  assert.equal(fields.get('[data-role="translation"]').textContent, "次の文章です");
});

test("a translation that finishes after the original advances is displayed without rewinding the original", async () => {
  const { receive, fields } = await createContentHarness();
  receive({ type: "transcript:result", videoId: "example", id: "chunk-1", original: "First sentence", isFinal: true });
  receive({ type: "transcript:result", videoId: "example", id: "chunk-2", original: "Second sentence", isFinal: false });
  receive({ type: "transcript:result", videoId: "example", id: "interim", original: "Currently speaking", isFinal: false });
  receive({ type: "translation:result", videoId: "example", id: "chunk-1", original: "First sentence", translated: "最初の文章です" });
  assert.equal(fields.get('[data-role="original"]').textContent, "Currently speaking");
  assert.equal(fields.get('[data-role="translation"]').textContent, "最初の文章です");
  receive({ type: "translation:result", videoId: "example", id: "chunk-2", original: "Second sentence", translated: "次の文章です", isFinal: false });
  assert.equal(fields.get('[data-role="original"]').textContent, "Currently speaking");
  assert.equal(fields.get('[data-role="translation"]').textContent, "次の文章です");
});

test("out-of-order and duplicate translations cannot replace a newer displayed translation", async () => {
  const { receive, fields } = await createContentHarness();
  for (const id of ["chunk-1", "chunk-2"]) receive({ type: "transcript:result", videoId: "example", id, original: id, isFinal: true });
  receive({ type: "translation:result", videoId: "example", id: "chunk-2", original: "chunk-2", translated: "新しい翻訳" });
  receive({ type: "translation:result", videoId: "example", id: "chunk-1", original: "chunk-1", translated: "遅れて届いた古い翻訳" });
  receive({ type: "translation:result", videoId: "example", id: "chunk-2", original: "chunk-2", translated: "重複した結果" });
  assert.equal(fields.get('[data-role="translation"]').textContent, "新しい翻訳");
});

test("language changes clear old translations and reject in-flight results from previous settings", async () => {
  const { receive, fields } = await createContentHarness();
  receive({ type: "transcript:result", videoId: "example", id: "old", original: "hello", isFinal: true });
  receive({ type: "translation:result", videoId: "example", id: "old", original: "hello", translated: "こんにちは" });
  receive({ type: "session:offscreen-settings", settings: { enabled: true, sourceLanguage: "auto", targetLanguage: "en", showOriginal: true, showTranslation: true, fontSize: 15 } });
  assert.equal(fields.get('[data-role="translation"]').textContent, "");
  receive({ type: "translation:result", videoId: "example", id: "old", original: "hello", translated: "古い設定の結果" });
  assert.equal(fields.get('[data-role="translation"]').textContent, "");
  receive({ type: "transcript:result", videoId: "example", id: "new", original: "こんばんは", isFinal: true });
  receive({ type: "translation:result", videoId: "example", id: "new", original: "こんばんは", translated: "Good evening" });
  assert.equal(fields.get('[data-role="translation"]').textContent, "Good evening");
});

test("invalidated extension context stops observers and removes the stale panel", async () => {
  const harness = await createContentHarness();
  assert.doesNotThrow(() => harness.invalidateFromDomChange());
  assert.deepEqual(harness.status(), {
    hostRemoved: true,
    observerDisconnected: true,
    intervalCleared: true
  });
});

test("synchronous runtime invalidation during a panel action is contained", async () => {
  let fail = false;
  const harness = await createContentHarness({ sendMessage() {
    if (fail) throw new Error("Extension context invalidated.");
    return Promise.resolve({ ok: true });
  } });
  fail = true;
  assert.doesNotThrow(() => harness.fields.get('[data-action="dismiss"]').listeners.click());
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(harness.status(), {
    hostRemoved: true,
    observerDisconnected: true,
    intervalCleared: true
  });
});

test("insertion fallback stays after the outer player, never inside player controls", () => {
  const parent = {};
  const nextSibling = {};
  const player = { parentElement: parent, nextSibling };
  assert.deepEqual(findTranslationInsertionPoint({ querySelector(selector) {
    return selector === "ytd-watch-flexy #player-container-outer" ? player : null;
  } }), { parent, before: nextSibling });
  assert.equal(findTranslationInsertionPoint({ querySelector() { return null; } }), null);
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Script } from "node:vm";
import { fileURLToPath } from "node:url";
import { bundleContent } from "../scripts/bundle-content.mjs";
import { ChatTranslationView, CHAT_PENDING_LIMIT, CHAT_TRACKED_LIMIT, readChatAuthor } from "../src/content/chat-translation.js";
import { FixtureNode, comment, fixture } from "./chat-dom-harness.mjs";

function harness(comments, request = async () => ({ status: "translated", translated: "翻訳しました" })) {
  const f = fixture();
  f.root.append(...comments.map(item => item.renderer));
  const calls = [];
  const view = new ChatTranslationView({ ...f.options, request: async item => { calls.push(item); return request(item); } });
  view.setSettings({ enabled: true, targetLanguage: "ja" });
  return { ...f, view, calls };
}

test("visible comments replace only their text and toggle the exact original DOM", async () => {
  const link = new FixtureNode("a");
  link.textContent = "Example";
  link.setAttribute("href", "https://example.com");
  const emoji = new FixtureNode("img");
  emoji.setAttribute("alt", ":member:");
  const item = comment([new FixtureNode("#text", "Hello "), link, emoji]);
  const originals = [...item.message.childNodes];
  const h = harness([item]);
  assert.equal(h.calls.length, 0);
  h.visible(item.renderer);
  await h.flushOne();
  assert.equal(item.message.textContent, "翻訳しました訳");
  const render = h.view.items.get(item.renderer).render;
  assert.equal(render.badge.textContent, "訳");
  assert.equal(render.text.getAttribute("role"), "button");
  render.text.fire("click");
  assert.deepEqual(render.text.childNodes, originals);
  render.text.fire("click", { target: link });
  assert.equal(render.showingOriginal, true, "original links retain their normal action");
  render.text.fire("keydown", { key: "Enter" });
  assert.equal(render.text.textContent, "翻訳しました");
  render.text.fire("click");
  assert.deepEqual(render.text.childNodes, originals);
  h.view.setSettings({ enabled: false, targetLanguage: "ja" });
  assert.deepEqual(item.message.childNodes, originals);
});

test("same-language and unknown results do not touch the original or add a badge", async () => {
  for (const status of ["same", "unknown", "unavailable", "skipped"]) {
    const item = comment("original text");
    const original = item.message.firstChild;
    const h = harness([item], async () => ({ status }));
    h.visible(item.renderer);
    await h.flushOne();
    assert.equal(item.message.firstChild, original, status);
    assert.equal(item.message.textContent, "original text", status);
    assert.equal(h.view.items.get(item.renderer).render, null);
  }
});

test("membership stamps, emojis and laughter never send a translation request", async () => {
  const stamp = new FixtureNode("img");
  stamp.setAttribute("alt", "Membership Smile");
  const items = [comment([stamp]), comment("😂🤣"), comment("ｗｗｗ"), comment("LOL"), comment("8888")];
  const h = harness(items);
  assert.equal(h.view.items.size, 0);
  assert.equal(h.timerCount, 0);
  assert.equal(h.calls.length, 0);
  assert.equal(items[0].message.firstChild, stamp);
});

test("a busy chat bounds pending work and tracks only a bounded set of renderers", async () => {
  const items = Array.from({ length: 300 }, (_, i) => comment(`message ${i}`));
  const h = harness(items);
  assert.equal(h.view.items.size, CHAT_TRACKED_LIMIT);
  h.visible(...items.map(item => item.renderer));
  assert.equal(h.view.pending.size, CHAT_PENDING_LIMIT);
  await h.flushOne();
  assert.equal(h.calls[0].text, "message 299");
  assert.equal(h.calls.length, 1);
  h.hidden(...items.map(item => item.renderer));
  await h.flushOne();
  assert.equal(h.calls.length, 1);
  h.view.dispose();
});

test("scrolling to older comments picks them up without tracking the full history", async () => {
  const items = Array.from({ length: 300 }, (_, i) => comment(`message ${i}`));
  const h = harness(items);
  assert.equal(h.view.items.has(items[0].renderer), false);
  h.doc.documentElement.clientHeight = 100;
  h.doc.documentElement.clientWidth = 200;
  h.root.getBoundingClientRect = () => ({ top: -1000, bottom: 100, left: 0, width: 200 });
  h.doc.elementFromPoint = () => items[0].message;
  h.view.onScroll();
  await h.flushOne();
  assert.equal(h.view.items.has(items[0].renderer), true);
  assert.equal(h.view.items.size, CHAT_TRACKED_LIMIT);
  h.visible(items[0].renderer);
  await h.flushOne();
  assert.equal(h.calls[0].text, "message 0");
  h.view.dispose();
});

test("removed, deleted or edited messages reject delayed translations", async () => {
  for (const action of ["remove", "edit", "delete"]) {
    let resolve;
    const item = comment("original text");
    const h = harness([item], () => new Promise(done => { resolve = done; }));
    h.visible(item.renderer);
    await h.flushOne();
    if (action === "remove") item.renderer.remove();
    else if (action === "edit") item.message.textContent = "new text";
    else { item.renderer.setAttribute("is-deleted", ""); item.message.textContent = "deleted"; }
    h.view.onMutations([{ target: item.renderer, addedNodes: [] }]);
    resolve({ status: "translated", translated: "古い翻訳" });
    await new Promise(setImmediate);
    assert.doesNotMatch(item.message.textContent, /古い翻訳/);
    if (action === "delete") assert.equal(h.view.items.has(item.renderer), false);
    h.view.dispose();
  }
});

test("settings changes restore originals and discard results from the previous target", async () => {
  let resolve;
  const item = comment("original text");
  const h = harness([item], () => new Promise(done => { resolve = done; }));
  h.visible(item.renderer);
  await h.flushOne();
  h.view.setSettings({ enabled: true, targetLanguage: "ko" });
  resolve({ status: "translated", translated: "古い翻訳" });
  await new Promise(setImmediate);
  assert.equal(item.message.textContent, "original text");
  h.visible(item.renderer);
  await h.flushOne();
  assert.equal(h.calls[1].targetLanguage, "ko");
  resolve({ status: "translated", translated: "한국어" });
  await new Promise(setImmediate);
  assert.equal(item.message.textContent, "한국어訳");
  h.view.setSettings({ enabled: false, targetLanguage: "ko" });
  assert.equal(item.message.textContent, "original text");
});

test("chat checkbox restores originals, stops observers and can resume with audio still enabled", async () => {
  const item = comment("original text");
  const h = harness([item]);
  h.visible(item.renderer);
  await h.flushOne();
  assert.equal(item.message.textContent, "翻訳しました訳");
  h.view.setSettings({ enabled: true, translateChat: false, targetLanguage: "ja" });
  assert.equal(item.message.textContent, "original text");
  assert.equal(h.view.items.size, 0);
  assert.equal(h.view.pending.size, 0);
  assert.equal(h.mutations.every(observer => observer.disconnected), true);
  h.view.setSettings({ enabled: true, translateChat: true, targetLanguage: "ja" });
  h.visible(item.renderer);
  await h.flushOne();
  assert.equal(item.message.textContent, "翻訳しました訳");
  assert.equal(h.calls.length, 2);
  h.view.dispose();
});

test("own mutation records do not retranslate a comment; YouTube replacements are respected", async () => {
  const item = comment("original text");
  const h = harness([item]);
  h.visible(item.renderer);
  await h.flushOne();
  const state = h.view.items.get(item.renderer);
  h.view.onMutations([{ target: item.message, addedNodes: [state.render.wrapper] }]);
  h.visible(item.renderer);
  await h.flushOne();
  assert.equal(h.calls.length, 1);
  item.message.textContent = "YouTube replacement";
  h.view.onMutations([{ target: item.message, addedNodes: [] }]);
  h.view.dispose();
  assert.equal(item.message.textContent, "YouTube replacement");
});

test("comments are picked up when YouTube attaches their message body after the renderer", async () => {
  const h = harness([]);
  const item = comment("late body");
  h.root.append(item.renderer);
  h.view.onMutations([{ target: item.renderer, addedNodes: [item.message] }]);
  h.visible(item.renderer);
  await h.flushOne();
  assert.equal(h.calls[0].text, "late body");
  item.renderer.setAttribute("data-yt-local-author-id", "UCabcdefghijklmnopqrstuv");
  h.view.onMutations([{ target: item.renderer, addedNodes: [] }]);
  assert.equal(h.view.items.get(item.renderer).text, "late body", "late author metadata does not treat translated text as new prose");
  h.view.dispose();
  assert.equal(item.message.textContent, "late body");
});

test("author hints use public IDs rather than display names", () => {
  const item = comment("hello", "");
  const author = new FixtureNode("span");
  author.setAttribute("id", "author-name");
  author.textContent = "同じ名前";
  item.renderer.append(author);
  assert.equal(readChatAuthor(item.renderer), "");
  item.renderer.setAttribute("data-yt-local-author-id", "UCabcdefghijklmnopqrstuv");
  assert.equal(readChatAuthor(item.renderer), "UCabcdefghijklmnopqrstuv");
});

test("chat author bridge reads the page's renderer data without exposing comment text", async () => {
  const f = fixture();
  const item = comment("private body");
  item.renderer.data = { authorExternalChannelId: "UCabcdefghijklmnopqrstuv", message: "private body" };
  f.root.append(item.renderer);
  const source = await bundleContent(fileURLToPath(new URL("../src/content/chat-author.js", import.meta.url)));
  new Script(source).runInNewContext({ document: f.doc, window: { addEventListener() {} }, MutationObserver: class { observe() {} disconnect() {} } });
  assert.equal(item.renderer.getAttribute("data-yt-local-author-id"), "UCabcdefghijklmnopqrstuv");
  assert.equal(item.renderer.attributes.size, 2);
  assert.equal(item.message.textContent, "private body");
});

test("manifest injects separate classic bundles into live and replay chat frames", async () => {
  const manifest = JSON.parse(await readFile(new URL("../manifest.json", import.meta.url), "utf8"));
  const chat = manifest.content_scripts.find(script => script.js.includes("src/content/youtube-chat.js"));
  assert.equal(chat.all_frames, true);
  assert.ok(chat.matches.includes("https://www.youtube.com/live_chat*"));
  const author = manifest.content_scripts.find(script => script.js.includes("src/content/chat-author.js"));
  assert.equal(author.world, "MAIN");
  const main = manifest.content_scripts.find(script => script.js.includes("src/content/youtube.js"));
  assert.ok(main.exclude_matches.includes("https://www.youtube.com/live_chat*"));
  new Script(await bundleContent(fileURLToPath(new URL("../src/content/youtube-chat.js", import.meta.url))));
});

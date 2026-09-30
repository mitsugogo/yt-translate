import { shouldSkipChatText } from "../shared/chat-text.js";

export const CHAT_PENDING_LIMIT = 30;
export const CHAT_TRACKED_LIMIT = 200;
const RENDERERS = "yt-live-chat-text-message-renderer, yt-live-chat-paid-message-renderer";

export function readChatText(node) {
  if (node.nodeType === 3) return node.textContent || "";
  if (node.tagName === "IMG") return node.getAttribute("alt") || "";
  return [...(node.childNodes || [])].map(readChatText).join("");
}

export function readChatAuthor(renderer) {
  // Never use a display name as an ID; different viewers can share a name.
  const author = renderer.querySelector("#author-name");
  for (const node of [renderer, author]) {
    for (const name of ["data-yt-local-author-id", "author-external-channel-id", "data-author-external-channel-id", "data-author-id", "data-channel-id"]) {
      const id = node?.getAttribute(name);
      if (id) return id;
    }
  }
  const url = author?.getAttribute("href") || "";
  return /^\/(?:channel\/|@)/.test(url) ? url : "";
}

function readProse(node) {
  if (node.tagName === "IMG") return "";
  if (node.nodeType === 3) return node.textContent || "";
  return [...(node.childNodes || [])].map(readProse).join("");
}

export class ChatTranslationView {
  constructor({ doc = document, request, makeMutationObserver = (callback) => new MutationObserver(callback), makeIntersectionObserver = (callback) => new IntersectionObserver(callback), schedule = (callback) => setTimeout(callback, 100), cancel = clearTimeout } = {}) {
    this.doc = doc;
    this.request = request;
    this.makeMutationObserver = makeMutationObserver;
    this.makeIntersectionObserver = makeIntersectionObserver;
    this.schedule = schedule;
    this.cancel = cancel;
    this.settings = { enabled: false, targetLanguage: "ja" };
    this.items = new Map();
    this.pending = new Set();
    this.generation = 0;
    this.running = false;
    this.timer = null;
    this.scanTimer = null;
    this.onScroll = () => {
      if (this.scanTimer !== null) return;
      this.scanTimer = this.schedule(() => {
        this.scanTimer = null;
        this.scanVisible();
      });
    };
    this.root = null;
    this.disposed = false;
  }

  setSettings(settings) {
    settings = { ...settings, enabled: settings.enabled && settings.translateChat !== false };
    const changed = this.settings.enabled !== settings.enabled || this.settings.targetLanguage !== settings.targetLanguage;
    this.settings = settings;
    if (!changed || this.disposed) return;
    this.stop();
    if (settings.enabled) this.start();
  }

  start() {
    this.doc.addEventListener?.("scroll", this.onScroll, { capture: true, passive: true });
    this.intersections = this.makeIntersectionObserver((entries) => {
      for (const entry of entries) {
        const state = this.items.get(entry.target);
        if (!state) continue;
        state.visible = entry.isIntersecting;
        if (state.visible) this.enqueue(state);
        else this.pending.delete(state);
      }
      this.pumpSoon();
    });
    // Observe container replacement only. Individual text changes are handled
    // by the scoped items observer, without a full-page scan per comment.
    this.locator = this.makeMutationObserver(() => {
      if (!this.root?.isConnected) this.mount();
    });
    this.locator.observe(this.doc.documentElement, { childList: true, subtree: true });
    this.mount();
  }

  mount() {
    const root = this.doc.querySelector("yt-live-chat-item-list-renderer #items");
    if (!root || root === this.root) return;
    this.mutations?.disconnect();
    for (const state of this.items.values()) this.forget(state);
    this.items.clear();
    this.pending.clear();
    this.root = root;
    this.mutations = this.makeMutationObserver((records) => this.onMutations(records));
    this.mutations.observe(root, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["data-yt-local-author-id", "is-deleted"] });
    const renderers = [...root.querySelectorAll(RENDERERS)].slice(-CHAT_TRACKED_LIMIT);
    for (const renderer of renderers) this.track(renderer);
    this.scanVisible();
  }

  scanVisible() {
    if (!this.root?.isConnected || !this.doc.elementFromPoint) return;
    const rect = this.root.getBoundingClientRect();
    const top = Math.max(0, rect.top);
    const bottom = Math.min(this.doc.documentElement.clientHeight, rect.bottom);
    const x = Math.max(0, Math.min(this.doc.documentElement.clientWidth - 1, rect.left + rect.width / 2));
    // Sampling the visible viewport lets older, previously untracked rows be
    // translated on scroll without retaining or scanning the full chat history.
    for (let y = top + 1; y < bottom; y += 24) {
      const renderer = this.doc.elementFromPoint(x, y)?.closest(RENDERERS);
      if (renderer && this.root.contains(renderer)) this.track(renderer);
    }
  }

  track(renderer) {
    const message = renderer.querySelector("#message");
    if (!message || renderer.hasAttribute("is-deleted") || this.items.has(renderer)) return;
    const text = readChatText(message);
    if (!text.trim() || shouldSkipChatText(readProse(message))) return;
    const state = { renderer, message, text, authorId: readChatAuthor(renderer), visible: false, done: false, inFlight: false, render: null };
    this.items.set(renderer, state);
    this.intersections.observe(renderer);
    while (this.items.size > CHAT_TRACKED_LIMIT) {
      const oldest = this.items.values().next().value;
      this.forget(oldest);
      this.items.delete(oldest.renderer);
    }
  }

  onMutations(records) {
    const changed = new Set();
    for (const record of records) {
      const parent = record.target.nodeType === 3 ? record.target.parentElement : record.target;
      const renderer = parent.closest?.(RENDERERS);
      if (renderer) {
        if (this.items.has(renderer)) changed.add(renderer);
        else this.track(renderer);
      }
      for (const node of record.addedNodes || []) {
        if (node.nodeType !== 1) continue;
        if (node.matches(RENDERERS)) this.track(node);
        for (const item of node.querySelectorAll(RENDERERS)) this.track(item);
      }
    }
    for (const renderer of changed) {
      const state = this.items.get(renderer);
      const message = renderer.querySelector("#message");
      // Ignore our own text replacement/toggle mutations. If YouTube deletes
      // or replaces a message, invalidate it instead of resurrecting the text.
      const ownContent = state.render && state.render.wrapper.parentNode === message && message.childNodes.length === 1;
      if (!renderer.hasAttribute("is-deleted") && (ownContent || (!state.render && message === state.message && readChatText(message) === state.text))) {
        state.authorId = readChatAuthor(renderer);
        continue;
      }
      this.forget(state, false);
      this.items.delete(renderer);
      this.track(renderer);
    }
    for (const [renderer, state] of this.items) {
      if (!renderer.isConnected || !this.root.contains(renderer)) {
        this.forget(state);
        this.items.delete(renderer);
      }
    }
    this.pumpSoon();
  }

  enqueue(state) {
    if (state.done || state.inFlight || !state.renderer.isConnected) return;
    this.pending.delete(state);
    this.pending.add(state);
    if (this.pending.size > CHAT_PENDING_LIMIT) this.pending.delete(this.pending.values().next().value);
  }

  pumpSoon() {
    if (this.disposed || this.running || this.timer !== null || !this.pending.size || !this.settings.enabled) return;
    this.timer = this.schedule(() => {
      this.timer = null;
      void this.pump();
    });
  }

  async pump() {
    if (this.running || !this.settings.enabled || this.disposed) return;
    // Prefer the newest visible item and drop stale/off-screen work.
    const state = [...this.pending].reverse().find((item) => item.visible && item.renderer.isConnected);
    if (!state) { this.pending.clear(); return; }
    this.pending.delete(state);
    state.inFlight = true;
    this.running = true;
    const generation = this.generation;
    try {
      state.authorId = readChatAuthor(state.renderer);
      const result = await this.request({ text: state.text, authorId: state.authorId, targetLanguage: this.settings.targetLanguage });
      if (generation !== this.generation || this.items.get(state.renderer) !== state || !state.renderer.isConnected) return;
      if (readChatText(state.message) !== state.text) return;
      state.done = true;
      if (result?.status === "translated" && typeof result.translated === "string" && result.translated.trim() && result.translated !== state.text) this.renderTranslation(state, result.translated);
    } catch {
      state.done = true;
    } finally {
      state.inFlight = false;
      this.running = false;
      this.pumpSoon();
    }
  }

  renderTranslation(state, translated) {
    const original = this.doc.createDocumentFragment();
    while (state.message.firstChild) original.append(state.message.firstChild);
    const wrapper = this.doc.createElement("span");
    const text = this.doc.createElement("span");
    const badge = this.doc.createElement("span");
    wrapper.dataset.ytLocalChatTranslation = "";
    text.setAttribute("role", "button");
    text.setAttribute("tabindex", "0");
    text.style.cursor = "pointer";
    badge.textContent = "訳";
    badge.setAttribute("aria-hidden", "true");
    badge.style.cssText = "margin-inline-start:4px;font-size:10px;opacity:0.55;white-space:nowrap;user-select:none";
    wrapper.append(text, badge);
    const render = { original, wrapper, text, badge, translated, showingOriginal: false };
    const update = () => {
      if (render.showingOriginal) text.replaceChildren(original);
      else {
        while (text.firstChild) original.append(text.firstChild);
        text.textContent = translated;
      }
      text.setAttribute("aria-label", render.showingOriginal ? "翻訳を表示" : "原文を表示");
      text.title = render.showingOriginal ? "クリックで翻訳を表示" : "翻訳済み・クリックで原文を表示";
      badge.title = render.showingOriginal ? "原文を表示中（翻訳あり）" : "翻訳済み";
    };
    const toggle = (event) => {
      if (event.target.closest?.("a, button") || this.doc.getSelection?.()?.toString()) return;
      if (event.type === "keydown" && !["Enter", " "].includes(event.key)) return;
      event.preventDefault();
      event.stopPropagation();
      render.showingOriginal = !render.showingOriginal;
      update();
    };
    text.addEventListener("click", toggle);
    text.addEventListener("keydown", toggle);
    // Initial translated text must not become part of the saved original.
    text.textContent = translated;
    text.setAttribute("aria-label", "原文を表示");
    text.title = "翻訳済み・クリックで原文を表示";
    badge.title = "翻訳済み";
    state.render = render;
    state.message.append(wrapper);
  }

  forget(state, restore = true) {
    this.pending.delete(state);
    this.intersections?.unobserve(state.renderer);
    const render = state.render;
    if (render && restore && render.wrapper.parentNode === state.message && state.message.childNodes.length === 1) {
      if (render.showingOriginal) while (render.text.firstChild) render.original.append(render.text.firstChild);
      state.message.replaceChildren(render.original);
    }
  }

  stop() {
    this.generation += 1;
    if (this.timer !== null) this.cancel(this.timer);
    if (this.scanTimer !== null) this.cancel(this.scanTimer);
    this.timer = null;
    this.scanTimer = null;
    this.doc.removeEventListener?.("scroll", this.onScroll, true);
    this.locator?.disconnect();
    this.mutations?.disconnect();
    this.intersections?.disconnect();
    for (const state of this.items.values()) this.forget(state);
    this.items.clear();
    this.pending.clear();
    this.root = null;
  }

  dispose() {
    this.disposed = true;
    this.stop();
  }
}

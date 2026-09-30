// A small DOM fixture for exercising comment replacement and ownership without
// launching a browser or installing dependencies. Mutation/visibility events
// are delivered explicitly by tests, as they are by browser observers.
export class FixtureNode {
  constructor(tag = "", text = "") {
    this.nodeType = tag === "#text" ? 3 : tag === "#fragment" ? 11 : 1;
    this.tagName = tag.toUpperCase();
    this.value = text;
    this.childNodes = [];
    this.parentNode = null;
    this.attributes = new Map();
    this.dataset = {};
    this.style = {};
    this.listeners = {};
  }
  get parentElement() { return this.parentNode?.nodeType === 1 ? this.parentNode : null; }
  get firstChild() { return this.childNodes[0] || null; }
  get isConnected() { return this.tagName === "HTML" || Boolean(this.parentNode?.isConnected); }
  get textContent() { return this.nodeType === 3 ? this.value : this.childNodes.map(node => node.textContent).join(""); }
  set textContent(value) { this.replaceChildren(); if (value) this.append(new FixtureNode("#text", String(value))); }
  append(...nodes) {
    for (const node of nodes) {
      if (node.nodeType === 11) { this.append(...[...node.childNodes]); continue; }
      node.remove();
      node.parentNode = this;
      this.childNodes.push(node);
    }
  }
  replaceChildren(...nodes) { for (const child of [...this.childNodes]) child.remove(); this.append(...nodes); }
  remove() {
    if (this.parentNode) this.parentNode.childNodes.splice(this.parentNode.childNodes.indexOf(this), 1);
    this.parentNode = null;
  }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  hasAttribute(name) { return this.attributes.has(name); }
  matches(selector) {
    return selector.split(",").some(part => {
      part = part.trim();
      return part.startsWith("#") ? this.getAttribute("id") === part.slice(1) : this.tagName === part.toUpperCase();
    });
  }
  closest(selector) { return this.matches(selector) ? this : this.parentElement?.closest(selector) || null; }
  querySelectorAll(selector) {
    const result = [];
    for (const child of this.childNodes) {
      if (child.nodeType !== 1) continue;
      if (child.matches(selector)) result.push(child);
      result.push(...child.querySelectorAll(selector));
    }
    return result;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  contains(node) { return node === this || this.childNodes.some(child => child.contains(node)); }
  addEventListener(type, callback) { this.listeners[type] = callback; }
  fire(type, extra = {}) {
    const event = { type, target: this, preventDefault() {}, stopPropagation() {}, ...extra };
    this.listeners[type]?.(event);
  }
}

export function comment(text, authorId = "author", tag = "yt-live-chat-text-message-renderer") {
  const renderer = new FixtureNode(tag);
  renderer.setAttribute("author-external-channel-id", authorId);
  const message = new FixtureNode("span");
  message.setAttribute("id", "message");
  if (typeof text === "string") message.textContent = text;
  else message.append(...text);
  renderer.append(message);
  return { renderer, message };
}

export function fixture() {
  const html = new FixtureNode("html");
  const root = new FixtureNode("div");
  html.append(root);
  const doc = {
    documentElement: html,
    querySelector() { return root.isConnected ? root : null; },
    createElement: tag => new FixtureNode(tag),
    createDocumentFragment: () => new FixtureNode("#fragment"),
    getSelection: () => ({ toString: () => "" })
  };
  const mutations = [];
  let intersections;
  const timers = new Set();
  const options = {
    doc,
    makeMutationObserver(callback) {
      const observer = { callback, observe() {}, disconnect() { this.disconnected = true; } };
      mutations.push(observer);
      return observer;
    },
    makeIntersectionObserver(callback) {
      intersections = { callback, observe() {}, unobserve() {}, disconnect() {} };
      return intersections;
    },
    schedule(callback) { timers.add(callback); return callback; },
    cancel(callback) { timers.delete(callback); }
  };
  return {
    doc, root, options, mutations,
    visible(...renderers) { intersections.callback(renderers.map(target => ({ target, isIntersecting: true }))); },
    hidden(...renderers) { intersections.callback(renderers.map(target => ({ target, isIntersecting: false }))); },
    async flushOne() {
      const callback = timers.values().next().value;
      if (callback) { timers.delete(callback); callback(); }
      await new Promise(setImmediate);
    },
    get timerCount() { return timers.size; }
  };
}

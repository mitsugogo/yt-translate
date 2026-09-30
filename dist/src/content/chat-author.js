(() => {
"use strict";
const modules = [];
modules[0] = (() => {
// YouTube's renderer data lives in the page's JavaScript world. Expose only the
// public channel ID through the DOM so the isolated translator can use it.
const selector = "yt-live-chat-text-message-renderer, yt-live-chat-paid-message-renderer";
let root = null;
let itemsObserver = null;

function exposeAuthor(renderer) {
  const channelId = renderer.data?.authorExternalChannelId;
  if (typeof channelId === "string" && /^UC[\w-]{22}$/.test(channelId) && renderer.getAttribute("data-yt-local-author-id") !== channelId) {
    renderer.setAttribute("data-yt-local-author-id", channelId);
  }
}

function inspect(node) {
  if (node.nodeType !== 1) return;
  const renderer = node.closest(selector);
  if (renderer) exposeAuthor(renderer);
  for (const item of node.querySelectorAll(selector)) exposeAuthor(item);
}

function mount() {
  const next = document.querySelector("yt-live-chat-item-list-renderer #items");
  if (!next || next === root) return;
  itemsObserver?.disconnect();
  root = next;
  for (const item of [...root.querySelectorAll(selector)].slice(-200)) exposeAuthor(item);
  itemsObserver = new MutationObserver((records) => {
    for (const record of records) {
      const target = record.target.nodeType === 3 ? record.target.parentElement : record.target;
      const renderer = target.closest(selector);
      if (renderer) exposeAuthor(renderer);
      for (const node of record.addedNodes) inspect(node);
    }
  });
  itemsObserver.observe(root, { childList: true, subtree: true, characterData: true });
}

const locator = new MutationObserver(() => { if (!root?.isConnected) mount(); });
locator.observe(document.documentElement, { childList: true, subtree: true });
mount();
window.addEventListener("pagehide", () => { locator.disconnect(); itemsObserver?.disconnect(); }, { once: true });

return {  };
})();
})();

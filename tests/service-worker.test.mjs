import test from "node:test";
import assert from "node:assert/strict";
import { Script } from "node:vm";
import { fileURLToPath } from "node:url";
import { bundleContent } from "../scripts/bundle-content.mjs";

const defaultSettings = {
  settingsVersion: 4,
  enabled: false,
  sourceLanguage: "auto",
  autoLanguagePreference: "channel",
  targetLanguage: "ja",
  useHololiveDictionary: false,
  showOriginal: true,
  showTranslation: true,
  fontSize: 15
};

async function createServiceWorkerHarness({ captureActive = false, captureCanStop = true } = {}) {
  const source = await bundleContent(fileURLToPath(new URL("../src/background/service-worker.js", import.meta.url)));
  let settings = { ...defaultSettings };
  let activeSession = null;
  let receive;
  let onUpdated;
  let onRemoved;
  let captureRequests = 0;
  const offscreenMessages = [];
  const tabMessages = [];
  const tab = { id: 17, url: "https://www.youtube.com/watch?v=live-video" };

  const chrome = {
    runtime: {
      getURL: (path) => `chrome-extension://test-extension/${path}`,
      getContexts: async () => [{ contextType: "OFFSCREEN_DOCUMENT" }],
      onInstalled: { addListener() {} },
      onMessage: { addListener(listener) { receive = listener; } },
      async sendMessage(message) {
        if (message.target !== "offscreen") return { ok: true };
        offscreenMessages.push(message);
        if (message.type === "features:check") return { ok: true, features: {} };
        if (message.type === "session:offscreen-stop") {
          if (captureCanStop) captureActive = false;
          return { ok: true };
        }
        if (message.type === "session:start-capture") {
          captureActive = true;
          return { ok: true };
        }
        return { ok: true };
      }
    },
    offscreen: { async createDocument() {} },
    storage: {
      local: {
        async get(key) { return key === "settings" ? { settings } : {}; },
        async set(values) { if (values.settings) settings = { ...values.settings }; }
      },
      session: {
        async get(key) { return key === "activeSession" && activeSession ? { activeSession } : {}; },
        async set(values) { if (values.activeSession) activeSession = { ...values.activeSession }; },
        async remove(key) { if (key === "activeSession") activeSession = null; }
      }
    },
    tabs: {
      async get(tabId) { return tabId === tab.id ? { ...tab } : null; },
      async query() { return [{ ...tab }]; },
      async sendMessage(tabId, message) {
        tabMessages.push({ tabId, message });
        if (message.type === "page-context:request") return { ok: true, pageContext: {} };
        return { ok: true };
      },
      onRemoved: { addListener(listener) { onRemoved = listener; } },
      onUpdated: { addListener(listener) { onUpdated = listener; } }
    },
    tabCapture: {
      async getCapturedTabs() {
        return captureActive ? [{ tabId: tab.id, status: "active", fullscreen: false }] : [];
      },
      async getMediaStreamId() {
        captureRequests += 1;
        if (captureActive) throw new Error("Cannot capture a tab with an active stream.");
        captureActive = true;
        return `stream-${captureRequests}`;
      }
    }
  };

  new Script(source).runInNewContext({ chrome, self: { clients: { matchAll: async () => [] } }, URL, Error });

  function dispatch(message, sender = {}) {
    return new Promise((resolve, reject) => {
      const handled = receive(message, sender, resolve);
      if (handled !== true) reject(new Error(`Message was not handled: ${message.type}`));
    });
  }

  return {
    dispatch,
    onUpdated,
    onRemoved,
    offscreenMessages,
    tabMessages,
    get captureRequests() { return captureRequests; },
    get activeSession() { return activeSession; }
  };
}

test("concurrent enable requests share one tab capture", async () => {
  const harness = await createServiceWorkerHarness();
  const [first, second] = await Promise.all([
    harness.dispatch({ type: "settings:set-enabled", enabled: true }),
    harness.dispatch({ type: "settings:set-enabled", enabled: true })
  ]);

  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(harness.captureRequests, 1);
  assert.equal(harness.offscreenMessages.filter((message) => message.type === "session:start-capture").length, 1);
  assert.equal(harness.activeSession.videoId, "live-video");
});

test("orphaned tab capture is stopped before a new stream is requested", async () => {
  const harness = await createServiceWorkerHarness({ captureActive: true });
  const response = await harness.dispatch({ type: "settings:set-enabled", enabled: true });

  assert.equal(response.ok, true);
  assert.equal(harness.captureRequests, 1);
  assert.equal(harness.offscreenMessages[0].type, "session:offscreen-stop");
  assert.equal(harness.offscreenMessages[1].type, "session:start-capture");
});

test("active stream failures are shown as an actionable Japanese message", async () => {
  const harness = await createServiceWorkerHarness({ captureActive: true, captureCanStop: false });
  const response = await harness.dispatch({ type: "settings:set-enabled", enabled: true });

  assert.equal(response.ok, false);
  assert.equal(response.code, "capture_denied");
  assert.match(response.error, /既に取得中/);
  assert.doesNotMatch(response.error, /Cannot capture/);
});

test("a late URL update does not stop the session already started for that URL", async () => {
  const harness = await createServiceWorkerHarness();
  await harness.dispatch({ type: "settings:set-enabled", enabled: true });
  harness.onUpdated(17, { url: "https://www.youtube.com/watch?v=live-video" });
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(harness.offscreenMessages.filter((message) => message.type === "session:offscreen-stop").length, 0);
  assert.equal(harness.activeSession.videoId, "live-video");
});

test("chat frames receive the active session target and route translations through offscreen", async () => {
  const h = await createServiceWorkerHarness();
  const sender = { tab: { id: 17 }, frameId: 2, url: "https://www.youtube.com/live_chat?v=live-video" };
  assert.equal((await h.dispatch({ type: "chat:ready" }, sender)).settings.enabled, false);
  await h.dispatch({ type: "settings:set-enabled", enabled: true });
  const ready = await h.dispatch({ type: "chat:ready" }, sender);
  assert.equal(ready.settings.enabled, true);
  assert.equal(ready.settings.targetLanguage, "ja");
  await h.dispatch({ type: "chat:translate", text: "Hello", authorId: "author", targetLanguage: "ja" }, sender);
  const forwarded = h.offscreenMessages.find(message => message.type === "chat:translate");
  assert.equal(forwarded.tabId, 17);
  assert.equal(forwarded.videoId, "live-video");
  assert.equal(forwarded.text, "Hello");
  assert.equal(forwarded.targetLanguage, "ja");
});

test("chat translation ignores other tabs, stale videos and stale targets", async () => {
  const h = await createServiceWorkerHarness();
  await h.dispatch({ type: "settings:set-enabled", enabled: true });
  const senders = [
    { tab: { id: 18 }, url: "https://www.youtube.com/live_chat?v=live-video" },
    { tab: { id: 17 }, url: "https://www.youtube.com/live_chat?v=old-video" },
    { tab: { id: 17 }, url: "https://example.com/live_chat?v=live-video" }
  ];
  for (const sender of senders) {
    assert.equal((await h.dispatch({ type: "chat:translate", text: "Hello", targetLanguage: "ja" }, sender)).status, "skipped");
  }
  assert.equal((await h.dispatch({ type: "chat:translate", text: "Hello", targetLanguage: "ko" }, { tab: { id: 17 }, url: "https://www.youtube.com/live_chat?v=live-video" })).status, "skipped");
  assert.equal(h.offscreenMessages.some(message => message.type === "chat:translate"), false);
  await h.dispatch({ type: "settings:set-enabled", enabled: false });
  assert.equal((await h.dispatch({ type: "chat:ready" }, { tab: { id: 17 }, url: "https://www.youtube.com/live_chat?v=live-video" })).settings.enabled, false);
  assert.ok(h.tabMessages.some(({ message }) => message.type === "session:offscreen-settings" && message.settings.enabled === false));
});

test("chat preference is saved and blocks chat work while leaving the audio session active", async () => {
  const h = await createServiceWorkerHarness();
  const sender = { tab: { id: 17 }, url: "https://www.youtube.com/live_chat?v=live-video" };
  await h.dispatch({ type: "settings:set-enabled", enabled: true });
  assert.equal((await h.dispatch({ type: "settings:get" })).settings.translateChat, true);
  await h.dispatch({ type: "settings:updated", patch: { translateChat: false } });
  assert.equal((await h.dispatch({ type: "settings:get" })).settings.translateChat, false);
  const ready = await h.dispatch({ type: "chat:ready" }, sender);
  assert.equal(ready.settings.enabled, true);
  assert.equal(ready.settings.translateChat, false);
  assert.equal((await h.dispatch({ type: "chat:translate", text: "Hello", targetLanguage: "ja" }, sender)).status, "skipped");
  assert.equal(h.offscreenMessages.some(message => message.type === "chat:translate"), false);
  assert.equal(h.activeSession.videoId, "live-video");
  await h.dispatch({ type: "settings:updated", patch: { translateChat: true } });
  await h.dispatch({ type: "chat:translate", text: "Hello", targetLanguage: "ja" }, sender);
  assert.equal(h.offscreenMessages.some(message => message.type === "chat:translate"), true);
  assert.equal(h.captureRequests, 1);
  assert.equal(h.offscreenMessages.some(message => message.type === "session:offscreen-stop"), false);
});

import { MessageType, TranslatorState } from "../shared/messages.js";
import { DEFAULT_SETTINGS } from "../shared/settings.js";
import { getVideoId, findTranslationInsertionPoint } from "./youtube-dom.js";
import { readYoutubePageContext } from "./channel-language.js";
import { YoutubeNavigation } from "./youtube-navigation.js";
import { TranslationPanel } from "../ui/translation-panel.js";

let currentVideoId = null;
let panel = null;
let settings = DEFAULT_SETTINGS;
let mountTimer = null;
let dismissedVideoId = null;
let observer = null;
let navigation = null;
let disposed = false;

function hasValidExtensionContext() {
  try {
    return typeof chrome !== "undefined" && Boolean(chrome.runtime?.id);
  } catch {
    return false;
  }
}

function disposeContentScript() {
  if (disposed) return;
  disposed = true;
  if (mountTimer) clearTimeout(mountTimer);
  mountTimer = null;
  observer?.disconnect();
  navigation?.dispose();
  removePanel();
}

async function send(message) {
  if (!hasValidExtensionContext()) {
    disposeContentScript();
    return { ok: false, code: "context_invalidated", error: "拡張機能が更新されました。YouTubeページを再読み込みしてください。" };
  }
  try {
    return await chrome.runtime.sendMessage(message);
  } catch (error) {
    if (!hasValidExtensionContext() || /Extension context invalidated/i.test(error?.message || "")) disposeContentScript();
    return { ok: false, error: error instanceof Error ? error.message : "拡張機能と通信できませんでした。" };
  }
}

function removePanel() {
  panel?.remove();
  panel = null;
}

function mountPanel() {
  if (disposed) return;
  if (!hasValidExtensionContext()) {
    disposeContentScript();
    return;
  }
  if (!settings.enabled || !currentVideoId || dismissedVideoId === currentVideoId || panel?.host?.isConnected) return;
  const insertionPoint = findTranslationInsertionPoint();
  if (!insertionPoint) {
    if (mountTimer) clearTimeout(mountTimer);
    mountTimer = setTimeout(() => {
      mountTimer = null;
      mountPanel();
    }, 500);
    return;
  }
  panel = new TranslationPanel({
    onDismiss: () => {
      dismissedVideoId = currentVideoId;
      const videoId = currentVideoId;
      removePanel();
      void send({ type: MessageType.STOP, videoId, reason: "dismiss" });
    }
  });
  if (!panel.mount(insertionPoint)) {
    panel = null;
    return;
  }
  panel.setVideoId(currentVideoId);
  panel.setSettings(settings);
  void send({ type: MessageType.REQUEST_FEATURES });
}

async function handleNavigation({ videoId, previous }) {
  if (disposed) return;
  if (previous.videoId && previous.videoId !== videoId) await send({ type: MessageType.STOP, videoId: previous.videoId, reason: "navigation" });
  currentVideoId = videoId;
  dismissedVideoId = null;
  removePanel();
  if (videoId) {
    mountPanel();
    void send({ type: MessageType.CONTENT_READY, videoId, pageContext: readYoutubePageContext() });
  }
}

function handleRuntimeMessage(message, _sender, sendResponse) {
  if (disposed) return;
  if (message.type === MessageType.REQUEST_PAGE_CONTEXT) {
    sendResponse({ ok: true, pageContext: readYoutubePageContext() });
    return;
  }
  if (message.type === MessageType.OFFSCREEN_SETTINGS && message.settings) {
    settings = message.settings;
    if (settings.enabled) {
      dismissedVideoId = null;
      mountPanel();
      panel?.setSettings(settings);
    } else {
      dismissedVideoId = null;
      removePanel();
    }
    return;
  }
  if (message.type === MessageType.OFFSCREEN_FEATURES) {
    panel?.setFeatures(message.features);
    return;
  }
  if ([MessageType.OFFSCREEN_STATE, MessageType.OFFSCREEN_TRANSCRIPT, MessageType.OFFSCREEN_TRANSLATION, MessageType.OFFSCREEN_ERROR].includes(message.type) && message.videoId && message.videoId !== currentVideoId) return;
  if (message.type === MessageType.OFFSCREEN_STATE) panel?.setState(message.state, message.detail, message.progress);
  if (message.type === MessageType.OFFSCREEN_TRANSCRIPT) panel?.setTranscript(message.original, message.isFinal, message.id);
  if (message.type === MessageType.OFFSCREEN_TRANSLATION) {
    panel?.setTranslationResult(message.original, message.translated, message.id, message.isFinal !== false);
  }
  if (message.type === MessageType.OFFSCREEN_ERROR) panel?.setError(message.message || "音声認識・翻訳処理に失敗しました。");
}

if (hasValidExtensionContext()) chrome.runtime.onMessage.addListener(handleRuntimeMessage);

observer = new MutationObserver(() => {
  if (!hasValidExtensionContext()) {
    disposeContentScript();
    return;
  }
  if (currentVideoId && !panel?.host?.isConnected) mountPanel();
});
observer.observe(document.documentElement, { childList: true, subtree: true });

navigation = new YoutubeNavigation(handleNavigation);
navigation.start();

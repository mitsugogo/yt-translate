import { MessageType, TranslatorState } from "../shared/messages.js";
import { DEFAULT_SETTINGS, getVideoId, isYouTubeVideoUrl, readSettings, writeSettings } from "../shared/settings.js";

const OFFSCREEN_PATH = "src/offscreen/offscreen.html";
let activeSession = null;
let sessionLoaded = false;
let sessionLoadPromise = null;
let offscreenCreation = null;

async function loadSession() {
  if (sessionLoaded) return activeSession;
  if (!sessionLoadPromise) {
    sessionLoadPromise = chrome.storage.session.get("activeSession").then((result) => {
      activeSession = result.activeSession || null;
      sessionLoaded = true;
      return activeSession;
    });
  }
  return sessionLoadPromise;
}

async function saveSession(value) {
  activeSession = value;
  sessionLoaded = true;
  if (value) await chrome.storage.session.set({ activeSession: value });
  else await chrome.storage.session.remove("activeSession");
}

async function hasOffscreenDocument() {
  const url = chrome.runtime.getURL(OFFSCREEN_PATH);
  if (typeof chrome.runtime.getContexts === "function") {
    const contexts = await chrome.runtime.getContexts({ contextTypes: ["OFFSCREEN_DOCUMENT"], documentUrls: [url] });
    return contexts.length > 0;
  }
  const clients = await self.clients.matchAll();
  return clients.some((client) => client.url === url);
}

async function ensureOffscreenDocument() {
  if (await hasOffscreenDocument()) return;
  if (!offscreenCreation) {
    offscreenCreation = chrome.offscreen.createDocument({
      url: OFFSCREEN_PATH,
      reasons: ["USER_MEDIA"],
      justification: "Keep the captured YouTube audio stream and local speech recognition alive outside the service worker."
    }).finally(() => {
      offscreenCreation = null;
    });
  }
  await offscreenCreation;
}

async function sendToOffscreen(message) {
  await ensureOffscreenDocument();
  return chrome.runtime.sendMessage({ ...message, target: "offscreen" });
}

async function sendToTab(tabId, message) {
  try {
    return await chrome.tabs.sendMessage(tabId, message);
  } catch {
    // The content script may not be ready during a YouTube navigation.
    return null;
  }
}

async function getPageContext(tabId, provided = null) {
  if (provided?.channelLanguageHint) return provided;
  const response = await sendToTab(tabId, { type: MessageType.REQUEST_PAGE_CONTEXT });
  return response?.pageContext || provided || {};
}

async function broadcastExtensionPage(message) {
  try {
    await chrome.runtime.sendMessage(message);
  } catch {
    // The popup is normally closed while the background pipeline is running.
  }
}

function currentSessionForTab(tabId, videoId) {
  return activeSession && activeSession.tabId === tabId && (!videoId || activeSession.videoId === videoId);
}

async function stopForTab(tabId, videoId) {
  await loadSession();
  if (!currentSessionForTab(tabId, videoId)) return { ok: true };
  await sendToOffscreen({ type: MessageType.OFFSCREEN_STOP });
  await saveSession(null);
  await sendToTab(tabId, { type: MessageType.OFFSCREEN_STATE, state: TranslatorState.IDLE, videoId });
  return { ok: true };
}

async function getTab(tabId) {
  try {
    return await chrome.tabs.get(tabId);
  } catch {
    return null;
  }
}

async function startForTab(tabId, requestedVideoId, providedPageContext = null) {
  const tab = await getTab(tabId);
  if (!tab || !isYouTubeVideoUrl(tab.url || "")) {
    return { ok: false, error: "YouTubeの動画またはライブのページを開いてください。" };
  }
  const videoId = requestedVideoId || getVideoId(tab.url);
  if (!videoId) return { ok: false, error: "現在のタブでYouTube動画を確認できませんでした。" };

  await loadSession();
  if (activeSession) await stopForTab(activeSession.tabId, activeSession.videoId);
  const settings = await readSettings();
  const pageContext = await getPageContext(tabId, providedPageContext);
  await sendToTab(tabId, { type: MessageType.OFFSCREEN_STATE, state: TranslatorState.INITIALIZING, videoId });
  let streamId;
  try {
    streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tabId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Chromeがタブ音声の取得を許可しませんでした。";
    await sendToTab(tabId, { type: MessageType.OFFSCREEN_ERROR, videoId, code: "capture_denied", message: `タブ音声を取得できませんでした。拡張機能を開いて有効化し直してください。（${message}）` });
    return { ok: false, error: message, code: "capture_denied" };
  }

  const nextSession = { tabId, videoId, pageContext };
  await saveSession(nextSession);
  try {
    const result = await sendToOffscreen({ type: MessageType.START_CAPTURE, tabId, videoId, streamId, settings, pageContext });
    if (!result?.ok) {
      await saveSession(null);
      await sendToTab(tabId, { type: MessageType.OFFSCREEN_ERROR, videoId, code: result?.code || "start_failed", message: result?.error || "音声認識・翻訳を開始できませんでした。" });
      return result || { ok: false, error: "音声認識・翻訳を開始できませんでした。" };
    }
    return { ok: true };
  } catch (error) {
    await saveSession(null);
    const message = error instanceof Error ? error.message : "音声処理用ページを起動できませんでした。";
    await sendToTab(tabId, { type: MessageType.OFFSCREEN_ERROR, videoId, code: "start_failed", message });
    return { ok: false, error: message };
  }
}

async function requestFeatures(tabId, settings) {
  try {
    const result = await sendToOffscreen({ type: MessageType.CHECK_FEATURES, settings });
    await sendToTab(tabId, { type: MessageType.OFFSCREEN_FEATURES, features: result?.features || null });
    return result;
  } catch (error) {
    await sendToTab(tabId, { type: MessageType.OFFSCREEN_ERROR, code: "feature_check_failed", message: error instanceof Error ? error.message : "音声認識・翻訳機能の確認に失敗しました。" });
    return { ok: false, error: "音声認識・翻訳機能の確認に失敗しました。" };
  }
}

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tabs[0] || null;
}

chrome.runtime.onInstalled.addListener(async () => {
  const existing = await chrome.storage.local.get("settings");
  if (!existing.settings) await chrome.storage.local.set({ settings: DEFAULT_SETTINGS });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.target === "offscreen") return false;
  (async () => {
    const settings = await readSettings();
    if (message.type === MessageType.CONTENT_READY) {
      const tabId = sender.tab?.id;
      const videoId = message.videoId || getVideoId(sender.tab?.url || "");
      if (tabId !== undefined) {
        await sendToTab(tabId, { type: MessageType.OFFSCREEN_SETTINGS, settings });
        await requestFeatures(tabId, settings);
        await loadSession();
        if (settings.enabled && videoId && !activeSession) {
          await startForTab(tabId, videoId, message.pageContext);
        } else if (currentSessionForTab(tabId, videoId)) {
          await sendToTab(tabId, { type: MessageType.OFFSCREEN_STATE, state: TranslatorState.LISTENING, videoId });
        }
      }
      sendResponse({ ok: true, settings, session: activeSession });
      return;
    }
    if (message.type === MessageType.GET_SETTINGS) {
      sendResponse({ ok: true, settings });
      return;
    }
    if (message.type === MessageType.GET_POPUP_STATE) {
      await loadSession();
      const tab = await getActiveTab();
      const activeTabSession = tab && currentSessionForTab(tab.id, getVideoId(tab.url || "")) ? activeSession : null;
      const features = tab && isYouTubeVideoUrl(tab.url || "") ? await requestFeatures(tab.id, settings) : null;
      sendResponse({ ok: true, settings, session: activeTabSession, features: features?.features || null, tab: tab ? { id: tab.id, url: tab.url } : null });
      return;
    }
    if (message.type === MessageType.SETTINGS_UPDATED) {
      const updated = await writeSettings(message.patch || message.settings || {});
      await loadSession();
      if (activeSession) {
        const result = await sendToOffscreen({ type: MessageType.OFFSCREEN_SETTINGS, tabId: activeSession.tabId, settings: updated, pageContext: activeSession.pageContext });
        if (!result?.ok) await sendToTab(activeSession.tabId, { type: MessageType.OFFSCREEN_ERROR, videoId: activeSession.videoId, code: result?.code || "settings_update_failed", message: result?.error || "言語モデルを変更できませんでした。" });
        await sendToTab(activeSession.tabId, { type: MessageType.OFFSCREEN_SETTINGS, settings: updated });
      }
      sendResponse({ ok: true, settings: updated });
      return;
    }
    if (message.type === MessageType.SET_ENABLED) {
      const updated = await writeSettings({ enabled: message.enabled === true });
      const tab = await getActiveTab();
      if (updated.enabled && tab?.id !== undefined) {
        const result = await startForTab(tab.id);
        if (!result.ok) {
          const reverted = await writeSettings({ enabled: false });
          sendResponse({ ...result, settings: reverted });
        } else {
          sendResponse({ ...result, settings: updated });
        }
      } else {
        await loadSession();
        if (activeSession) await stopForTab(activeSession.tabId, activeSession.videoId);
        sendResponse({ ok: true, settings: updated });
      }
      return;
    }
    if (message.type === MessageType.PREPARE_MODELS) {
      const tab = await getActiveTab();
      const result = await sendToOffscreen({ type: MessageType.PREPARE_MODELS, settings, tabId: tab?.id, videoId: getVideoId(tab?.url || "") });
      sendResponse(result);
      return;
    }
    if (message.type === MessageType.REQUEST_FEATURES) {
      const tabId = sender.tab?.id;
      if (tabId !== undefined) sendResponse(await requestFeatures(tabId, settings));
      else sendResponse({ ok: false, error: "YouTubeのタブが見つかりません。" });
      return;
    }
    if (message.type === MessageType.START) {
      const tabId = sender.tab?.id;
      if (tabId === undefined) {
        sendResponse({ ok: false, error: "YouTubeのタブまたは拡張機能から開始してください。" });
        return;
      }
      await writeSettings({ enabled: true });
      const result = await startForTab(tabId, message.videoId, message.pageContext);
      if (!result.ok) await writeSettings({ enabled: false });
      sendResponse(result);
      return;
    }
    if (message.type === MessageType.STOP) {
      const tabId = sender.tab?.id;
      if (tabId === undefined) {
        sendResponse({ ok: false, error: "YouTubeのタブが見つかりません。" });
        return;
      }
      if (message.reason !== "navigation") await writeSettings({ enabled: false });
      sendResponse(await stopForTab(tabId, message.videoId));
      return;
    }
    if (message.type === MessageType.OFFSCREEN_STATE || message.type === MessageType.OFFSCREEN_TRANSCRIPT || message.type === MessageType.OFFSCREEN_TRANSLATION || message.type === MessageType.OFFSCREEN_ERROR) {
      await loadSession();
      if (activeSession && activeSession.tabId === message.tabId && activeSession.videoId === message.videoId) {
        const forwarded = { ...message };
        delete forwarded.tabId;
        await sendToTab(activeSession.tabId, forwarded);
        if (message.type === MessageType.OFFSCREEN_STATE && (message.state === TranslatorState.ERROR || message.state === TranslatorState.IDLE)) await saveSession(null);
      }
      if (message.type === MessageType.OFFSCREEN_STATE || message.type === MessageType.OFFSCREEN_ERROR) {
        const forwarded = { ...message };
        delete forwarded.tabId;
        await broadcastExtensionPage(forwarded);
      }
      sendResponse({ ok: true });
      return;
    }
    sendResponse({ ok: false, error: "Unknown message." });
  })().catch((error) => sendResponse({ ok: false, error: error instanceof Error ? error.message : "拡張機能で予期しないエラーが発生しました。" }));
  return true;
});

chrome.tabs.onRemoved.addListener((tabId) => {
  void stopForTab(tabId);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.url) void stopForTab(tabId);
});

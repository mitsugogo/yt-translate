import { MessageType, TranslatorState } from "../shared/messages.js";
import { DEFAULT_SETTINGS, getSpeechLanguagesForSource, normalizeSettings, resolveAutoLanguagePriority, shouldTranslateSource } from "../shared/settings.js";
import { checkSpeechLanguages, ensureSpeechLanguages } from "../speech/speech-language.js";
import { MultilingualSpeechRecognizer } from "../speech/multilingual-speech-recognizer.js";
import { LocalLanguageDetector } from "../translation/language-detector.js";
import { MixedLanguageTranslator } from "../translation/mixed-language-translator.js";
import { TranslationQueue } from "../translation/translation-queue.js";

let session = null;

function send(message) {
  return chrome.runtime.sendMessage(message).catch(() => undefined);
}

function sendState({ tabId, videoId, state, detail = "", progress = null }) {
  const message = {
    type: MessageType.OFFSCREEN_STATE,
    tabId,
    videoId,
    state,
    detail
  };
  if (Number.isFinite(progress)) message.progress = Math.min(1, Math.max(0, progress));
  void send(message);
}

function reportState(state, detail = "", progress = null) {
  if (!session) return;
  sendState({ tabId: session.tabId, videoId: session.videoId, state, detail, progress });
}

function reportError(error, fallbackCode = "failed") {
  const code = error?.code || fallbackCode;
  const message = error?.message || "音声認識・翻訳処理に失敗しました。";
  if (session) {
    void send({
      type: MessageType.OFFSCREEN_ERROR,
      tabId: session.tabId,
      videoId: session.videoId,
      code,
      message
    });
  }
}

async function getFeatureReport(settings = DEFAULT_SETTINGS) {
  const speech = await checkSpeechLanguages({ languages: getSpeechLanguagesForSource(settings.sourceLanguage) });
  const translator = new MixedLanguageTranslator();
  const translation = await translator.checkAvailability(settings.sourceLanguage, settings.targetLanguage);
  const translationReports = translation.translations;
  const unavailableTranslation = translationReports.find((report) => !report.supported || report.status === "unavailable");
  const downloadableTranslation = translationReports.find((report) => report.status !== "available");
  return {
    speech: {
      supported: speech.supported,
      local: speech.local,
      status: speech.status,
      message: speech.message
    },
    translator: {
      supported: !unavailableTranslation,
      status: unavailableTranslation ? "unavailable" : downloadableTranslation?.status || "available",
      message: unavailableTranslation?.message || ""
    },
    languageDetector: translation.detector,
    audioTrackInput: "experimental"
  };
}

async function stopSession() {
  const previous = session;
  session = null;
  if (!previous) return;
  previous.queue?.clear();
  await previous.recognizer?.stop();
  previous.stream?.getTracks?.().forEach((track) => track.stop());
  previous.translator?.reset();
}

async function startSession(message) {
  await stopSession();
  const settings = normalizeSettings(message.settings);
  const pageContext = message.pageContext || {};
  const preferredLanguages = settings.sourceLanguage === "auto"
    ? resolveAutoLanguagePriority(settings.autoLanguagePreference, pageContext.channelLanguagePriority, pageContext.channelLanguageHint)
    : [];
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      mandatory: {
        chromeMediaSource: "tab",
        chromeMediaSourceId: message.streamId
      }
    },
    video: false
  });

  const current = {
    tabId: message.tabId,
    videoId: message.videoId,
    settings,
    pageContext,
    preferredLanguages,
    stream,
    recognizer: null,
    translator: null,
    queue: null
  };
  session = current;

  const detector = new LocalLanguageDetector({
    onState: (state, detail) => reportState(state, detail),
    onProgress: (progress, detail) => reportState(TranslatorState.DOWNLOADING, `${detail} ${Math.round(progress * 100)}%`, progress)
  });
  current.translator = new MixedLanguageTranslator({
    detector,
    onState: (state, detail) => reportState(state, detail),
    onProgress: (progress, detail) => reportState(TranslatorState.DOWNLOADING, `${detail} ${Math.round(progress * 100)}%`, progress)
  });
  current.queue = new TranslationQueue({
    translator: {
      translate: (text, item) => current.translator.translate(text, item.sourceLanguage, current.settings.targetLanguage, {
        useHololiveVocabulary: current.settings.useHololiveDictionary
      })
    },
    onResult: ({ id, text, translated, timestamp, sourceLanguage, isProvisional }) => {
      if (session !== current) return;
      void send({ type: MessageType.OFFSCREEN_TRANSLATION, tabId: current.tabId, videoId: current.videoId, id, original: text, translated, sourceLanguage, timestamp, isFinal: !isProvisional });
    },
    onError: ({ error }) => reportError(error, "failed")
  });
  current.recognizer = new MultilingualSpeechRecognizer({
    detector,
    onState: (state, detail) => reportState(state, detail),
    onInterim: ({ text, sourceLanguage, timestamp }) => {
      if (session !== current) return;
      void send({ type: MessageType.OFFSCREEN_TRANSCRIPT, tabId: current.tabId, videoId: current.videoId, id: "interim", original: text, sourceLanguage, isFinal: false, timestamp });
    },
    onFinal: ({ text, sourceLanguage, timestamp, isProvisional }) => {
      if (session !== current) return;
      const id = crypto.randomUUID();
      const willTranslate = shouldTranslateSource(sourceLanguage, current.settings.targetLanguage);
      void send({ type: MessageType.OFFSCREEN_TRANSCRIPT, tabId: current.tabId, videoId: current.videoId, id, original: text, sourceLanguage, isFinal: !isProvisional, willTranslate, timestamp });
      if (willTranslate) current.queue.enqueue({ id, text, sourceLanguage, timestamp, isProvisional });
    },
    onError: (error) => reportError(error, "start_failed")
  });

  reportState(TranslatorState.INITIALIZING);
  try {
    await current.recognizer.start(stream, { ...settings, preferredLanguages, channelMember: pageContext.channelMember });
    await current.translator.prepare(settings.sourceLanguage, settings.targetLanguage);
  } catch (error) {
    await stopSession();
    throw error;
  }
  if (session === current) reportState(TranslatorState.LISTENING);
  return { ok: true };
}

async function updateSettings(message) {
  if (!session || session.tabId !== message.tabId) return { ok: true };
  const next = normalizeSettings(message.settings);
  const pageContext = message.pageContext || session.pageContext || {};
  const preferredLanguages = next.sourceLanguage === "auto"
    ? resolveAutoLanguagePriority(next.autoLanguagePreference, pageContext.channelLanguagePriority, pageContext.channelLanguageHint)
    : [];
  const speechChanged = next.sourceLanguage !== session.settings.sourceLanguage
    || preferredLanguages.join(",") !== session.preferredLanguages.join(",")
    || next.useHololiveDictionary !== session.settings.useHololiveDictionary
    || pageContext.channelMember !== session.pageContext.channelMember;
  const translationChanged = next.sourceLanguage !== session.settings.sourceLanguage
    || next.targetLanguage !== session.settings.targetLanguage;
  session.settings = next;
  session.pageContext = pageContext;
  session.preferredLanguages = preferredLanguages;
  if (!speechChanged && !translationChanged) return { ok: true };
  reportState(TranslatorState.INITIALIZING, "設定変更を反映中…");
  if (translationChanged) {
    session.translator.reset();
    session.queue.clear();
  }
  if (speechChanged) await session.recognizer.updateSettings({ ...next, preferredLanguages, channelMember: pageContext.channelMember });
  if (translationChanged) await session.translator.prepare(next.sourceLanguage, next.targetLanguage);
  reportState(TranslatorState.LISTENING);
  return { ok: true };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.target !== "offscreen") return false;
  if (message.type === MessageType.CHECK_FEATURES) {
    getFeatureReport(normalizeSettings(message.settings)).then((features) => sendResponse({ ok: true, features })).catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }
  if (message.type === MessageType.START_CAPTURE) {
    startSession(message).then((result) => sendResponse(result)).catch((error) => sendResponse({ ok: false, error: error.message, code: error.code }));
    return true;
  }
  if (message.type === MessageType.OFFSCREEN_STOP) {
    stopSession().then(() => sendResponse({ ok: true }));
    return true;
  }
  if (message.type === MessageType.OFFSCREEN_SETTINGS) {
    updateSettings(message).then((result) => sendResponse(result)).catch((error) => sendResponse({ ok: false, error: error.message, code: error.code }));
    return true;
  }
  if (message.type === MessageType.PREPARE_MODELS) {
    const settings = normalizeSettings(message.settings);
    const translator = new MixedLanguageTranslator({
      onState: (state, detail) => sendState({ tabId: message.tabId, videoId: message.videoId, state, detail }),
      onProgress: (progress, detail) => sendState({ tabId: message.tabId, videoId: message.videoId, state: TranslatorState.DOWNLOADING, detail: `${detail} ${Math.round(progress * 100)}%`, progress })
    });
    (async () => {
      const speechLanguages = getSpeechLanguagesForSource(settings.sourceLanguage);
      await ensureSpeechLanguages({ languages: speechLanguages,
        onState: (state, progress) => sendState({ tabId: message.tabId, videoId: message.videoId, state, detail: `音声認識モデルを準備中（${progress.index + 1}/${progress.total}）` }) });
      await translator.prepare(settings.sourceLanguage, settings.targetLanguage);
      sendState({ tabId: message.tabId, videoId: message.videoId, state: TranslatorState.IDLE, detail: "音声認識・翻訳モデルの準備が完了しました。" });
      sendResponse({ ok: true });
    })().catch((error) => {
      sendState({ tabId: message.tabId, videoId: message.videoId, state: TranslatorState.ERROR, detail: error.message });
      sendResponse({ ok: false, error: error.message, code: error.code });
    });
    return true;
  }
  return false;
});

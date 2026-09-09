import { MessageType } from "../shared/messages.js";
import { DEFAULT_SETTINGS, formatActiveTranslationStatus, formatLanguageDirection, getTargetLanguageForSource, normalizeSettings } from "../shared/settings.js";

const elements = {
  enabled: document.querySelector("#enabled"),
  sourceLanguage: document.querySelector("#sourceLanguage"),
  autoLanguagePreference: document.querySelector("#autoLanguagePreference"),
  targetLanguage: document.querySelector("#targetLanguage"),
  showOriginal: document.querySelector("#showOriginal"),
  showTranslation: document.querySelector("#showTranslation"),
  fontSize: document.querySelector("#fontSize"),
  status: document.querySelector("#status"),
  error: document.querySelector("#error"),
  prepare: document.querySelector("#prepare"),
  progress: document.querySelector("#progress"),
  progressTrack: document.querySelector("#progressTrack"),
  progressBar: document.querySelector("#progressBar"),
  progressLabel: document.querySelector("#progressLabel")
};

let settings = DEFAULT_SETTINGS;
let detectedLanguage = null;
let popupTabId = null;
let pipelineState = "idle";

function send(message) {
  return chrome.runtime.sendMessage(message).catch((error) => ({ ok: false, error: error.message }));
}

function setError(message = "") {
  elements.error.textContent = message;
  elements.error.hidden = !message;
  if (message) {
    setProgress(null, false);
    elements.status.textContent = "開始できませんでした。下のエラー内容を確認してください。";
  }
}

function setProgress(progress = null, visible = true, detail = "") {
  const hasProgress = Number.isFinite(progress);
  const bounded = hasProgress ? Math.min(1, Math.max(0, progress)) : 0;
  const complete = hasProgress && bounded >= 1;
  elements.progress.hidden = !visible || complete;
  if (!visible || complete) return;
  elements.progressBar.classList.toggle("indeterminate", !hasProgress);
  elements.progressBar.style.width = hasProgress ? `${Math.round(bounded * 100)}%` : "38%";
  if (hasProgress) elements.progressTrack.setAttribute("aria-valuenow", String(Math.round(bounded * 100)));
  else elements.progressTrack.removeAttribute("aria-valuenow");
  elements.progressLabel.textContent = detail || (hasProgress ? `${Math.round(bounded * 100)}%` : "準備中…");
}

function applySettings(next) {
  settings = normalizeSettings(next);
  elements.enabled.checked = settings.enabled;
  elements.sourceLanguage.value = settings.sourceLanguage;
  elements.autoLanguagePreference.value = settings.autoLanguagePreference;
  syncTargetOptions(settings.targetLanguage);
  elements.showOriginal.checked = settings.showOriginal;
  elements.showTranslation.checked = settings.showTranslation;
  elements.fontSize.value = String(settings.fontSize);
}

function syncTargetOptions(preferredTarget = elements.targetLanguage.value) {
  const sourceLanguage = elements.sourceLanguage.value.split("-")[0];
  elements.autoLanguagePreference.disabled = sourceLanguage !== "auto";
  for (const option of elements.targetLanguage.options) option.disabled = sourceLanguage !== "auto" && option.value === sourceLanguage;
  elements.targetLanguage.value = sourceLanguage !== "auto" && preferredTarget === sourceLanguage ? getTargetLanguageForSource(elements.sourceLanguage.value) : preferredTarget;
}

function describeFeatures(features) {
  if (!features) return "YouTubeの動画ページを開いてください。";
  if (!features.speech?.local || features.speech?.status === "unavailable") return features.speech?.message || "この環境では端末内の音声認識を利用できません。";
  if (!features.translator?.supported || features.translator?.status === "unavailable") return features.translator?.message || "この環境ではChromeの翻訳機能を利用できません。";
  if (features.speech.status !== "available" || features.translator.status !== "available") return "初回利用には音声認識・翻訳モデルの準備が必要です。";
  return `準備完了 · ${formatLanguageDirection(settings.sourceLanguage, settings.targetLanguage)}`;
}

function showActiveStatus(nextDetectedLanguage = detectedLanguage) {
  detectedLanguage = nextDetectedLanguage;
  const sourceLanguage = detectedLanguage || (settings.sourceLanguage === "auto" ? null : settings.sourceLanguage);
  elements.status.textContent = formatActiveTranslationStatus(sourceLanguage, settings.targetLanguage);
}

async function refresh() {
  const response = await send({ type: MessageType.GET_POPUP_STATE });
  if (!response?.ok) {
    setError(response?.error || "拡張機能の状態を取得できませんでした。");
    return;
  }
  applySettings(response.settings);
  popupTabId = response.tab?.id ?? null;
  detectedLanguage = response.session?.detectedLanguage || null;
  elements.status.textContent = describeFeatures(response.features);
  if (response.session) {
    pipelineState = "listening";
    showActiveStatus();
  }
}

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === MessageType.OFFSCREEN_STATE) {
    if (message.state === "downloading" && (pipelineState === "listening" || pipelineState === "error")) return;
    pipelineState = message.state;
    if (message.state === "downloading" && elements.error.hidden) setProgress(message.progress, true, message.detail);
    else if (message.state === "listening" || message.state === "idle" || message.state === "error") {
      setProgress(null, false);
      if (message.state === "listening") showActiveStatus(message.detectedLanguage || detectedLanguage);
    }
  }
  if (message.type === MessageType.POPUP_LANGUAGE && message.tabId === popupTabId) showActiveStatus(message.detectedLanguage);
  if (message.type === MessageType.OFFSCREEN_ERROR) {
    pipelineState = "error";
    setProgress(null, false);
    setError(message.message || "音声認識・翻訳処理に失敗しました。");
  }
});

elements.enabled.addEventListener("change", async () => {
  setError();
  elements.enabled.disabled = true;
  elements.prepare.disabled = true;
  elements.status.textContent = elements.enabled.checked ? "音声の取得を開始中…" : "停止中…";
  pipelineState = elements.enabled.checked ? "initializing" : "idle";
  const response = await send({ type: MessageType.SET_ENABLED, enabled: elements.enabled.checked });
  if (!response?.ok) {
    elements.enabled.checked = false;
    setError(response?.error || "翻訳の有効・無効を切り替えられませんでした。");
  }
  if (response?.settings) applySettings(response.settings);
  if (response?.error) setError(response.error);
  if (response?.ok) {
    if (elements.enabled.checked) {
      detectedLanguage = null;
      setProgress(null, false);
      showActiveStatus();
    } else {
      detectedLanguage = null;
      elements.status.textContent = "翻訳を停止しました。";
    }
  }
  if (!response?.ok || !elements.enabled.checked) setProgress(null, false);
  elements.enabled.disabled = false;
  elements.prepare.disabled = false;
});

for (const element of [elements.showOriginal, elements.showTranslation, elements.fontSize, elements.sourceLanguage, elements.autoLanguagePreference, elements.targetLanguage]) {
  element.addEventListener("change", async () => {
    if (element === elements.sourceLanguage) syncTargetOptions();
    const preparesModels = settings.enabled && [elements.sourceLanguage, elements.autoLanguagePreference, elements.targetLanguage].includes(element);
    if (preparesModels) {
      setError();
      pipelineState = "initializing";
      elements.status.textContent = "設定に合う音声認識・翻訳モデルを準備中…";
      setProgress(null, true);
    }
    const patch = {
      showOriginal: elements.showOriginal.checked,
      showTranslation: elements.showTranslation.checked,
      fontSize: Number(elements.fontSize.value),
      sourceLanguage: elements.sourceLanguage.value,
      autoLanguagePreference: elements.autoLanguagePreference.value,
      targetLanguage: elements.targetLanguage.value
    };
    const response = await send({ type: MessageType.SETTINGS_UPDATED, patch });
    if (response?.settings) applySettings(response.settings);
    if (!response?.ok) setError(response?.error || "設定を保存できませんでした。");
    else if (settings.enabled) {
      if (preparesModels) setProgress(null, false);
      if (element === elements.sourceLanguage) detectedLanguage = null;
      showActiveStatus();
    }
  });
}

elements.prepare.addEventListener("click", async () => {
  setError();
  elements.prepare.disabled = true;
  elements.enabled.disabled = true;
  elements.status.textContent = "音声認識・翻訳モデルを準備中…";
  pipelineState = "initializing";
  setProgress(null, true);
  const response = await send({ type: MessageType.PREPARE_MODELS });
  if (!response?.ok) {
    setProgress(null, false);
    setError(response?.error || "音声認識・翻訳モデルの準備に失敗しました。");
  } else {
    setProgress(null, false);
    elements.status.textContent = "音声認識・翻訳モデルの準備が完了しました。翻訳を有効にしてください。";
  }
  elements.prepare.disabled = false;
  elements.enabled.disabled = false;
});

void refresh();

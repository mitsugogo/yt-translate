export const DEFAULT_SETTINGS = Object.freeze({
  settingsVersion: 3,
  enabled: false,
  sourceLanguage: "auto",
  autoLanguagePreference: "channel",
  targetLanguage: "ja",
  showOriginal: true,
  showTranslation: true,
  fontSize: 15
});

export const SOURCE_LANGUAGE_OPTIONS = Object.freeze([
  Object.freeze({ value: "auto", label: "自動（日本語・英語・インドネシア語）" }),
  Object.freeze({ value: "en-US", label: "English" }),
  Object.freeze({ value: "ja-JP", label: "Japanese" }),
  Object.freeze({ value: "id-ID", label: "Bahasa Indonesia" })
]);

export const TARGET_LANGUAGE_OPTIONS = Object.freeze([
  Object.freeze({ value: "en", label: "English" }),
  Object.freeze({ value: "ja", label: "Japanese" }),
  Object.freeze({ value: "id", label: "Bahasa Indonesia" })
]);

export const AUTO_SPEECH_LANGUAGES = Object.freeze(["ja-JP", "en-US", "id-ID"]);

export const AUTO_LANGUAGE_PREFERENCE_OPTIONS = Object.freeze([
  Object.freeze({ value: "channel", label: "チャンネルから推定" }),
  Object.freeze({ value: "ja", label: "日本語" }),
  Object.freeze({ value: "en", label: "英語" }),
  Object.freeze({ value: "id", label: "インドネシア語" }),
  Object.freeze({ value: "none", label: "優先なし" })
]);

const SOURCE_LANGUAGE_VALUES = new Set(SOURCE_LANGUAGE_OPTIONS.map((option) => option.value));
const TARGET_LANGUAGE_VALUES = new Set(TARGET_LANGUAGE_OPTIONS.map((option) => option.value));
const AUTO_LANGUAGE_PREFERENCE_VALUES = new Set(AUTO_LANGUAGE_PREFERENCE_OPTIONS.map((option) => option.value));

const SETTINGS_KEY = "settings";

export function normalizeSettings(value = {}) {
  const fontSize = Number(value.fontSize);
  const sourceLanguage = SOURCE_LANGUAGE_VALUES.has(value.sourceLanguage) ? value.sourceLanguage : DEFAULT_SETTINGS.sourceLanguage;
  const autoLanguagePreference = AUTO_LANGUAGE_PREFERENCE_VALUES.has(value.autoLanguagePreference) ? value.autoLanguagePreference : DEFAULT_SETTINGS.autoLanguagePreference;
  const requestedTarget = TARGET_LANGUAGE_VALUES.has(value.targetLanguage) ? value.targetLanguage : DEFAULT_SETTINGS.targetLanguage;
  const targetLanguage = toModelLanguage(sourceLanguage) === requestedTarget ? getTargetLanguageForSource(sourceLanguage) : requestedTarget;
  return {
    settingsVersion: 3,
    enabled: value.enabled === true,
    sourceLanguage,
    autoLanguagePreference,
    targetLanguage,
    showOriginal: value.showOriginal !== false,
    showTranslation: value.showTranslation !== false,
    fontSize: Number.isFinite(fontSize) ? Math.min(22, Math.max(12, Math.round(fontSize))) : DEFAULT_SETTINGS.fontSize
  };
}

export async function readSettings() {
  const result = await chrome.storage.local.get(SETTINGS_KEY);
  const stored = result[SETTINGS_KEY];
  const migrated = stored && stored.settingsVersion === 3 ? stored : { ...stored, autoLanguagePreference: "channel" };
  return normalizeSettings(migrated);
}

export async function writeSettings(patch) {
  const settings = normalizeSettings({ ...(await readSettings()), ...patch });
  await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
  return settings;
}

export function toModelLanguage(language) {
  if (language === "auto") return "auto";
  return language.split("-")[0].toLowerCase();
}

export function getTargetLanguageForSource(sourceLanguage) {
  const source = toModelLanguage(sourceLanguage);
  if (source === "ja") return "en";
  return "ja";
}

export function getSpeechLanguagesForSource(sourceLanguage) {
  return sourceLanguage === "auto" ? [...AUTO_SPEECH_LANGUAGES] : [sourceLanguage];
}

export function resolveAutoLanguagePreference(preference, channelLanguageHint = null) {
  if (preference === "channel") return ["ja", "en", "id"].includes(channelLanguageHint) ? channelLanguageHint : null;
  return ["ja", "en", "id"].includes(preference) ? preference : null;
}

export function getLanguageLabel(language) {
  const modelLanguage = toModelLanguage(language);
  if (modelLanguage === "auto") return "JA / EN / ID";
  return modelLanguage === "en" ? "EN" : modelLanguage === "ja" ? "JA" : modelLanguage.toUpperCase();
}

export function formatLanguageDirection(sourceLanguage, targetLanguage) {
  return `${getLanguageLabel(sourceLanguage)} → ${getLanguageLabel(targetLanguage)}`;
}

export function getJapaneseLanguageLabel(language, fallback = "判定中") {
  if (typeof language !== "string" || language === "auto") return fallback;
  const modelLanguage = toModelLanguage(language);
  if (modelLanguage === "ja") return "日本語";
  if (modelLanguage === "en") return "英語";
  if (modelLanguage === "id") return "インドネシア語";
  return fallback;
}

export function formatActiveTranslationStatus(detectedLanguage, targetLanguage) {
  return `翻訳中・${getJapaneseLanguageLabel(detectedLanguage)}→${getJapaneseLanguageLabel(targetLanguage, "未設定")}`;
}

export function shouldTranslateSource(sourceLanguage, targetLanguage) {
  return toModelLanguage(sourceLanguage) !== toModelLanguage(targetLanguage);
}

export function getVideoId(url = "") {
  try {
    const parsed = new URL(url);
    if (parsed.pathname === "/watch") return parsed.searchParams.get("v");
    const parts = parsed.pathname.split("/").filter(Boolean);
    if (parts[0] === "live" || parts[0] === "shorts") return parts[1] || null;
  } catch {
    return null;
  }
  return null;
}

export function isYouTubeVideoUrl(url = "") {
  try {
    const parsed = new URL(url);
    const isYouTubeHost = parsed.hostname === "youtube.com" || parsed.hostname === "www.youtube.com";
    return isYouTubeHost && Boolean(getVideoId(url));
  } catch {
    return false;
  }
}

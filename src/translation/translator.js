import { toModelLanguage } from "../shared/settings.js";
import { FEATURE_STATUS } from "../shared/types.js";
import { translationError, TranslatorState } from "../speech/speech-state.js";

// LanguageDetector recognizes more languages than Chrome can translate.
// Avoid native unsupported-language warnings even during availability checks.
// https://developer.chrome.com/docs/ai/translator-api#supported_languages
const TRANSLATION_LANGUAGES = new Set([
  "ar", "bg", "bn", "cs", "da", "de", "el", "en", "es", "fi", "fr", "he",
  "hi", "hr", "hu", "id", "it", "ja", "kn", "ko", "lt", "mr", "nl", "no",
  "pl", "pt", "ro", "ru", "sk", "sl", "sv", "ta", "te", "th", "tr", "uk",
  "vi", "zh", "zh-Hant"
]);

function toTranslationLanguage(language) {
  const normalized = toModelLanguage(language);
  return normalized === "zh-Hans" ? "zh" : normalized;
}

function isRecoverableTranslationFailure(error) {
  return error?.name === "UnknownError" || error?.message === "Other generic failures occurred.";
}

function cancelledTranslation() {
  return Object.assign(new Error("翻訳処理は取り消されました。"), { name: "AbortError", code: "aborted" });
}

function destroyInstance(instance) {
  try {
    instance?.destroy?.();
  } catch {
    // A crashed native service may already have disposed of the instance.
  }
}

export class LocalTranslator {
  constructor({ onState, onProgress } = {}) {
    this.onState = onState;
    this.onProgress = onProgress;
    this.instances = new Map();
    this.preparing = new Map();
    this.unavailablePairs = new Set();
    this.generation = 0;
  }

  getConstructor() {
    return globalThis.Translator || null;
  }

  async checkAvailability(sourceLanguage = "en-US", targetLanguage = "ja") {
    const Constructor = this.getConstructor();
    if (!Constructor || typeof Constructor.availability !== "function") {
      return { supported: false, status: FEATURE_STATUS.UNAVAILABLE, message: "この環境ではChromeの翻訳機能を利用できません。" };
    }
    const source = toTranslationLanguage(sourceLanguage);
    const target = toTranslationLanguage(targetLanguage);
    const key = `${source}:${target}`;
    if (!TRANSLATION_LANGUAGES.has(source) || !TRANSLATION_LANGUAGES.has(target) || this.unavailablePairs.has(key)) {
      return { supported: true, status: FEATURE_STATUS.UNAVAILABLE };
    }
    try {
      const status = await Constructor.availability({
        sourceLanguage: source,
        targetLanguage: target
      });
      if (status === FEATURE_STATUS.UNAVAILABLE) this.unavailablePairs.add(key);
      return { supported: true, status };
    } catch (error) {
      return { supported: true, status: FEATURE_STATUS.UNAVAILABLE, message: error instanceof Error ? error.message : "翻訳機能の対応状況を確認できませんでした。" };
    }
  }

  async prepare(sourceLanguage = "en-US", targetLanguage = "ja") {
    const source = toTranslationLanguage(sourceLanguage);
    const target = toTranslationLanguage(targetLanguage);
    const key = `${source}:${target}`;
    if (this.instances.has(key)) return this.instances.get(key);
    if (this.preparing.has(key)) return this.preparing.get(key);

    const generation = this.generation;
    const preparing = (async () => {
      const Constructor = this.getConstructor();
      if (!Constructor || typeof Constructor.create !== "function") {
        const error = translationError("unavailable");
        throw Object.assign(new Error(error.message), error);
      }

      this.onState?.(TranslatorState.INITIALIZING, `${source.toUpperCase()} → ${target.toUpperCase()}`);
      const availability = await this.checkAvailability(source, target);
      if (!availability.supported) {
        const error = translationError("unavailable", availability.message);
        throw Object.assign(new Error(error.message), error);
      }
      if (availability.status === FEATURE_STATUS.UNAVAILABLE) {
        const error = translationError("pair_unavailable", availability.message, `${source.toUpperCase()} → ${target.toUpperCase()} 翻訳`);
        throw Object.assign(new Error(error.message), error);
      }
      if (generation !== this.generation) throw cancelledTranslation();
      if (availability.status !== FEATURE_STATUS.AVAILABLE) this.onState?.(TranslatorState.DOWNLOADING, `${source.toUpperCase()} → ${target.toUpperCase()} 翻訳モデル`);

      try {
        const instance = await Constructor.create({
          sourceLanguage: source,
          targetLanguage: target,
          monitor: (monitor) => {
            monitor?.addEventListener?.("downloadprogress", (event) => {
              this.onProgress?.(event.loaded, `${source.toUpperCase()} → ${target.toUpperCase()} 翻訳モデル`);
            });
          }
        });
        if (generation !== this.generation) {
          destroyInstance(instance);
          throw cancelledTranslation();
        }
        this.instances.set(key, instance);
        return instance;
      } catch (cause) {
        if (cause?.name === "AbortError") throw cause;
        const code = cause?.name === "NotAllowedError" || cause?.name === "SecurityError" ? "user_activation" : "model_install_failed";
        const error = translationError(code, cause instanceof Error ? cause.message : "翻訳モデルの作成に失敗しました。", `${source.toUpperCase()} → ${target.toUpperCase()} 翻訳`);
        throw Object.assign(new Error(error.message), error, { cause });
      }
    })();
    this.preparing.set(key, preparing);

    try {
      return await preparing;
    } finally {
      if (this.preparing.get(key) === preparing) this.preparing.delete(key);
    }
  }

  async translate(text, sourceLanguage = "en-US", targetLanguage = "ja") {
    const generation = this.generation;
    const source = toTranslationLanguage(sourceLanguage);
    const target = toTranslationLanguage(targetLanguage);
    const key = `${source}:${target}`;
    let instance = await this.prepare(source, target);
    // Chromium keeps a crashed translator unusable, but a new one can work.
    // Recreate only this language pair, and retry the same text once.
    for (let attempt = 0; attempt < 2; attempt += 1) {
      if (generation !== this.generation) throw cancelledTranslation();
      try {
        const translated = await instance.translate(text);
        if (generation !== this.generation) throw cancelledTranslation();
        if (attempt > 0) this.onState?.(TranslatorState.LISTENING);
        return translated;
      } catch (cause) {
        if (generation !== this.generation) throw cancelledTranslation();
        if (!isRecoverableTranslationFailure(cause)) throw cause;
        if (this.instances.get(key) === instance) {
          this.instances.delete(key);
          destroyInstance(instance);
        }
        if (attempt === 1) {
          const error = translationError("service_failed", cause.message, `${source.toUpperCase()} → ${target.toUpperCase()} 翻訳`);
          throw Object.assign(new Error(error.message), error, { cause });
        }
        instance = await this.prepare(source, target);
      }
    }
  }

  reset() {
    this.generation += 1;
    for (const instance of this.instances.values()) destroyInstance(instance);
    this.instances.clear();
    this.preparing.clear();
    this.unavailablePairs.clear();
  }
}

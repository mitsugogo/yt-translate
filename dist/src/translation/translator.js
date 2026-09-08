import { toModelLanguage } from "../shared/settings.js";
import { FEATURE_STATUS } from "../shared/types.js";
import { translationError, TranslatorState } from "../speech/speech-state.js";

export class LocalTranslator {
  constructor({ onState, onProgress } = {}) {
    this.onState = onState;
    this.onProgress = onProgress;
    this.instances = new Map();
    this.preparing = new Map();
  }

  getConstructor() {
    return globalThis.Translator || null;
  }

  async checkAvailability(sourceLanguage = "en-US", targetLanguage = "ja") {
    const Constructor = this.getConstructor();
    if (!Constructor || typeof Constructor.availability !== "function") {
      return { supported: false, status: FEATURE_STATUS.UNAVAILABLE, message: "この環境ではChromeの翻訳機能を利用できません。" };
    }
    try {
      const status = await Constructor.availability({
        sourceLanguage: toModelLanguage(sourceLanguage),
        targetLanguage: toModelLanguage(targetLanguage)
      });
      return { supported: true, status };
    } catch (error) {
      return { supported: true, status: FEATURE_STATUS.UNAVAILABLE, message: error instanceof Error ? error.message : "翻訳機能の対応状況を確認できませんでした。" };
    }
  }

  async prepare(sourceLanguage = "en-US", targetLanguage = "ja") {
    const source = toModelLanguage(sourceLanguage);
    const target = toModelLanguage(targetLanguage);
    const key = `${source}:${target}`;
    if (this.instances.has(key)) return this.instances.get(key);
    if (this.preparing.has(key)) return this.preparing.get(key);

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
        this.instances.set(key, instance);
        return instance;
      } catch (cause) {
        const code = cause?.name === "NotAllowedError" || cause?.name === "SecurityError" ? "user_activation" : "model_install_failed";
        const error = translationError(code, cause instanceof Error ? cause.message : "翻訳モデルの作成に失敗しました。", `${source.toUpperCase()} → ${target.toUpperCase()} 翻訳`);
        throw Object.assign(new Error(error.message), error, { cause });
      }
    })();
    this.preparing.set(key, preparing);

    try {
      return await preparing;
    } finally {
      this.preparing.delete(key);
    }
  }

  async translate(text, sourceLanguage = "en-US", targetLanguage = "ja") {
    const instance = await this.prepare(sourceLanguage, targetLanguage);
    return instance.translate(text);
  }

  reset() {
    for (const instance of this.instances.values()) instance?.destroy?.();
    this.instances.clear();
    this.preparing.clear();
  }
}

import { FEATURE_STATUS } from "../shared/types.js";
import { TranslatorState } from "../shared/messages.js";
import { toModelLanguage } from "../shared/settings.js";

const INDONESIAN_WORDS = /\b(?:aku|anda|banget|bisa|dan|dengan|dia|ini|itu|juga|kamu|karena|kita|nggak|saya|sudah|tidak|untuk|yang)\b/giu;
const JAPANESE_CHARACTERS = /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u;

export function detectLanguageHeuristically(text, fallbackLanguage = "en") {
  const fallback = toModelLanguage(fallbackLanguage);
  if (JAPANESE_CHARACTERS.test(text)) return { detectedLanguage: "ja", confidence: 0.9 };
  const matches = text.match(INDONESIAN_WORDS)?.length || 0;
  if (matches > 0) return { detectedLanguage: "id", confidence: Math.min(0.9, 0.55 + matches * 0.1) };
  if (/\p{Script=Latin}/u.test(text)) {
    return { detectedLanguage: fallback === "id" ? "id" : "en", confidence: 0.35 };
  }
  return { detectedLanguage: ["ja", "en", "id"].includes(fallback) ? fallback : "en", confidence: 0.2 };
}

export class LocalLanguageDetector {
  constructor({ onState, onProgress } = {}) {
    this.onState = onState;
    this.onProgress = onProgress;
    this.instance = null;
    this.preparing = null;
  }

  getConstructor() {
    return globalThis.LanguageDetector || null;
  }

  async checkAvailability() {
    const Constructor = this.getConstructor();
    if (!Constructor || typeof Constructor.availability !== "function") {
      return { supported: false, status: FEATURE_STATUS.UNAVAILABLE, message: "Chromeの言語判定機能を利用できません。" };
    }
    try {
      return { supported: true, status: await Constructor.availability() };
    } catch (error) {
      return { supported: true, status: FEATURE_STATUS.UNAVAILABLE, message: error instanceof Error ? error.message : "言語判定機能の対応状況を確認できませんでした。" };
    }
  }

  async prepare() {
    if (this.instance) return this.instance;
    if (this.preparing) return this.preparing;
    this.preparing = (async () => {
      const Constructor = this.getConstructor();
      if (!Constructor || typeof Constructor.create !== "function") return null;
      const availability = await this.checkAvailability();
      if (!availability.supported || availability.status === FEATURE_STATUS.UNAVAILABLE) return null;
      if (availability.status !== FEATURE_STATUS.AVAILABLE) this.onState?.(TranslatorState.DOWNLOADING, "言語判定モデルを準備中…");
      this.instance = await Constructor.create({
        monitor: (monitor) => monitor?.addEventListener?.("downloadprogress", (event) => this.onProgress?.(event.loaded, "言語判定モデル"))
      });
      return this.instance;
    })();
    try {
      return await this.preparing;
    } finally {
      this.preparing = null;
    }
  }

  async detect(text, fallbackLanguage = "en") {
    const fallback = detectLanguageHeuristically(text, fallbackLanguage);
    if (!text?.trim() || text.trim().length < 3) return [fallback];
    try {
      const detector = await this.prepare();
      if (!detector) return [fallback];
      const results = await detector.detect(text);
      const supported = results
        .map((result) => ({ detectedLanguage: toModelLanguage(result.detectedLanguage || ""), confidence: Number(result.confidence) || 0 }))
        .filter((result) => ["ja", "en", "id"].includes(result.detectedLanguage));
      return supported.length > 0 ? supported : [fallback];
    } catch {
      return [fallback];
    }
  }

  reset() {
    this.instance?.destroy?.();
    this.instance = null;
    this.preparing = null;
  }
}

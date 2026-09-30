import { LocalTranslator } from "./translator.js";
import { shouldSkipChatText } from "../shared/chat-text.js";

export const CHAT_CACHE_LIMIT = 200;
export const CHAT_AUTHOR_LIMIT = 200;
export const CHAT_MAX_TEXT_LENGTH = 500;
const AUTHOR_TTL = 5 * 60 * 1000;
const KANA = /[\p{Script=Hiragana}\p{Script=Katakana}]/u;
const HAN_ONLY = /^[\p{Script=Han}\p{P}\p{Z}\p{N}\p{S}]+$/u;

export function normalizeChatLanguage(language = "") {
  if (!language || /^(?:und|unknown|auto)$/i.test(language)) return null;
  if (/^zh(?:-|$)/i.test(language)) return /^zh-(?:hant|tw|hk)/i.test(language) ? "zh-Hant" : "zh";
  return language.split("-")[0].toLowerCase();
}

export function sameChatLanguage(source, target) {
  const family = (language) => normalizeChatLanguage(language)?.split("-")[0];
  return Boolean(family(source) && family(source) === family(target));
}

function putBounded(map, key, value, limit) {
  map.delete(key);
  map.set(key, value);
  if (map.size > limit) map.delete(map.keys().next().value);
}

export class ChatLanguageDetector {
  constructor() {
    this.instance = null;
  }

  async detect(text) {
    if (!this.instance) {
      const Constructor = globalThis.LanguageDetector;
      if (!Constructor || await Constructor.availability() === "unavailable") return [];
      this.instance = await Constructor.create();
    }
    return this.instance.detect(text);
  }

  reset() {
    this.instance?.destroy?.();
    this.instance = null;
  }
}

// Chat text must not use the speech fallback that classifies all Han as Japanese.
export class ChatTranslator {
  constructor({ detector = new ChatLanguageDetector(), translator = new LocalTranslator(), now = Date.now } = {}) {
    this.detector = detector;
    this.translator = translator;
    this.now = now;
    this.authors = new Map();
    this.languages = new Map();
    this.cache = new Map();
    this.busy = false;
    this.closed = false;
  }

  authorLanguage(authorId) {
    const hint = this.authors.get(authorId);
    if (!hint || this.now() - hint.updatedAt > AUTHOR_TTL) {
      this.authors.delete(authorId);
      return null;
    }
    return hint.language;
  }

  async resolveLanguage(text, authorId) {
    const letters = text.match(/\p{L}/gu) || [];
    if (letters.length === 0) return null;
    const hanOnly = /\p{Script=Han}/u.test(text) && HAN_ONLY.test(text);
    const hint = this.authorLanguage(authorId);
    const hanHint = hint && ["ja", "zh", "zh-Hant"].includes(hint) ? hint : null;
    // Short shared words such as 感謝 and 最高 are inherently ambiguous, even
    // when the detector reports high confidence. An author's hint is temporary.
    if (hanOnly && letters.length < 8) return hanHint;
    if (letters.length < 3 && !KANA.test(text)) return null;
    if (this.languages.has(text)) {
      const language = this.languages.get(text);
      if (authorId && language) putBounded(this.authors, authorId, { language, updatedAt: this.now() }, CHAT_AUTHOR_LIMIT);
      return language || (hanOnly ? hanHint : null);
    }
    if (KANA.test(text) && !/[\p{Script=Latin}\p{Script=Hangul}\p{Script=Cyrillic}]/u.test(text)) {
      putBounded(this.languages, text, "ja", CHAT_CACHE_LIMIT);
      if (authorId) putBounded(this.authors, authorId, { language: "ja", updatedAt: this.now() }, CHAT_AUTHOR_LIMIT);
      return "ja";
    }
    const results = (await this.detector.detect(text))
      .map((result) => ({ language: normalizeChatLanguage(result.detectedLanguage), confidence: Number(result.confidence) || 0 }))
      .filter((result) => result.language)
      .sort((a, b) => b.confidence - a.confidence);
    const best = results[0];
    const margin = (best?.confidence || 0) - (results[1]?.confidence || 0);
    const reliable = best && (!hanOnly || ["ja", "zh", "zh-Hant"].includes(best.language))
      && best.confidence >= (hanOnly ? 0.95 : 0.8) && margin >= (hanOnly ? 0.3 : 0.2);
    if (!reliable) {
      putBounded(this.languages, text, null, CHAT_CACHE_LIMIT);
      return hanOnly ? hanHint : null;
    }
    putBounded(this.languages, text, best.language, CHAT_CACHE_LIMIT);
    if (authorId) putBounded(this.authors, authorId, { language: best.language, updatedAt: this.now() }, CHAT_AUTHOR_LIMIT);
    return best.language;
  }

  async translate({ text, authorId = "", targetLanguage }) {
    if (this.closed || this.busy) return { status: "skipped" };
    if (typeof text !== "string" || text.length > CHAT_MAX_TEXT_LENGTH || !text.trim()) return { status: "unknown" };
    if (shouldSkipChatText(text)) return { status: "skipped" };
    this.busy = true;
    try {
      const sourceLanguage = await this.resolveLanguage(text.trim(), authorId);
      if (this.closed) return { status: "skipped" };
      if (!sourceLanguage) return { status: "unknown" };
      if (sameChatLanguage(sourceLanguage, targetLanguage)) return { status: "same", sourceLanguage };
      const target = normalizeChatLanguage(targetLanguage);
      if (!target) return { status: "unknown" };
      const key = JSON.stringify([sourceLanguage, target, text]);
      let translated = this.cache.get(key);
      if (!translated) {
        // Keep model instances bounded as well as text/author caches.
        if (this.translator.instances?.size >= 8 && !this.translator.instances.has(`${sourceLanguage}:${target}`)) this.translator.reset();
        translated = await this.translator.translate(text, sourceLanguage, target);
        if (this.closed) return { status: "skipped" };
        if (typeof translated !== "string" || !translated.trim() || translated === text) return { status: "same", sourceLanguage };
        putBounded(this.cache, key, translated, CHAT_CACHE_LIMIT);
      }
      return { status: "translated", sourceLanguage, translated };
    } catch {
      // Unsupported languages, unavailable models and detection failures leave
      // the original comment intact, without interrupting speech translation.
      return { status: "unavailable" };
    } finally {
      this.busy = false;
      if (this.closed) this.release();
    }
  }

  close() {
    this.closed = true;
    this.authors.clear();
    this.languages.clear();
    this.cache.clear();
    if (!this.busy) this.release();
  }

  release() {
    this.detector.reset?.();
    this.translator.reset?.();
  }
}

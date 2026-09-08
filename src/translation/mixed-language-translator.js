import { getSpeechLanguagesForSource, toModelLanguage } from "../shared/settings.js";
import { LocalLanguageDetector, detectLanguageHeuristically } from "./language-detector.js";
import { LocalTranslator } from "./translator.js";

const JAPANESE_CHARACTER = /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u;
const LATIN_CHARACTER = /\p{Script=Latin}/u;

export function splitLanguageRuns(text) {
  const runs = [];
  let current = null;
  for (const character of text) {
    const kind = JAPANESE_CHARACTER.test(character) ? "ja" : LATIN_CHARACTER.test(character) ? "latin" : "neutral";
    if (kind === "neutral") {
      if (current) current.text += character;
      else runs.push({ kind, text: character });
      continue;
    }
    if (!current || current.kind !== kind) {
      current = { kind, text: character };
      runs.push(current);
    } else {
      current.text += character;
    }
  }
  return runs;
}

function preserveOuterWhitespace(original, translated) {
  const leading = original.match(/^\s*/u)?.[0] || "";
  const trailing = original.match(/\s*$/u)?.[0] || "";
  return `${leading}${translated}${trailing}`;
}

export class MixedLanguageTranslator {
  constructor({ translator, detector, onState, onProgress } = {}) {
    this.translator = translator || new LocalTranslator({ onState, onProgress });
    this.detector = detector || new LocalLanguageDetector({ onState, onProgress });
  }

  async checkAvailability(sourceLanguage, targetLanguage) {
    const sources = getSpeechLanguagesForSource(sourceLanguage).map(toModelLanguage);
    const pairs = sources.filter((source) => source !== targetLanguage);
    const translations = await Promise.all(pairs.map((source) => this.translator.checkAvailability(source, targetLanguage)));
    const detector = sourceLanguage === "auto" ? await this.detector.checkAvailability() : null;
    return { translations, detector };
  }

  async prepare(sourceLanguage, targetLanguage) {
    const sources = [...new Set(getSpeechLanguagesForSource(sourceLanguage).map(toModelLanguage))];
    if (sourceLanguage === "auto") await this.detector.prepare();
    for (const source of sources) {
      if (source !== targetLanguage) await this.translator.prepare(source, targetLanguage);
    }
  }

  async resolveLanguage(text, kind, fallbackSource) {
    if (kind === "ja") return "ja";
    if (kind === "neutral") return toModelLanguage(fallbackSource);
    const fallback = detectLanguageHeuristically(text, fallbackSource);
    const detected = (await this.detector.detect(text, fallback.detectedLanguage))[0] || fallback;
    if (detected.confidence < 0.45 && ["en", "id"].includes(toModelLanguage(fallbackSource))) return toModelLanguage(fallbackSource);
    return detected.detectedLanguage;
  }

  async translate(text, fallbackSourceLanguage, targetLanguage) {
    const target = toModelLanguage(targetLanguage);
    const runs = splitLanguageRuns(text);
    const output = [];
    for (const run of runs) {
      if (!/[\p{L}\p{N}]/u.test(run.text)) {
        output.push(run.text);
        continue;
      }
      const source = await this.resolveLanguage(run.text, run.kind, fallbackSourceLanguage);
      if (source === target) {
        output.push(run.text);
        continue;
      }
      const trimmed = run.text.trim();
      if (!trimmed) {
        output.push(run.text);
        continue;
      }
      const translated = await this.translator.translate(trimmed, source, target);
      output.push(preserveOuterWhitespace(run.text, translated));
    }
    return output.join("");
  }

  reset() {
    this.translator.reset();
    this.detector.reset();
  }
}

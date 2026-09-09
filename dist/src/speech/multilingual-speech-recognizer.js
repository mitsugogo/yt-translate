import { getSpeechLanguagesForSource, toModelLanguage } from "../shared/settings.js";
import { TranslatorState } from "../shared/messages.js";
import { detectLanguageHeuristically } from "../translation/language-detector.js";
import { ensureSpeechLanguages } from "./speech-language.js";
import { SpeechRecognizer } from "./speech-recognizer.js";
import { getHololiveSpeechPhrases } from "./hololive-vocabulary.js";

const FINAL_CANDIDATE_WAIT_MS = 700;

function preferenceBoost(candidate, preferredLanguages) {
  const priorities = Array.isArray(preferredLanguages) ? preferredLanguages : preferredLanguages ? [preferredLanguages] : [];
  const rank = priorities.findIndex((language) => toModelLanguage(candidate.sourceLanguage) === toModelLanguage(language));
  if (rank < 0) return 0;
  const meaningfulLength = [...candidate.text.replace(/[^\p{L}\p{N}]/gu, "")].length;
  const firstChoiceBoost = meaningfulLength <= 3 ? 0.42 : meaningfulLength <= 6 ? 0.22 : 0.12;
  return firstChoiceBoost / (rank + 1);
}

function scoreCandidateWithoutDetector(candidate, preferredLanguages = []) {
  const language = toModelLanguage(candidate.sourceLanguage);
  const heuristic = detectLanguageHeuristically(candidate.text, language);
  const confidence = Number.isFinite(candidate.confidence) ? candidate.confidence : 0;
  let score = confidence * 2;
  if (heuristic.detectedLanguage === language) score += heuristic.confidence;
  else score -= heuristic.confidence * 0.5;
  if (language === "ja" && /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u.test(candidate.text)) score += 0.8;
  return score + preferenceBoost(candidate, preferredLanguages);
}

export async function selectSpeechCandidate(candidates, detector = null, preferredLanguages = []) {
  if (!candidates?.length) return null;
  const scored = await Promise.all(candidates.map(async (candidate) => {
    let score = scoreCandidateWithoutDetector(candidate, preferredLanguages);
    if (detector) {
      const results = await detector.detect(candidate.text, candidate.sourceLanguage);
      const language = toModelLanguage(candidate.sourceLanguage);
      const matching = results.find((result) => result.detectedLanguage === language);
      const strongest = results[0];
      if (matching) score += matching.confidence * 1.5;
      if (strongest && strongest.detectedLanguage !== language) score -= strongest.confidence * 0.5;
    }
    return { candidate, score };
  }));
  scored.sort((left, right) => right.score - left.score || right.candidate.text.length - left.candidate.text.length);
  return scored[0].candidate;
}

export class MultilingualSpeechRecognizer {
  constructor({ onInterim, onFinal, onState, onError, detector = null } = {}) {
    this.onInterim = onInterim;
    this.onFinal = onFinal;
    this.onState = onState;
    this.onError = onError;
    this.detector = detector;
    this.settings = { sourceLanguage: "auto" };
    this.stream = null;
    this.recognizers = [];
    this.finalCandidates = [];
    this.finalTimer = null;
    this.interimCandidates = new Map();
    this.interimTimer = null;
  }

  async start(stream, settings = this.settings) {
    await this.stop();
    this.settings = settings;
    this.stream = stream;
    const languages = getSpeechLanguagesForSource(settings.sourceLanguage);
    this.onState?.(TranslatorState.INITIALIZING);
    await ensureSpeechLanguages({
      languages,
      onState: (state, progress) => this.onState?.(state, `音声認識モデルを準備中（${progress.index + 1}/${progress.total}）`)
    });
    this.recognizers = languages.map((language, index) => new SpeechRecognizer({
      manageAudioOutput: index === 0,
      stopStream: false,
      onInterim: (candidate) => this.handleInterim(candidate),
      onFinal: (candidate) => this.handleFinal(candidate),
      onState: () => {},
      onError: (error) => this.onError?.({ ...error, sourceLanguage: language })
    }));
    try {
      await Promise.all(this.recognizers.map((recognizer, index) => recognizer.start(stream, {
        ...settings,
        sourceLanguage: languages[index],
        phraseHints: settings.useHololiveVocabulary ? getHololiveSpeechPhrases(languages[index]) : []
      })));
      this.onState?.(TranslatorState.LISTENING);
    } catch (error) {
      await this.stop();
      throw error;
    }
  }

  handleInterim(candidate) {
    const language = toModelLanguage(candidate.sourceLanguage);
    this.interimCandidates.set(language, candidate);
    const chosen = [...this.interimCandidates.values()].sort((left, right) => scoreCandidateWithoutDetector(right, this.settings.preferredLanguages) - scoreCandidateWithoutDetector(left, this.settings.preferredLanguages))[0];
    if (chosen) this.onInterim?.(chosen);
    if (this.interimTimer) clearTimeout(this.interimTimer);
    this.interimTimer = setTimeout(() => this.interimCandidates.clear(), FINAL_CANDIDATE_WAIT_MS);
  }

  handleFinal(candidate) {
    this.finalCandidates.push(candidate);
    if (this.finalTimer) return;
    const delay = this.recognizers.length > 1 ? FINAL_CANDIDATE_WAIT_MS : 0;
    this.finalTimer = setTimeout(() => void this.flushFinalCandidates(), delay);
  }

  async flushFinalCandidates() {
    const candidates = this.finalCandidates.splice(0);
    this.finalTimer = null;
    const chosen = await selectSpeechCandidate(candidates, this.detector, this.settings.preferredLanguages);
    if (chosen) this.onFinal?.(chosen);
  }

  async updateSettings(settings) {
    const sourceChanged = settings.sourceLanguage !== this.settings.sourceLanguage
      || (settings.preferredLanguages || []).join(",") !== (this.settings.preferredLanguages || []).join(",")
      || settings.useHololiveVocabulary !== this.settings.useHololiveVocabulary;
    this.settings = settings;
    if (!sourceChanged || !this.stream) return;
    const stream = this.stream;
    await this.start(stream, settings);
  }

  async stop() {
    if (this.finalTimer) clearTimeout(this.finalTimer);
    if (this.interimTimer) clearTimeout(this.interimTimer);
    this.finalTimer = null;
    this.interimTimer = null;
    this.finalCandidates = [];
    this.interimCandidates.clear();
    const recognizers = this.recognizers.splice(0);
    await Promise.allSettled(recognizers.map((recognizer) => recognizer.stop({ keepAudio: true })));
    this.stream = null;
  }
}

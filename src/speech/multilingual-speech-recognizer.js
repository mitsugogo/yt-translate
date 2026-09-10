import { getSpeechLanguagesForSource, toModelLanguage } from "../shared/settings.js";
import { TranslatorState } from "../shared/messages.js";
import { detectLanguageHeuristically } from "../translation/language-detector.js";
import { ensureSpeechLanguages } from "./speech-language.js";
import { SpeechRecognizer } from "./speech-recognizer.js";
import { getHololiveSpeechPhrases } from "./hololive-vocabulary.js";
import { isUsableSpeechCandidate, meaningfulTextLength, speechConfidence } from "./transcript-quality.js";

const FINAL_CANDIDATE_WAIT_MS = 700;
const INTERIM_CANDIDATE_TTL_MS = 1600;
const INTERIM_SWITCH_WAIT_MS = 600;
const INTERIM_SWITCH_MARGIN = 0.2;
const SESSION_LANGUAGE_DECAY = 0.92;
const SESSION_LANGUAGE_MIN_OBSERVATIONS = 3;

export class SessionLanguageLearner {
  constructor() {
    this.reset();
  }

  observe(candidate) {
    if (candidate?.isProvisional) return false;
    const language = toModelLanguage(candidate?.sourceLanguage || "");
    const meaningfulLength = meaningfulTextLength(candidate?.text);
    if (!["ja", "en", "id"].includes(language) || meaningfulLength < 4 || !isUsableSpeechCandidate(candidate)) return false;

    const confidence = speechConfidence(candidate);
    if (confidence < 0.65) return false;
    const confidenceWeight = 0.45 + confidence * 0.55;
    const lengthWeight = Math.min(1, 0.5 + (meaningfulLength - 4) * 0.06);
    for (const key of Object.keys(this.evidence)) this.evidence[key] *= SESSION_LANGUAGE_DECAY;
    this.evidence[language] += confidenceWeight * lengthWeight;
    this.observations = Math.min(50, this.observations + 1);
    return true;
  }

  getBias(candidate) {
    if (this.observations < SESSION_LANGUAGE_MIN_OBSERVATIONS) return 0;
    const language = toModelLanguage(candidate?.sourceLanguage || "");
    if (!(language in this.evidence)) return 0;
    const total = Object.values(this.evidence).reduce((sum, value) => sum + value, 0);
    if (total <= 0) return 0;

    const share = this.evidence[language] / total;
    const dominance = Math.max(0, (share - (1 / 3)) / (2 / 3));
    const maturity = Math.min(1, (this.observations - 2) / 4);
    const meaningfulLength = meaningfulTextLength(candidate?.text);
    const maximumBoost = meaningfulLength <= 3 ? 0.3 : meaningfulLength <= 6 ? 0.16 : 0.08;
    return maximumBoost * dominance * maturity;
  }

  reset() {
    this.evidence = { ja: 0, en: 0, id: 0 };
    this.observations = 0;
  }
}

function preferenceBoost(candidate, preferredLanguages) {
  const priorities = Array.isArray(preferredLanguages) ? preferredLanguages : preferredLanguages ? [preferredLanguages] : [];
  const rank = priorities.findIndex((language) => toModelLanguage(candidate.sourceLanguage) === toModelLanguage(language));
  if (rank < 0) return 0;
  const meaningfulLength = meaningfulTextLength(candidate.text);
  const firstChoiceBoost = meaningfulLength <= 3 ? 0.42 : meaningfulLength <= 6 ? 0.22 : 0.12;
  return firstChoiceBoost / (rank + 1);
}

function scoreCandidateWithoutDetector(candidate, preferredLanguages = [], sessionLanguageLearner = null) {
  const language = toModelLanguage(candidate.sourceLanguage);
  const heuristic = detectLanguageHeuristically(candidate.text, language);
  const confidence = speechConfidence(candidate);
  let score = confidence * 2;
  // Text language is only supporting evidence: each recognizer already writes
  // in its configured language, even when it has misheard the audio.
  if (heuristic.detectedLanguage === language) score += heuristic.confidence * 0.35;
  else score -= heuristic.confidence * 0.35;
  return score + preferenceBoost(candidate, preferredLanguages) + (sessionLanguageLearner?.getBias(candidate) || 0);
}

export async function selectSpeechCandidate(candidates, detector = null, preferredLanguages = [], sessionLanguageLearner = null) {
  const usable = (candidates || []).filter(isUsableSpeechCandidate);
  if (!usable.length) return null;
  const scored = await Promise.all(usable.map(async (candidate) => {
    let score = scoreCandidateWithoutDetector(candidate, preferredLanguages, sessionLanguageLearner);
    if (detector) {
      const results = await detector.detect(candidate.text, candidate.sourceLanguage);
      const language = toModelLanguage(candidate.sourceLanguage);
      const matching = results.find((result) => result.detectedLanguage === language);
      const strongest = results[0];
      if (matching) score += matching.confidence * 0.4;
      if (strongest && strongest.detectedLanguage !== language) score -= strongest.confidence * 0.4;
    }
    return { candidate, score };
  }));
  scored.sort((left, right) => right.score - left.score);
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
    this.interimReceivedAt = new Map();
    this.interimTimer = null;
    this.displayedCandidate = null;
    this.displayedAt = 0;
    this.pendingInterimSwitch = null;
    this.sessionLanguageLearner = new SessionLanguageLearner();
    this.generation = 0;
  }

  async start(stream, settings = this.settings, { preserveSessionLearning = false } = {}) {
    await this.stop({ preserveSessionLearning });
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
        // Biasing every language toward the same dictionary distorts auto selection.
        phraseHints: settings.useHololiveVocabulary && settings.sourceLanguage !== "auto" ? getHololiveSpeechPhrases(languages[index]) : []
      })));
      this.onState?.(TranslatorState.LISTENING);
    } catch (error) {
      await this.stop();
      throw error;
    }
  }

  handleInterim(candidate) {
    const now = performance.now();
    const language = toModelLanguage(candidate.sourceLanguage);
    if (!isUsableSpeechCandidate(candidate)) {
      this.interimCandidates.delete(language);
      this.interimReceivedAt.delete(language);
      return;
    }
    this.interimCandidates.set(language, candidate);
    this.interimReceivedAt.set(language, now);
    for (const [key, receivedAt] of this.interimReceivedAt) {
      if (now - receivedAt >= INTERIM_CANDIDATE_TTL_MS) {
        this.interimCandidates.delete(key);
        this.interimReceivedAt.delete(key);
      }
    }
    if (this.interimTimer) clearTimeout(this.interimTimer);
    this.interimTimer = setTimeout(() => {
      this.interimCandidates.clear();
      this.interimReceivedAt.clear();
      this.interimTimer = null;
    }, INTERIM_CANDIDATE_TTL_MS);

    const score = c => scoreCandidateWithoutDetector(c, this.settings.preferredLanguages, this.sessionLanguageLearner);
    const best = [...this.interimCandidates.values()].sort((left, right) => score(right) - score(left))[0];
    const current = this.displayedCandidate;
    const currentIsFresh = now - this.displayedAt < INTERIM_CANDIDATE_TTL_MS;
    let chosen = best;
    if (current && toModelLanguage(best.sourceLanguage) !== toModelLanguage(current.sourceLanguage)) {
      // Parallel recognizers must not flash every competing short hypothesis.
      // Require sustained, stronger evidence; native finals still arbitrate normally.
      if (meaningfulTextLength(best.text) < 10 || (currentIsFresh && score(best) < score(current) + INTERIM_SWITCH_MARGIN)) {
        this.pendingInterimSwitch = null;
        chosen = this.interimCandidates.get(toModelLanguage(current.sourceLanguage));
      } else {
        const nextLanguage = toModelLanguage(best.sourceLanguage);
        if (this.pendingInterimSwitch?.language !== nextLanguage) this.pendingInterimSwitch = { language: nextLanguage, since: now };
        if (now - this.pendingInterimSwitch.since < INTERIM_SWITCH_WAIT_MS) chosen = this.interimCandidates.get(toModelLanguage(current.sourceLanguage));
      }
    } else {
      this.pendingInterimSwitch = null;
    }
    // An event from a losing recognizer must not replay a stored old hypothesis.
    if (chosen !== candidate) return;
    this.displayedCandidate = chosen;
    this.displayedAt = now;
    this.onInterim?.(chosen);
  }

  handleFinal(candidate) {
    const language = toModelLanguage(candidate.sourceLanguage);
    this.interimCandidates.delete(language);
    this.interimReceivedAt.delete(language);
    if (!isUsableSpeechCandidate(candidate)) return;
    if (candidate.isProvisional && this.displayedCandidate
      && language !== toModelLanguage(this.displayedCandidate.sourceLanguage)) return;
    this.finalCandidates.push(candidate);
    if (this.finalTimer) return;
    const delay = this.recognizers.length > 1 ? FINAL_CANDIDATE_WAIT_MS : 0;
    this.finalTimer = setTimeout(() => void this.flushFinalCandidates(), delay);
  }

  async flushFinalCandidates() {
    const generation = this.generation;
    const candidates = this.finalCandidates.splice(0);
    this.finalTimer = null;
    // Consecutive chunks from the same language are not competing alternatives.
    // Preserve all of them when several arrive within the candidate wait window.
    const byLanguage = new Map();
    for (const candidate of candidates) {
      const previous = byLanguage.get(candidate.sourceLanguage);
      byLanguage.set(candidate.sourceLanguage, previous ? {
        ...candidate,
        text: `${previous.text} ${candidate.text}`,
        confidence: Math.min(previous.confidence, candidate.confidence),
        isProvisional: previous.isProvisional || candidate.isProvisional
      } : candidate);
    }
    const chosen = await selectSpeechCandidate([...byLanguage.values()], this.detector, this.settings.preferredLanguages, this.sessionLanguageLearner);
    if (chosen && generation === this.generation) {
      if (this.settings.sourceLanguage === "auto") this.sessionLanguageLearner.observe(chosen);
      this.displayedCandidate = chosen;
      this.displayedAt = performance.now();
      this.pendingInterimSwitch = null;
      this.onFinal?.(chosen);
    }
  }

  async updateSettings(settings) {
    const sourceChanged = settings.sourceLanguage !== this.settings.sourceLanguage
      || (settings.preferredLanguages || []).join(",") !== (this.settings.preferredLanguages || []).join(",")
      || settings.useHololiveVocabulary !== this.settings.useHololiveVocabulary;
    this.settings = settings;
    if (!sourceChanged || !this.stream) return;
    const stream = this.stream;
    await this.start(stream, settings, { preserveSessionLearning: true });
  }

  async stop({ preserveSessionLearning = false } = {}) {
    this.generation += 1;
    if (this.finalTimer) clearTimeout(this.finalTimer);
    if (this.interimTimer) clearTimeout(this.interimTimer);
    this.finalTimer = null;
    this.interimTimer = null;
    this.finalCandidates = [];
    this.interimCandidates.clear();
    this.interimReceivedAt.clear();
    this.displayedCandidate = null;
    this.displayedAt = 0;
    this.pendingInterimSwitch = null;
    const recognizers = this.recognizers.splice(0);
    await Promise.allSettled(recognizers.map((recognizer) => recognizer.stop({ keepAudio: true })));
    this.stream = null;
    if (!preserveSessionLearning) this.sessionLanguageLearner.reset();
  }
}

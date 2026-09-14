import { getSpeechRecognitionConstructor, ensureSpeechLanguage } from "./speech-language.js";
import { speechError, TranslatorState } from "./speech-state.js";
import { TranscriptSegmenter } from "./transcript-segmenter.js";

const RESTART_DELAYS = [500, 1000, 2000, 5000];
const RECOGNITION_END_TIMEOUT_MS = 1000;

async function abortAndWaitForEnd(recognition) {
  let timer = null;
  let resolveEnded;
  const ended = new Promise((resolve) => {
    resolveEnded = resolve;
  });
  const previousOnEnd = recognition.onend;
  const finish = () => {
    if (!resolveEnded) return;
    const resolve = resolveEnded;
    resolveEnded = null;
    if (timer) clearTimeout(timer);
    resolve();
  };
  recognition.onend = (event) => {
    try {
      previousOnEnd?.call(recognition, event);
    } finally {
      finish();
    }
  };
  timer = setTimeout(finish, RECOGNITION_END_TIMEOUT_MS);
  try {
    recognition.abort();
  } catch {
    finish();
  }
  await ended;
}

export function applySpeechPhraseHints(recognition, phraseHints = [], scope = globalThis) {
  const Phrase = scope.SpeechRecognitionPhrase;
  if (!("phrases" in recognition) || typeof Phrase !== "function" || phraseHints.length === 0) return false;
  try {
    recognition.phrases = phraseHints.map(({ phrase, boost }) => new Phrase(phrase, Math.min(10, Math.max(0, Number(boost) || 0))));
    return true;
  } catch {
    return false;
  }
}

export class SpeechRecognizer {
  constructor({ onInterim, onFinal, onState, onError, manageAudioOutput = true, stopStream = true } = {}) {
    this.onInterim = onInterim;
    this.onFinal = onFinal;
    this.onState = onState;
    this.onError = onError;
    this.manageAudioOutput = manageAudioOutput;
    this.stopStream = stopStream;
    this.settings = { sourceLanguage: "en-US" };
    this.stream = null;
    this.track = null;
    this.audioContext = null;
    this.recognition = null;
    this.shouldRun = false;
    this.restartTimer = null;
    this.restartAttempt = 0;
    this.isStarting = false;
    this.segmenters = new Map();
  }

  async start(stream, settings = this.settings) {
    await this.stop({ keepAudio: false });
    this.settings = settings;
    this.stream = stream;
    this.track = stream?.getAudioTracks?.()[0] || null;
    if (!this.track) {
      const error = speechError("no_audio");
      this.onError?.(error);
      throw Object.assign(new Error(error.message), error);
    }

    this.shouldRun = true;
    this.onState?.(TranslatorState.INITIALIZING);
    if (this.manageAudioOutput) await this.restoreAudioOutput(stream);
    await ensureSpeechLanguage({
      language: this.settings.sourceLanguage,
      onState: (state) => this.onState?.(state)
    });
    await this.startRecognition();
  }

  async restoreAudioOutput(stream) {
    if (!stream || typeof AudioContext === "undefined") return;
    try {
      this.audioContext = new AudioContext();
      const source = this.audioContext.createMediaStreamSource(stream);
      source.connect(this.audioContext.destination);
      if (this.audioContext.state === "suspended") await this.audioContext.resume();
    } catch (error) {
      const failure = speechError("start_failed", error instanceof Error ? error.message : "音声の出力を復元できませんでした。");
      this.onError?.(failure);
      throw Object.assign(new Error(failure.message), failure);
    }
  }

  createRecognition() {
    const Constructor = getSpeechRecognitionConstructor();
    if (!Constructor) {
      const error = speechError("unavailable");
      throw Object.assign(new Error(error.message), error);
    }
    const recognition = new Constructor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.lang = this.settings.sourceLanguage;
    if (!("processLocally" in recognition)) {
      const error = speechError("local_unavailable");
      throw Object.assign(new Error(error.message), error);
    }
    recognition.processLocally = true;
    applySpeechPhraseHints(recognition, this.settings.phraseHints);

    let lastFinalIndex = -1;
    recognition.onresult = (event) => {
      if (!this.shouldRun || this.recognition !== recognition) return;
      // Include unchanged interim entries: resultIndex only identifies the first
      // changed entry, not the start of the entire pending utterance.
      for (let index = lastFinalIndex + 1; index < event.results.length; index += 1) {
        const result = event.results[index];
        const alternative = result?.[0];
        const text = alternative?.transcript?.trim();
        if (!text) continue;
        const candidate = {
          text,
          sourceLanguage: this.settings.sourceLanguage,
          confidence: Number.isFinite(alternative.confidence) ? alternative.confidence : 0,
          timestamp: performance.now()
        };
        if (result.isFinal) {
          lastFinalIndex = index;
        }
        let segmenter = this.segmenters.get(index);
        if (!segmenter) {
          segmenter = new TranscriptSegmenter({
            language: candidate.sourceLanguage,
            preferNativeFinal: this.settings.preferNativeFinal !== false,
            onSegment: (segment) => this.onFinal?.(segment),
            onInterim: (segment) => this.onInterim?.(segment)
          });
          this.segmenters.set(index, segmenter);
        }
        segmenter.update(candidate, result.isFinal);
        if (result.isFinal) {
          segmenter.dispose();
          this.segmenters.delete(index);
        }
      }
      for (const [index, segmenter] of this.segmenters) {
        if (index >= event.results.length || !event.results[index]?.[0]?.transcript?.trim()) {
          segmenter.dispose();
          this.segmenters.delete(index);
        }
      }
    };

    recognition.onerror = (event) => {
      if (event.error === "aborted" && !this.shouldRun) return;
      if (event.error === "no-speech") {
        this.onState?.(TranslatorState.PAUSED);
        return;
      }
      const code = event.error === "not-allowed" ? "not_allowed" : event.error === "no-speech" ? "no_audio" : event.error === "language-not-supported" ? "language_unavailable" : "start_failed";
      if (["not-allowed", "language-not-supported", "audio-capture"].includes(event.error)) this.shouldRun = false;
      this.onError?.(speechError(code, event.message));
    };

    recognition.onstart = () => {
      this.restartAttempt = 0;
      this.onState?.(TranslatorState.LISTENING);
    };

    recognition.onend = () => {
      // Ignore a late end from an instance already replaced during settings changes.
      if (this.recognition && this.recognition !== recognition) return;
      this.clearSegmenters();
      this.recognition = null;
      if (!this.shouldRun) {
        this.onState?.(TranslatorState.IDLE);
        return;
      }
      this.onState?.(TranslatorState.PAUSED);
      this.scheduleRestart();
    };
    return recognition;
  }

  async startRecognition() {
    if (!this.shouldRun || !this.track || this.track.readyState !== "live" || this.isStarting) return;
    this.isStarting = true;
    try {
      this.recognition = this.createRecognition();
      try {
        this.recognition.start(this.track);
      } catch (error) {
        const failure = speechError("audio_track_unavailable", error instanceof Error ? error.message : "タブ音声の入力を利用できません。");
        this.onError?.(failure);
        throw Object.assign(new Error(failure.message), failure);
      }
    } finally {
      this.isStarting = false;
    }
  }

  clearSegmenters() {
    for (const segmenter of this.segmenters.values()) segmenter.dispose();
    this.segmenters.clear();
  }

  discardPendingTranscript() {
    for (const segmenter of this.segmenters.values()) segmenter.discardPending();
  }

  scheduleRestart() {
    if (this.restartTimer || !this.shouldRun) return;
    const delay = RESTART_DELAYS[Math.min(this.restartAttempt, RESTART_DELAYS.length - 1)];
    this.restartAttempt += 1;
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null;
      this.startRecognition().catch((error) => {
        if (!this.shouldRun) return;
        this.onError?.(error.code ? error : speechError("start_failed", error?.message));
        this.scheduleRestart();
      });
    }, delay);
  }

  async updateSettings(settings) {
    const wasRunning = this.shouldRun;
    this.settings = settings;
    if (!wasRunning) return;

    this.shouldRun = false;
    this.clearSegmenters();
    if (this.restartTimer) clearTimeout(this.restartTimer);
    this.restartTimer = null;
    const recognition = this.recognition;
    this.recognition = null;
    try {
      if (recognition) await abortAndWaitForEnd(recognition);
    } catch {
      // Recognition may already have ended.
    }

    await ensureSpeechLanguage({
      language: this.settings.sourceLanguage,
      onState: (state) => this.onState?.(state)
    });
    this.shouldRun = true;
    await this.startRecognition();
  }

  async stop({ keepAudio = false } = {}) {
    this.shouldRun = false;
    this.clearSegmenters();
    if (this.restartTimer) clearTimeout(this.restartTimer);
    this.restartTimer = null;
    this.restartAttempt = 0;
    const recognition = this.recognition;
    this.recognition = null;
    if (recognition) {
      await abortAndWaitForEnd(recognition);
    }
    if (this.audioContext) {
      try {
        await this.audioContext.close();
      } catch {
        // The context can already be closed when the tab is navigated.
      }
      this.audioContext = null;
    }
    if (!keepAudio && this.stopStream && this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
    }
    this.stream = null;
    this.track = null;
  }
}

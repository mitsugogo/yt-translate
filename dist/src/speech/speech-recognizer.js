import { getSpeechRecognitionConstructor, ensureSpeechLanguage } from "./speech-language.js";
import { speechError, TranslatorState } from "./speech-state.js";

const RESTART_DELAYS = [500, 1000, 2000, 5000];

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

    recognition.onresult = (event) => {
      const interim = [];
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
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
          this.onFinal?.(candidate);
        } else {
          interim.push(candidate);
        }
      }
      if (interim.length > 0) {
        this.onInterim?.({
          text: interim.map((candidate) => candidate.text).join(" "),
          sourceLanguage: this.settings.sourceLanguage,
          confidence: Math.max(...interim.map((candidate) => candidate.confidence)),
          timestamp: performance.now()
        });
      }
    };

    recognition.onerror = (event) => {
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
    if (this.restartTimer) clearTimeout(this.restartTimer);
    this.restartTimer = null;
    const recognition = this.recognition;
    this.recognition = null;
    try {
      recognition?.abort();
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
    if (this.restartTimer) clearTimeout(this.restartTimer);
    this.restartTimer = null;
    this.restartAttempt = 0;
    const recognition = this.recognition;
    this.recognition = null;
    if (recognition) {
      try {
        recognition.abort();
      } catch {
        // Recognition may already have ended.
      }
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

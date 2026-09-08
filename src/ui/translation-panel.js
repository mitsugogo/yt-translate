import { MessageType, TranslatorState } from "../shared/messages.js";
import { formatLanguageDirection } from "../shared/settings.js";

const PANEL_STYLE = `
:host { --yt-local-translator-font-size: 15px; all: initial; display: block; color-scheme: light dark; }
*, *::before, *::after { box-sizing: border-box; }
.panel { position:relative; margin:4px 0 12px; padding:12px 48px 12px 18px; min-height:82px; border:1px solid rgba(128,128,128,.28); border-radius:12px; background:rgba(128,128,128,.09); color:#181818; font:400 var(--yt-local-translator-font-size)/1.45 system-ui,sans-serif; }
.footer { display:flex; align-items:center; gap:8px; }
.brand { font-weight: 650; flex:1; }
.direction { font: 600 11px/1 system-ui,sans-serif; opacity:.66; }
.state { font-size:12px; opacity:.72; }
.dot { width:8px; height:8px; border-radius:50%; background:#777; }
.dot.listening { background:#19a463; box-shadow:0 0 0 3px rgba(25,164,99,.15); }
.dot.error { background:#d33; }
.text { min-height:44px; max-height:92px; overflow:auto; }
.line { white-space:pre-wrap; overflow-wrap:anywhere; }
.translation { margin-top:5px; font-weight:600; }
.empty, .detail { opacity:.62; font-size:12px; }
.model-progress { margin-top:10px; }
.progress-track { height:5px; overflow:hidden; border-radius:999px; background:rgba(128,128,128,.24); }
.progress-bar { display:block; width:0; height:100%; border-radius:inherit; background:#0b65c2; transition:width .18s ease; }
.progress-bar.indeterminate { width:38%; animation:progress-slide 1.1s ease-in-out infinite alternate; }
@keyframes progress-slide { from { transform:translateX(-105%); } to { transform:translateX(260%); } }
.footer { margin-top:10px; }
.dismiss { position:absolute; top:8px; right:10px; appearance:none; width:28px; height:28px; border:0; border-radius:50%; padding:0; color:inherit; background:transparent; cursor:pointer; font:400 20px/28px system-ui,sans-serif; opacity:.7; }
.dismiss:hover { background:rgba(128,128,128,.18); opacity:1; }
.warning { margin-top:10px; color:#a22; font-size:12px; }
@media (prefers-color-scheme: dark) { .panel { color:#f1f1f1; background:rgba(255,255,255,.08); border-color:rgba(255,255,255,.18); } .warning { color:#ff9b9b; } }
`;

const STATUS_LABELS = {
  [TranslatorState.IDLE]: "準備完了",
  [TranslatorState.INITIALIZING]: "準備中…",
  [TranslatorState.DOWNLOADING]: "モデルを準備中…",
  [TranslatorState.LISTENING]: "翻訳中",
  [TranslatorState.PAUSED]: "一時停止",
  [TranslatorState.ERROR]: "エラー"
};

export class TranslationPanel {
  constructor({ onDismiss } = {}) {
    this.onDismiss = onDismiss;
    this.host = null;
    this.root = null;
    this.state = TranslatorState.IDLE;
    this.features = null;
    this.settings = null;
    this.currentTranscriptId = null;
  }

  mount(target) {
    if (!target?.parent) return false;
    this.host = document.createElement("yt-local-translator");
    this.host.dataset.extension = "youtube-local-translator";
    this.host.dataset.videoId = "";
    this.root = this.host.attachShadow({ mode: "open" });
    this.root.innerHTML = `
      <style>${PANEL_STYLE}</style>
      <section class="panel" aria-label="リアルタイム翻訳">
        <button type="button" class="dismiss" data-action="dismiss" aria-label="翻訳パネルを閉じる">×</button>
        <div class="text">
          <div class="line original" data-role="original"></div>
          <div class="line translation" data-role="translation"></div>
          <div class="empty" data-role="empty">音声を待っています…</div>
        </div>
        <div class="warning" data-role="warning" hidden></div>
        <div class="detail" data-role="detail" hidden></div>
        <div class="model-progress" data-role="progress" hidden>
          <div class="progress-track"><span class="progress-bar indeterminate" data-role="progress-bar"></span></div>
          <div class="detail" data-role="progress-label">モデルを準備中…</div>
        </div>
        <div class="footer">
          <span class="brand">リアルタイム翻訳</span>
          <span class="dot" data-role="dot" aria-hidden="true"></span>
          <span class="state" data-role="state">準備完了</span>
          <span class="direction" data-role="direction">EN → JA</span>
        </div>
      </section>
    `;
    target.parent.insertBefore(this.host, target.before || null);
    this.bindEvents();
    return true;
  }

  bindEvents() {
    this.root.querySelector('[data-action="dismiss"]').addEventListener("click", () => this.onDismiss?.());
  }

  setVideoId(videoId) {
    if (this.host) this.host.dataset.videoId = videoId || "";
  }

  setSettings(settings) {
    this.settings = settings;
    if (!this.root) return;
    this.root.querySelector('[data-role="original"]').hidden = settings.showOriginal === false;
    this.root.querySelector('[data-role="translation"]').hidden = settings.showTranslation === false;
    this.host.style.setProperty("--yt-local-translator-font-size", `${settings.fontSize}px`);
    this.root.querySelector('[data-role="direction"]').textContent = formatLanguageDirection(settings.sourceLanguage, settings.targetLanguage);
    this.renderEmptyState();
  }

  setFeatures(features) {
    this.features = features;
    if (!this.root || !features) return;
    const unsupported = [];
    if (!features.speech?.local || features.speech?.status === "unavailable") unsupported.push(features.speech?.message || "この環境では端末内の音声認識を利用できません。");
    if (!features.translator?.supported || features.translator?.status === "unavailable") unsupported.push(features.translator?.message || "この環境ではChromeの翻訳機能を利用できません。");
    this.setWarning(unsupported.join(" "));
  }

  setState(state, detail = "", progress = null) {
    this.state = state;
    if (!this.root) return;
    const dot = this.root.querySelector('[data-role="dot"]');
    dot.classList.toggle("listening", state === TranslatorState.LISTENING);
    dot.classList.toggle("error", state === TranslatorState.ERROR);
    this.root.querySelector('[data-role="state"]').textContent = STATUS_LABELS[state] || state;
    this.setDetail(detail);
    this.setProgress(state === TranslatorState.DOWNLOADING, progress, detail);
  }

  setTranscript(text, isFinal, id = null) {
    if (!this.root) return;
    if (id && id !== this.currentTranscriptId) {
      this.currentTranscriptId = id;
      this.root.querySelector('[data-role="translation"]').textContent = "";
    }
    this.root.querySelector('[data-role="original"]').textContent = text || "";
    this.root.querySelector('[data-role="original"]').dataset.final = String(Boolean(isFinal));
    this.renderEmptyState();
  }

  setTranslation(text, id = null) {
    if (!this.root) return;
    if (id && this.currentTranscriptId && id !== this.currentTranscriptId) return;
    this.root.querySelector('[data-role="translation"]').textContent = text || "";
    this.renderEmptyState();
  }

  setTranslationResult(original, translated, id = null) {
    if (id && this.currentTranscriptId && id !== this.currentTranscriptId) return;
    this.setTranscript(original, true, id);
    this.setTranslation(translated, id);
  }

  setWarning(message) {
    if (!this.root) return;
    const warning = this.root.querySelector('[data-role="warning"]');
    warning.textContent = message || "";
    warning.hidden = !message;
  }

  setError(message) {
    this.setState(TranslatorState.ERROR, message);
    this.setWarning(message);
  }

  setDetail(message) {
    if (!this.root) return;
    const detail = this.root.querySelector('[data-role="detail"]');
    detail.textContent = message || "";
    detail.hidden = !message;
  }

  setProgress(visible, progress = null, detail = "") {
    if (!this.root) return;
    const container = this.root.querySelector('[data-role="progress"]');
    const bar = this.root.querySelector('[data-role="progress-bar"]');
    const label = this.root.querySelector('[data-role="progress-label"]');
    container.hidden = !visible;
    if (!visible) return;
    const hasProgress = Number.isFinite(progress);
    const bounded = hasProgress ? Math.min(1, Math.max(0, progress)) : 0;
    bar.classList.toggle("indeterminate", !hasProgress);
    bar.style.width = hasProgress ? `${Math.round(bounded * 100)}%` : "38%";
    bar.parentElement.setAttribute("role", "progressbar");
    bar.parentElement.setAttribute("aria-valuemin", "0");
    bar.parentElement.setAttribute("aria-valuemax", "100");
    if (hasProgress) bar.parentElement.setAttribute("aria-valuenow", String(Math.round(bounded * 100)));
    else bar.parentElement.removeAttribute("aria-valuenow");
    label.textContent = detail || (hasProgress ? `${Math.round(bounded * 100)}%` : "モデルを準備中…");
  }

  renderEmptyState() {
    if (!this.root) return;
    const original = this.root.querySelector('[data-role="original"]');
    const translation = this.root.querySelector('[data-role="translation"]');
    this.root.querySelector('[data-role="empty"]').hidden = Boolean(original.textContent || translation.textContent);
  }

  remove() {
    this.host?.remove();
    this.host = null;
    this.root = null;
    this.currentTranscriptId = null;
  }
}

(() => {
"use strict";
const modules = [];
modules[1] = (() => {
const MessageType = Object.freeze({
  CONTENT_READY: "content:ready",
  GET_SETTINGS: "settings:get",
  SETTINGS_UPDATED: "settings:updated",
  SET_ENABLED: "settings:set-enabled",
  GET_POPUP_STATE: "popup:get-state",
  POPUP_LANGUAGE: "popup:language",
  PREPARE_MODELS: "models:prepare",
  REQUEST_FEATURES: "features:request",
  REQUEST_PAGE_CONTEXT: "page-context:request",
  START: "session:start",
  STOP: "session:stop",
  START_CAPTURE: "session:start-capture",
  OFFSCREEN_STOP: "session:offscreen-stop",
  OFFSCREEN_SETTINGS: "session:offscreen-settings",
  CHECK_FEATURES: "features:check",
  OFFSCREEN_FEATURES: "features:offscreen-result",
  OFFSCREEN_STATE: "session:state",
  OFFSCREEN_TRANSCRIPT: "transcript:result",
  OFFSCREEN_TRANSLATION: "translation:result",
  OFFSCREEN_ERROR: "pipeline:error"
});

const TranslatorState = Object.freeze({
  IDLE: "idle",
  INITIALIZING: "initializing",
  DOWNLOADING: "downloading",
  LISTENING: "listening",
  PAUSED: "paused",
  ERROR: "error"
});

return { MessageType, TranslatorState };
})();
modules[2] = (() => {
const DEFAULT_SETTINGS = Object.freeze({
  settingsVersion: 3,
  enabled: false,
  sourceLanguage: "auto",
  autoLanguagePreference: "channel",
  targetLanguage: "ja",
  showOriginal: true,
  showTranslation: true,
  fontSize: 15
});

const SOURCE_LANGUAGE_OPTIONS = Object.freeze([
  Object.freeze({ value: "auto", label: "自動（日本語・英語・インドネシア語）" }),
  Object.freeze({ value: "en-US", label: "English" }),
  Object.freeze({ value: "ja-JP", label: "Japanese" }),
  Object.freeze({ value: "id-ID", label: "Bahasa Indonesia" })
]);

const TARGET_LANGUAGE_OPTIONS = Object.freeze([
  Object.freeze({ value: "en", label: "English" }),
  Object.freeze({ value: "ja", label: "Japanese" }),
  Object.freeze({ value: "id", label: "Bahasa Indonesia" })
]);

const AUTO_SPEECH_LANGUAGES = Object.freeze(["ja-JP", "en-US", "id-ID"]);

const AUTO_LANGUAGE_PREFERENCE_OPTIONS = Object.freeze([
  Object.freeze({ value: "channel", label: "チャンネルから推定" }),
  Object.freeze({ value: "ja", label: "日本語" }),
  Object.freeze({ value: "en", label: "英語" }),
  Object.freeze({ value: "id", label: "インドネシア語" }),
  Object.freeze({ value: "none", label: "優先なし" })
]);

const SOURCE_LANGUAGE_VALUES = new Set(SOURCE_LANGUAGE_OPTIONS.map((option) => option.value));
const TARGET_LANGUAGE_VALUES = new Set(TARGET_LANGUAGE_OPTIONS.map((option) => option.value));
const AUTO_LANGUAGE_PREFERENCE_VALUES = new Set(AUTO_LANGUAGE_PREFERENCE_OPTIONS.map((option) => option.value));

const SETTINGS_KEY = "settings";

function normalizeSettings(value = {}) {
  const fontSize = Number(value.fontSize);
  const sourceLanguage = SOURCE_LANGUAGE_VALUES.has(value.sourceLanguage) ? value.sourceLanguage : DEFAULT_SETTINGS.sourceLanguage;
  const autoLanguagePreference = AUTO_LANGUAGE_PREFERENCE_VALUES.has(value.autoLanguagePreference) ? value.autoLanguagePreference : DEFAULT_SETTINGS.autoLanguagePreference;
  const requestedTarget = TARGET_LANGUAGE_VALUES.has(value.targetLanguage) ? value.targetLanguage : DEFAULT_SETTINGS.targetLanguage;
  const targetLanguage = toModelLanguage(sourceLanguage) === requestedTarget ? getTargetLanguageForSource(sourceLanguage) : requestedTarget;
  return {
    settingsVersion: 3,
    enabled: value.enabled === true,
    sourceLanguage,
    autoLanguagePreference,
    targetLanguage,
    showOriginal: value.showOriginal !== false,
    showTranslation: value.showTranslation !== false,
    fontSize: Number.isFinite(fontSize) ? Math.min(22, Math.max(12, Math.round(fontSize))) : DEFAULT_SETTINGS.fontSize
  };
}

async function readSettings() {
  const result = await chrome.storage.local.get(SETTINGS_KEY);
  const stored = result[SETTINGS_KEY];
  const migrated = stored && stored.settingsVersion === 3 ? stored : { ...stored, autoLanguagePreference: "channel" };
  return normalizeSettings(migrated);
}

async function writeSettings(patch) {
  const settings = normalizeSettings({ ...(await readSettings()), ...patch });
  await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
  return settings;
}

function toModelLanguage(language) {
  if (language === "auto") return "auto";
  return language.split("-")[0].toLowerCase();
}

function getTargetLanguageForSource(sourceLanguage) {
  const source = toModelLanguage(sourceLanguage);
  if (source === "ja") return "en";
  return "ja";
}

function getSpeechLanguagesForSource(sourceLanguage) {
  return sourceLanguage === "auto" ? [...AUTO_SPEECH_LANGUAGES] : [sourceLanguage];
}

function resolveAutoLanguagePreference(preference, channelLanguageHint = null) {
  if (preference === "channel") return ["ja", "en", "id"].includes(channelLanguageHint) ? channelLanguageHint : null;
  return ["ja", "en", "id"].includes(preference) ? preference : null;
}

function getLanguageLabel(language) {
  const modelLanguage = toModelLanguage(language);
  if (modelLanguage === "auto") return "JA / EN / ID";
  return modelLanguage === "en" ? "EN" : modelLanguage === "ja" ? "JA" : modelLanguage.toUpperCase();
}

function formatLanguageDirection(sourceLanguage, targetLanguage) {
  return `${getLanguageLabel(sourceLanguage)} → ${getLanguageLabel(targetLanguage)}`;
}

function getJapaneseLanguageLabel(language, fallback = "判定中") {
  if (typeof language !== "string" || language === "auto") return fallback;
  const modelLanguage = toModelLanguage(language);
  if (modelLanguage === "ja") return "日本語";
  if (modelLanguage === "en") return "英語";
  if (modelLanguage === "id") return "インドネシア語";
  return fallback;
}

function formatActiveTranslationStatus(detectedLanguage, targetLanguage) {
  return `翻訳中・${getJapaneseLanguageLabel(detectedLanguage)}→${getJapaneseLanguageLabel(targetLanguage, "未設定")}`;
}

function shouldTranslateSource(sourceLanguage, targetLanguage) {
  return toModelLanguage(sourceLanguage) !== toModelLanguage(targetLanguage);
}

function getVideoId(url = "") {
  try {
    const parsed = new URL(url);
    if (parsed.pathname === "/watch") return parsed.searchParams.get("v");
    const parts = parsed.pathname.split("/").filter(Boolean);
    if (parts[0] === "live" || parts[0] === "shorts") return parts[1] || null;
  } catch {
    return null;
  }
  return null;
}

function isYouTubeVideoUrl(url = "") {
  try {
    const parsed = new URL(url);
    const isYouTubeHost = parsed.hostname === "youtube.com" || parsed.hostname === "www.youtube.com";
    return isYouTubeHost && Boolean(getVideoId(url));
  } catch {
    return false;
  }
}

return { DEFAULT_SETTINGS, SOURCE_LANGUAGE_OPTIONS, TARGET_LANGUAGE_OPTIONS, AUTO_SPEECH_LANGUAGES, AUTO_LANGUAGE_PREFERENCE_OPTIONS, normalizeSettings, readSettings, writeSettings, toModelLanguage, getTargetLanguageForSource, getSpeechLanguagesForSource, resolveAutoLanguagePreference, getLanguageLabel, formatLanguageDirection, getJapaneseLanguageLabel, formatActiveTranslationStatus, shouldTranslateSource, getVideoId, isYouTubeVideoUrl };
})();
modules[3] = (() => {
const { getVideoId: getSharedVideoId } = modules[2];
function getVideoId(url = location.href) {
  return getSharedVideoId(url);
}

function isVideoPage(url = location.href) {
  return Boolean(getVideoId(url));
}

function findTranslationInsertionPoint(doc = document) {
  const metadata = doc.querySelector("ytd-watch-flexy #below ytd-watch-metadata, ytd-watch-metadata, #above-the-fold #title, #below #title");
  if (metadata?.parentElement) return { parent: metadata.parentElement, before: metadata };

  const below = doc.querySelector("ytd-watch-flexy #below, #below, #below-the-fold");
  if (below) return { parent: below, before: below.firstElementChild || null };

  const player = doc.querySelector("ytd-watch-flexy #player-container-outer");
  if (player?.parentElement) return { parent: player.parentElement, before: player.nextSibling };
  return null;
}

function hasPanel(doc = document) {
  return Boolean(doc.querySelector("yt-local-translator"));
}

return { getVideoId, isVideoPage, findTranslationInsertionPoint, hasPanel };
})();
modules[5] = (() => {
// Official display names are kept together so speech hints and exact glossary
// translations use the same canonical spelling.
const MEMBERS = [
  ["ときのそら", "Tokino Sora"], ["ロボ子さん", "Robocosan"], ["アキ・ローゼンタール", "Aki Rosenthal"],
  ["赤井はあと", "Akai Haato"], ["白上フブキ", "Shirakami Fubuki"], ["夏色まつり", "Natsuiro Matsuri"],
  ["百鬼あやめ", "Nakiri Ayame"], ["癒月ちょこ", "Yuzuki Choco"], ["大空スバル", "Oozora Subaru"],
  ["AZKi", "AZKi"], ["大神ミオ", "Ookami Mio"], ["さくらみこ", "Sakura Miko"],
  ["猫又おかゆ", "Nekomata Okayu"], ["戌神ころね", "Inugami Korone"], ["星街すいせい", "Hoshimachi Suisei"],
  ["兎田ぺこら", "Usada Pekora"], ["不知火フレア", "Shiranui Flare"], ["白銀ノエル", "Shirogane Noel"],
  ["宝鐘マリン", "Houshou Marine"], ["角巻わため", "Tsunomaki Watame"], ["常闇トワ", "Tokoyami Towa"],
  ["姫森ルーナ", "Himemori Luna"], ["雪花ラミィ", "Yukihana Lamy"], ["桃鈴ねね", "Momosuzu Nene"],
  ["獅白ぼたん", "Shishiro Botan"], ["尾丸ポルカ", "Omaru Polka"], ["ラプラス・ダークネス", "La+ Darknesss"],
  ["鷹嶺ルイ", "Takane Lui"], ["博衣こより", "Hakui Koyori"], ["風真いろは", "Kazama Iroha"],
  ["沙花叉クロヱ", "Sakamata Chloe"], ["音乃瀬奏", "Otonose Kanade"], ["一条莉々華", "Ichijou Ririka"],
  ["儒烏風亭らでん", "Juufuutei Raden"], ["轟はじめ", "Todoroki Hajime"], ["響咲リオナ", "Isaki Riona"],
  ["虎金妃笑虎", "Koganei Niko"], ["水宮枢", "Mizumiya Su"], ["輪堂千速", "Rindo Chihaya"],
  ["綺々羅々ヴィヴィ", "Kikirara Vivi"], ["井月みちる", "Izuki Michiru"], ["花園さやか", "Hanazono Sayaka"],
  ["風白ゆき", "Kazeshiro Yuki"], ["アユンダ・リス", "Ayunda Risu"], ["ムーナ・ホシノヴァ", "Moona Hoshinova"],
  ["アイラニ・イオフィフティーン", "Airani Iofifteen"], ["クレイジー・オリー", "Kureiji Ollie"],
  ["アーニャ・メルフィッサ", "Anya Melfissa"], ["パヴォリア・レイネ", "Pavolia Reine"],
  ["ベスティア・ゼータ", "Vestia Zeta"], ["カエラ・コヴァルスキア", "Kaela Kovalskia"],
  ["こぼ・かなえる", "Kobo Kanaeru"], ["森カリオペ", "Mori Calliope"], ["小鳥遊キアラ", "Takanashi Kiara"],
  ["一伊那尓栖", "Ninomae Ina'nis"], ["IRyS", "IRyS"], ["オーロ・クロニー", "Ouro Kronii"],
  ["ハコス・ベールズ", "Hakos Baelz"], ["シオリ・ノヴェラ", "Shiori Novella"], ["古石ビジュー", "Koseki Bijou"],
  ["ネリッサ・レイヴンクロフト", "Nerissa Ravencroft"], ["フワワ・アビスガード", "Fuwawa Abyssgard"],
  ["モココ・アビスガード", "Mococo Abyssgard"], ["エリザベス・ローズ・ブラッドフレイム", "Elizabeth Rose Bloodflame"],
  ["ジジ・ムリン", "Gigi Murin"], ["セシリア・イマーグリーン", "Cecilia Immergreen"],
  ["ラオーラ・パンテーラ", "Raora Panthera"], ["ワトソン・アメリア", "Watson Amelia"],
  ["がうる・ぐら", "Gawr Gura"], ["九十九佐命", "Tsukumo Sana"], ["セレス・ファウナ", "Ceres Fauna"],
  ["七詩ムメイ", "Nanashi Mumei"], ["湊あくあ", "Minato Aqua"], ["紫咲シオン", "Murasaki Shion"],
  ["天音かなた", "Amane Kanata"], ["桐生ココ", "Kiryu Coco"], ["火威青", "Hiodoshi Ao"]
];

const JAPANESE_TERMS = [
  ["あえんびえん", 8], ["ホロライブ", 6], ["ホロメン", 6], ["ホロリス", 5],
  ["ホロックス", 6], ["リグロス", 6], ["フロウグロウ", 6], ["みこち", 5],
  ["すいちゃん", 4], ["ぺこら", 4], ["船長", 3], ["団長", 3], ["こんこよ", 5],
  ["こんぺこ", 5], ["おつぺこ", 5], ["にぇ", 3], ["しゅば", 3], ["んなたん", 4], ["やごー", 4]
];

const LATIN_TERMS = [
  ["hololive", 6], ["holoEN", 6], ["holoID", 6], ["holoX", 6], ["ReGLOSS", 6],
  ["FLOW GLOW", 6], ["FUWAMOCO", 6], ["YAGOO", 5], ["aenbien", 8]
];

const EXACT_GLOSSARY = [
  { terms: ["あえんびえん", "aenbien"], ja: "あえんびえん", en: "aenbien (pandemonium)", id: "aenbien (kekacauan)" },
  ...MEMBERS.map(([ja, en]) => ({ terms: [ja, en], ja, en, id: en }))
];

function uniquePhrases(entries) {
  const seen = new Set();
  return entries.filter(({ phrase }) => {
    const key = phrase.toLocaleLowerCase("en-US");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function getHololiveSpeechPhrases(language) {
  const modelLanguage = String(language).split("-")[0].toLowerCase();
  const names = MEMBERS.map(([ja, en]) => ({ phrase: modelLanguage === "ja" ? ja : en, boost: 5 }));
  const terms = (modelLanguage === "ja" ? JAPANESE_TERMS : LATIN_TERMS).map(([phrase, boost]) => ({ phrase, boost }));
  return uniquePhrases([...names, ...terms]);
}

function isKnownHololiveMember(value) {
  const normalized = String(value).toLocaleLowerCase("en-US");
  return MEMBERS.some(([ja, en]) => normalized.includes(ja.toLocaleLowerCase("en-US")) || normalized.includes(en.toLocaleLowerCase("en-US")));
}

function getExactHololiveTranslation(text, targetLanguage) {
  const normalized = String(text).trim().replace(/[。．.!！?？]+$/u, "").trim().toLocaleLowerCase("en-US");
  if (!normalized) return null;
  const entry = EXACT_GLOSSARY.find(({ terms }) => terms.some((term) => term.toLocaleLowerCase("en-US") === normalized));
  if (!entry) return null;
  const target = String(targetLanguage).split("-")[0].toLowerCase();
  return entry[target] || entry.en;
}

return { getHololiveSpeechPhrases, isKnownHololiveMember, getExactHololiveTranslation };
})();
modules[4] = (() => {
const ENGLISH_BRANCH_MEMBERS = [
  "mori calliope", "takanashi kiara", "ninomae ina'nis", "ninomae ina’nis", "irys",
  "ouro kronii", "hakos baelz", "shiori novella", "koseki bijou", "nerissa ravencroft",
  "fuwawa abyssgard", "mococo abyssgard", "fuwamoco", "elizabeth rose bloodflame",
  "gigi murin", "cecilia immergreen", "raora panthera", "watson amelia", "gawr gura",
  "tsukumo sana", "ceres fauna", "nanashi mumei"
];

const INDONESIA_BRANCH_MEMBERS = [
  "ayunda risu", "moona hoshinova", "airani iofifteen", "kureiji ollie", "anya melfissa",
  "pavolia reine", "vestia zeta", "kaela kovalskia", "kobo kanaeru"
];

const ENGLISH_BRANCH_PATTERNS = [/hololive[\s_-]*english/iu, /hololive[\s_-]*en\b/iu, /\bholo[\s_-]*en\b/iu, /#holoen\b/iu];
const INDONESIA_BRANCH_PATTERNS = [/hololive[\s_-]*indonesia/iu, /hololive[\s_-]*id\b/iu, /\bholo[\s_-]*id\b/iu, /#holoid\b/iu];
const JAPAN_BRANCH_PATTERNS = [/ホロライブ(?!\s*(?:english|indonesia))/iu, /hololive[\s_-]*(?:jp|japan)\b/iu, /#holojp\b/iu];
const JAPANESE_CHARACTERS = /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u;
const HOLOLIVE_CONTEXT_PATTERNS = [/hololive/iu, /ホロライブ/u, /\bholo(?:en|id|jp|x)\b/iu, /\bregloss\b/iu, /\bflow glow\b/iu];

function containsAny(value, terms) {
  const normalized = value.toLocaleLowerCase("en-US");
  return terms.some((term) => normalized.includes(term));
}

function matchesAny(value, patterns) {
  return patterns.some((pattern) => pattern.test(value));
}

function detectChannelLanguageHint({ channelIdentity = "", videoIdentity = "" } = {}) {
  const channel = String(channelIdentity);
  const video = String(videoIdentity);

  // EN and ID members normally speak English. Check these branches first because
  // Japanese video titles can still contain the generic ホロライブ label.
  if (containsAny(channel, ENGLISH_BRANCH_MEMBERS) || matchesAny(channel, ENGLISH_BRANCH_PATTERNS)) return "en";
  if (containsAny(channel, INDONESIA_BRANCH_MEMBERS) || matchesAny(channel, INDONESIA_BRANCH_PATTERNS)) return "en";
  if (matchesAny(channel, JAPAN_BRANCH_PATTERNS) || JAPANESE_CHARACTERS.test(channel)) return "ja";
  if (matchesAny(video, ENGLISH_BRANCH_PATTERNS) || matchesAny(video, INDONESIA_BRANCH_PATTERNS)) return "en";
  if (matchesAny(video, JAPAN_BRANCH_PATTERNS)) return "ja";
  return null;
}

function readNodeIdentity(node) {
  if (!node) return "";
  const attributes = ["href", "title", "aria-label", "content"].map((name) => node.getAttribute?.(name) || "");
  return [node.textContent || "", ...attributes].filter(Boolean).join(" ");
}

function readYoutubePageContext(doc = document) {
  const channelSelectors = [
    "ytd-watch-metadata ytd-channel-name a",
    "#owner ytd-channel-name a",
    "#upload-info #channel-name a",
    "link[itemprop='url']"
  ];
  const videoSelectors = ["ytd-watch-metadata h1", "h1.ytd-watch-metadata", "meta[name='title']"];
  const channelIdentity = channelSelectors.map((selector) => readNodeIdentity(doc.querySelector?.(selector))).filter(Boolean).join(" ");
  const videoIdentity = [
    ...videoSelectors.map((selector) => readNodeIdentity(doc.querySelector?.(selector))),
    doc.title || ""
  ].filter(Boolean).join(" ");
  return {
    channelLanguageHint: detectChannelLanguageHint({ channelIdentity, videoIdentity }),
    isHololive: isKnownHololiveMember(channelIdentity) || matchesAny(`${channelIdentity}\n${videoIdentity}`, HOLOLIVE_CONTEXT_PATTERNS)
  };
}
const { isKnownHololiveMember } = modules[5];
return { detectChannelLanguageHint, readYoutubePageContext };
})();
modules[6] = (() => {
class YoutubeNavigation {
  constructor(onNavigate) {
    this.onNavigate = onNavigate;
    this.currentUrl = "";
    this.currentVideoId = null;
    this.interval = null;
    this.handleEvent = () => this.check();
  }

  start() {
    document.addEventListener("yt-navigate-finish", this.handleEvent);
    window.addEventListener("popstate", this.handleEvent);
    window.addEventListener("hashchange", this.handleEvent);
    this.interval = window.setInterval(this.handleEvent, 1000);
    this.check();
  }

  check() {
    const url = location.href;
    let videoId = null;
    try {
      const parsed = new URL(url);
      if (parsed.pathname === "/watch") videoId = parsed.searchParams.get("v");
      else {
        const parts = parsed.pathname.split("/").filter(Boolean);
        if (parts[0] === "live" || parts[0] === "shorts") videoId = parts[1] || null;
      }
    } catch {
      videoId = null;
    }
    if (url === this.currentUrl && videoId === this.currentVideoId) return;
    const previous = { url: this.currentUrl, videoId: this.currentVideoId };
    this.currentUrl = url;
    this.currentVideoId = videoId;
    this.onNavigate?.({ url, videoId, previous });
  }

  dispose() {
    document.removeEventListener("yt-navigate-finish", this.handleEvent);
    window.removeEventListener("popstate", this.handleEvent);
    window.removeEventListener("hashchange", this.handleEvent);
    if (this.interval) window.clearInterval(this.interval);
    this.interval = null;
  }
}

return { YoutubeNavigation };
})();
modules[7] = (() => {
const { MessageType, TranslatorState } = modules[1];
const { formatLanguageDirection } = modules[2];
const PANEL_STYLE = `
:host { --yt-local-translator-font-size: 15px; all: initial; display: block; color-scheme: light dark; }
*, *::before, *::after { box-sizing: border-box; }
.panel { position:relative; margin:4px 0 12px; padding:12px 48px 12px 18px; min-height:82px; border:1px solid rgba(128,128,128,.28); border-radius:12px; background:rgba(128,128,128,.09); color:var(--yt-spec-text-primary,#181818); font:400 var(--yt-local-translator-font-size)/1.45 system-ui,sans-serif; }
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
:host-context(html[dark]) .panel { color:var(--yt-spec-text-primary,#f1f1f1); background:rgba(255,255,255,.08); border-color:rgba(255,255,255,.18); }
:host-context(html[dark]) .warning { color:#ff9b9b; }
`;

const STATUS_LABELS = {
  [TranslatorState.IDLE]: "準備完了",
  [TranslatorState.INITIALIZING]: "準備中…",
  [TranslatorState.DOWNLOADING]: "モデルを準備中…",
  [TranslatorState.LISTENING]: "翻訳中",
  [TranslatorState.PAUSED]: "一時停止",
  [TranslatorState.ERROR]: "エラー"
};

class TranslationPanel {
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
    if (state === TranslatorState.DOWNLOADING
      && (this.state === TranslatorState.LISTENING || this.state === TranslatorState.ERROR)) return;
    this.state = state;
    if (!this.root) return;
    const dot = this.root.querySelector('[data-role="dot"]');
    dot.classList.toggle("listening", state === TranslatorState.LISTENING);
    dot.classList.toggle("error", state === TranslatorState.ERROR);
    this.root.querySelector('[data-role="state"]').textContent = STATUS_LABELS[state] || state;
    this.setDetail(state === TranslatorState.DOWNLOADING || state === TranslatorState.ERROR ? "" : detail);
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
    const hasProgress = Number.isFinite(progress);
    const bounded = hasProgress ? Math.min(1, Math.max(0, progress)) : 0;
    const complete = hasProgress && bounded >= 1;
    container.hidden = !visible || complete;
    if (!visible || complete) return;
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

return { TranslationPanel };
})();
modules[0] = (() => {
const { MessageType, TranslatorState } = modules[1];
const { DEFAULT_SETTINGS } = modules[2];
const { getVideoId, findTranslationInsertionPoint } = modules[3];
const { readYoutubePageContext } = modules[4];
const { YoutubeNavigation } = modules[6];
const { TranslationPanel } = modules[7];
let currentVideoId = null;
let panel = null;
let settings = DEFAULT_SETTINGS;
let mountTimer = null;
let dismissedVideoId = null;
let observer = null;
let navigation = null;
let disposed = false;

function hasValidExtensionContext() {
  try {
    return typeof chrome !== "undefined" && Boolean(chrome.runtime?.id);
  } catch {
    return false;
  }
}

function disposeContentScript() {
  if (disposed) return;
  disposed = true;
  if (mountTimer) clearTimeout(mountTimer);
  mountTimer = null;
  observer?.disconnect();
  navigation?.dispose();
  removePanel();
}

async function send(message) {
  if (!hasValidExtensionContext()) {
    disposeContentScript();
    return { ok: false, code: "context_invalidated", error: "拡張機能が更新されました。YouTubeページを再読み込みしてください。" };
  }
  try {
    return await chrome.runtime.sendMessage(message);
  } catch (error) {
    if (!hasValidExtensionContext() || /Extension context invalidated/i.test(error?.message || "")) disposeContentScript();
    return { ok: false, error: error instanceof Error ? error.message : "拡張機能と通信できませんでした。" };
  }
}

function removePanel() {
  panel?.remove();
  panel = null;
}

function mountPanel() {
  if (disposed) return;
  if (!hasValidExtensionContext()) {
    disposeContentScript();
    return;
  }
  if (!settings.enabled || !currentVideoId || dismissedVideoId === currentVideoId || panel?.host?.isConnected) return;
  const insertionPoint = findTranslationInsertionPoint();
  if (!insertionPoint) {
    if (mountTimer) clearTimeout(mountTimer);
    mountTimer = setTimeout(() => {
      mountTimer = null;
      mountPanel();
    }, 500);
    return;
  }
  panel = new TranslationPanel({
    onDismiss: () => {
      dismissedVideoId = currentVideoId;
      const videoId = currentVideoId;
      removePanel();
      void send({ type: MessageType.STOP, videoId, reason: "dismiss" });
    }
  });
  if (!panel.mount(insertionPoint)) {
    panel = null;
    return;
  }
  panel.setVideoId(currentVideoId);
  panel.setSettings(settings);
  void send({ type: MessageType.REQUEST_FEATURES });
}

async function handleNavigation({ videoId, previous }) {
  if (disposed) return;
  if (previous.videoId && previous.videoId !== videoId) await send({ type: MessageType.STOP, videoId: previous.videoId, reason: "navigation" });
  currentVideoId = videoId;
  dismissedVideoId = null;
  removePanel();
  if (videoId) {
    mountPanel();
    void send({ type: MessageType.CONTENT_READY, videoId, pageContext: readYoutubePageContext() });
  }
}

function handleRuntimeMessage(message, _sender, sendResponse) {
  if (disposed) return;
  if (message.type === MessageType.REQUEST_PAGE_CONTEXT) {
    sendResponse({ ok: true, pageContext: readYoutubePageContext() });
    return;
  }
  if (message.type === MessageType.OFFSCREEN_SETTINGS && message.settings) {
    settings = message.settings;
    if (settings.enabled) {
      dismissedVideoId = null;
      mountPanel();
      panel?.setSettings(settings);
    } else {
      dismissedVideoId = null;
      removePanel();
    }
    return;
  }
  if (message.type === MessageType.OFFSCREEN_FEATURES) {
    panel?.setFeatures(message.features);
    return;
  }
  if ([MessageType.OFFSCREEN_STATE, MessageType.OFFSCREEN_TRANSCRIPT, MessageType.OFFSCREEN_TRANSLATION, MessageType.OFFSCREEN_ERROR].includes(message.type) && message.videoId && message.videoId !== currentVideoId) return;
  if (message.type === MessageType.OFFSCREEN_STATE) panel?.setState(message.state, message.detail, message.progress);
  if (message.type === MessageType.OFFSCREEN_TRANSCRIPT) panel?.setTranscript(message.original, message.isFinal, message.id);
  if (message.type === MessageType.OFFSCREEN_TRANSLATION) {
    panel?.setTranslationResult(message.original, message.translated, message.id);
  }
  if (message.type === MessageType.OFFSCREEN_ERROR) panel?.setError(message.message || "音声認識・翻訳処理に失敗しました。");
}

if (hasValidExtensionContext()) chrome.runtime.onMessage.addListener(handleRuntimeMessage);

observer = new MutationObserver(() => {
  if (!hasValidExtensionContext()) {
    disposeContentScript();
    return;
  }
  if (currentVideoId && !panel?.host?.isConnected) mountPanel();
});
observer.observe(document.documentElement, { childList: true, subtree: true });

navigation = new YoutubeNavigation(handleNavigation);
navigation.start();

return {  };
})();
})();

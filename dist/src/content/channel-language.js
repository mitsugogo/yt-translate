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

export function detectChannelLanguageHint({ channelIdentity = "", videoIdentity = "" } = {}) {
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

export function readYoutubePageContext(doc = document) {
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
import { isKnownHololiveMember } from "../speech/hololive-vocabulary.js";

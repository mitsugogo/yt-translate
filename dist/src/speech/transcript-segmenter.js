import { isUsableSpeechCandidate } from "./transcript-quality.js";

const STABLE_MS = 700;
const SETTLED_MS = 1600;
const SEGMENT_MS = 3500;

function textLength(text) {
  return [...text.replace(/\s/gu, "")].length;
}

// Chrome can insert spaces between Japanese words. Count content, while keeping
// offsets in the original string so revisions and later finals still align.
function contentEnd(text, length) {
  let count = 0;
  let end = 0;
  for (const character of text) {
    if (!/\s/u.test(character) && ++count > length) break;
    end += character.length;
  }
  return end;
}

function normalizeTranscript(text, language) {
  if (!language.startsWith("ja")) return text;
  // Japanese interim/final results alternate between compact and word-spaced
  // forms. Normalize only Japanese boundaries; preserve Latin word separators
  // and separators between numbers ("1 2" must not turn into "12").
  return text
    .replace(/(?<=[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー々])\s+(?=[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー々\p{N}])/gu, "")
    .replace(/(?<=\p{N})\s+(?=[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー々])/gu, "");
}

function commonPrefix(left, right) {
  let index = 0;
  while (index < Math.min(left.length, right.length) && left[index] === right[index]) index += 1;
  return index;
}

// Keep an offset aligned when Chrome inserts/removes text before an already
// emitted prefix. If a revision crosses the boundary, replay the correction
// rather than risk swallowing the beginning of the next phrase.
function revisedOffset(previous, text, offset, prefix) {
  if (prefix >= offset) return offset;
  if (previous.length - offset < 8) return 0;
  let suffix = 0;
  while (suffix < Math.min(previous.length, text.length) - prefix
    && previous[previous.length - suffix - 1] === text[text.length - suffix - 1]) suffix += 1;
  if (suffix >= 8 && previous.length - suffix <= offset) return offset + text.length - previous.length;
  return 0;
}

function longSpeechBoundary(pending, stableLength, japanese, words) {
  const target = japanese ? 180 : 480;
  const minimum = target / 2;
  const limit = Math.min(stableLength, contentEnd(pending, target), contentEnd(pending, textLength(pending) - (japanese ? 8 : 20)));
  const stable = pending.slice(0, limit);
  // Prefer a sentence, then a clause near the length limit. A number's decimal
  // point or separator is not a phrase boundary.
  for (const pattern of [/[。！？.!?][」』”"')）]*/gu, /[、,;；:：]/gu]) {
    let cut = 0;
    for (const match of stable.matchAll(pattern)) {
      const end = match.index + match[0].length;
      if (textLength(stable.slice(0, end)) < minimum) continue;
      if (/[.,:]/u.test(match[0]) && /\d/u.test(pending[match.index - 1] || "") && /\d/u.test(pending[end] || "")) continue;
      if (!japanese && /[\p{L}\p{N}]/u.test(pending[end] || "")) continue;
      cut = end;
    }
    if (cut) return cut;
  }
  let cut = 0;
  for (const word of words.segment(pending)) {
    const end = word.index + word.segment.length;
    if (end > limit) break;
    if (japanese) {
      const prefix = pending.slice(0, end);
      if (textLength(prefix) < minimum || !/(?:です|ます|でした|ました|ません|でしょう|ください|けれども|けど|ので|から|ですが|ますが|だよ|だね)(?:ね|よ)?$/u.test(prefix)) continue;
      // Keep connected endings such as "ですけど" and "ますから" together.
      if (/^(?:けど|けれど|が|ので|から|し|と|か)/u.test(pending.slice(end))) continue;
      cut = end;
    } else if (word.isWordLike && /^(?:and|but|because|while|although|however|dan|tetapi|karena|ketika|namun|sehingga)$/iu.test(word.segment)
      && textLength(pending.slice(0, word.index)) >= minimum) {
      cut = word.index;
    }
  }
  // No arbitrary word-boundary fallback: wait for a suitable clause or native final.
  return cut;
}

export class TranscriptSegmenter {
  constructor({ language, onSegment, onInterim, preferNativeFinal = true, now = () => performance.now() }) {
    this.language = language;
    this.onSegment = onSegment;
    this.onInterim = onInterim;
    this.preferNativeFinal = preferNativeFinal;
    this.now = now;
    this.text = "";
    this.offset = 0;
    this.stableSince = [];
    this.startedAt = null;
    this.changedAt = null;
    this.timer = null;
    this.candidate = null;
    this.words = new Intl.Segmenter(language, { granularity: "word" });
  }

  update(candidate, isFinal = false) {
    this.clearTimer();
    const now = this.now();
    const text = normalizeTranscript(candidate.text, this.language);
    if (text !== this.text) this.changedAt = now;
    if (this.offset === this.text.length && text.length > this.text.length) this.startedAt = now;
    const prefix = commonPrefix(this.text, text);
    this.offset = revisedOffset(this.text, text, this.offset, prefix);
    this.stableSince = this.stableSince.slice(0, prefix).concat(Array(text.length - prefix).fill(now));
    this.text = text;
    this.candidate = candidate;
    if (this.startedAt === null) this.startedAt = now;
    if (isFinal) {
      const remainder = text.slice(this.offset).trim();
      if (remainder && isUsableSpeechCandidate(candidate)) this.onSegment({ ...candidate, text: remainder, isProvisional: false });
      this.offset = text.length;
      return;
    }
    this.drain();
  }

  drain() {
    this.clearTimer();
    if (!this.candidate || !isUsableSpeechCandidate(this.candidate)) return;
    const now = this.now();
    const japanese = this.language.startsWith("ja");
    const target = japanese ? 60 : 160;
    const minimum = japanese ? 12 : 25;
    const shortMinimum = japanese ? 4 : 8;
    const pending = this.text.slice(this.offset);
    const pendingLength = textLength(pending);
    let stableEnd = this.offset;
    while (stableEnd < this.text.length && now - this.stableSince[stableEnd] >= STABLE_MS) stableEnd += 1;
    const stable = this.text.slice(this.offset, stableEnd);
    let cut = 0;
    const longTarget = japanese ? 180 : 480;
    if (this.preferNativeFinal) {
      if (pendingLength >= longTarget) cut = longSpeechBoundary(pending, stable.length, japanese, this.words);
    } else {
    // Prefer a complete sentence, within the normal chunk length.
    for (const match of stable.slice(0, contentEnd(stable, target)).matchAll(/[。！？.!?][」』”"')）]*/gu)) {
      const end = match.index + match[0].length;
      const decimal = match[0].startsWith(".") && /\d/u.test(stable[match.index - 1] || "") && /\d/u.test(pending[end] || "");
      if (!decimal && textLength(stable.slice(0, end)) >= shortMinimum && (japanese || !/[\p{L}\p{N}]/u.test(pending[end] || ""))) cut = end;
    }
    // Unchanged text is a provisional boundary, not proof of acoustic silence.
    // Repeated identical events must not postpone a settled short reply or tail.
    if (!cut && now - this.changedAt >= SETTLED_MS && pendingLength >= shortMinimum && pendingLength <= target) cut = pending.length;
    if (!cut && (pendingLength >= target || now - this.startedAt >= SEGMENT_MS)) {
      // Leave the newest syllables/word under recognition, even if an interim
      // update temporarily looks unchanged. Never split a Latin word in half.
      const limit = Math.min(contentEnd(pending, target), stable.length, contentEnd(pending, Math.max(0, pendingLength - (japanese ? 8 : 20))));
      for (const word of this.words.segment(pending)) {
        const end = word.index + word.segment.length;
        if (end > limit) break;
        if (textLength(pending.slice(0, end)) >= minimum) cut = end;
      }
    }
    }
    if (cut > 0) {
      const text = this.text.slice(this.offset, this.offset + cut).trim();
      this.offset += cut;
      this.startedAt = now;
      if (text) this.onSegment({ ...this.candidate, text, timestamp: now, isProvisional: true });
    }
    const remainder = this.text.slice(this.offset).trim();
    if (remainder) this.onInterim({ ...this.candidate, text: remainder });
    if (this.offset >= this.text.length) return;
    if (this.preferNativeFinal && textLength(remainder) < longTarget) return;
    if (this.preferNativeFinal && cut > 0) {
      this.timer = setTimeout(() => this.drain(), 0);
      return;
    }
    const nextStable = this.stableSince.find((time, index) => index >= this.offset && time + STABLE_MS > now);
    const deadlines = [nextStable === undefined ? Infinity : nextStable + STABLE_MS,
      ...(this.preferNativeFinal ? [] : [this.changedAt + SETTLED_MS, this.startedAt + SEGMENT_MS])].filter(time => time > now);
    const next = Math.min(...deadlines);
    if (Number.isFinite(next)) this.timer = setTimeout(() => this.drain(), next - now);
  }

  clearTimer() {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }

  dispose() {
    this.clearTimer();
    this.candidate = null;
  }
}

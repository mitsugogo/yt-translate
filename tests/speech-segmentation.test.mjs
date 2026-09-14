import test from "node:test";
import assert from "node:assert/strict";
import { TranscriptSegmenter } from "../src/speech/transcript-segmenter.js";
import { SpeechRecognizer } from "../src/speech/speech-recognizer.js";
import { MultilingualSpeechRecognizer, SessionLanguageLearner } from "../src/speech/multilingual-speech-recognizer.js";

const japanese = "今日はこれから新しいゲームを始めようと思っているんですけどその前に昨日のお話の続きを少しだけしておきたいのでみなさんも一緒に聞いてください";

function clock(t) {
  let now = 0;
  let id = 1;
  const timers = new Map();
  t.mock.method(globalThis, "setTimeout", (callback, delay = 0) => {
    const key = id++;
    timers.set(key, { callback, time: now + delay });
    return key;
  });
  t.mock.method(globalThis, "clearTimeout", key => timers.delete(key));
  t.mock.method(performance, "now", () => now);
  return duration => {
    const target = now + duration;
    while (true) {
      const next = [...timers].sort((a, b) => a[1].time - b[1].time)[0];
      if (!next || next[1].time > target) break;
      timers.delete(next[0]);
      now = next[1].time;
      next[1].callback();
    }
    now = target;
  };
}

function segmentHarness(t, language = "ja-JP", preferNativeFinal = false) {
  const tick = clock(t);
  const segments = [];
  const interim = [];
  const segmenter = new TranscriptSegmenter({ language, preferNativeFinal, onSegment: c => segments.push(c), onInterim: c => interim.push(c) });
  t.after(() => segmenter.dispose());
  return {
    tick,
    segments,
    interim,
    discardPending: () => segmenter.discardPending(),
    update: (text, final = false) => segmenter.update({ text, sourceLanguage: language, confidence: 0.9 }, final)
  };
}

test("stable Japanese retains every character through the native final", t => {
  const { tick, segments, interim, update } = segmentHarness(t);
  update(japanese);
  tick(699);
  assert.equal(segments.length, 0);
  tick(1);
  assert.equal(segments.length, 1);
  assert.equal(segments[0].isProvisional, true);
  const tail = japanese.slice(segments[0].text.length);
  assert.equal(interim.at(-1).text, tail);
  update(`${japanese}では始めましょう`, true);
  assert.equal(segments[1].text, `${tail}では始めましょう`);
  assert.equal(segments[1].isProvisional, false);
  assert.equal(segments.map(c => c.text).join(""), `${japanese}では始めましょう`);
  tick(20000);
  assert.equal(segments.length, 2);
});

test("continuous interim updates do not postpone a stable prefix forever", t => {
  const { tick, segments, update } = segmentHarness(t);
  update(japanese);
  for (let n = 1; n <= 8; n += 1) {
    tick(100);
    update(japanese + "続きの話です".slice(0, n));
  }
  assert.ok(segments.length > 0);
  assert.ok(japanese.startsWith(segments[0].text));
});

test("continuous speech uses the time budget and retains unfinished syllables", t => {
  const { tick, segments, update } = segmentHarness(t);
  let text = "今日はゆっくり話していますがまだお話の途中です";
  update(text);
  for (const continuation of ["ので", "この", "まま"]) {
    tick(1000);
    text += continuation;
    update(text);
  }
  tick(499);
  assert.equal(segments.length, 0);
  tick(1);
  assert.equal(segments.length, 1);
  assert.ok(segments[0].text.length < text.length);
  update(text + "のでこのまま続けます", true);
  assert.equal(segments.map(c => c.text).join(""), text + "のでこのまま続けます");
});

test("stable sentences are emitted early without duplicating a later native final", t => {
  const { tick, segments, update } = segmentHarness(t);
  update("そうですね。");
  tick(699);
  assert.equal(segments.length, 0);
  tick(1);
  assert.equal(segments[0].text, "そうですね。");
  const text = "それではここから新しいお話を始めていきます。";
  update(text);
  tick(700);
  assert.equal(segments[1].text, text);
  update(text, true);
  assert.equal(segments.length, 2);
});

test("a settled short live reply is emitted once despite identical interim events", t => {
  const { tick, segments, update } = segmentHarness(t);
  const text = "あこれはやばい";
  update(text);
  tick(1000);
  update(text);
  tick(599);
  assert.equal(segments.length, 0);
  tick(1);
  assert.equal(segments[0].text, text);
  assert.equal(segments[0].isProvisional, true);
  update(text, true);
  tick(10000);
  assert.equal(segments.length, 1);
});

test("an unchanged tail is not stranded waiting for Chrome's final", t => {
  const { tick, segments, update } = segmentHarness(t);
  update(japanese);
  tick(700);
  assert.equal(segments.length, 1);
  tick(900);
  assert.equal(segments.length, 2);
  assert.equal(segments.map(c => c.text).join(""), japanese);
  update(japanese, true);
  assert.equal(segments.length, 2);
});

test("Japanese recognition spaces do not trigger a premature length cut", t => {
  const { tick, segments, update } = segmentHarness(t);
  const text = "さ で も まだ 37 枚 ある ここ から 奇跡 の 火山 連続 も 全然 ある ぞ 狩 いらっしゃい どう なる かな";
  assert.ok(text.length >= 60);
  update(text);
  tick(700);
  assert.equal(segments.length, 0);
  tick(900);
  assert.equal(segments[0].text, text.replaceAll(" ", ""));
});

test("Japanese spacing changes do not replay emitted speech or reset the settled wait", t => {
  const { tick, segments, update } = segmentHarness(t);
  const text = "はいそしてカーリーは本当にありがとうございました";
  const spaced = "はい そして カーリー は 本当 に ありがとう ござい まし た";
  update(text);
  tick(1000);
  update(spaced);
  tick(600);
  assert.equal(segments.length, 1);
  assert.equal(segments[0].text, text);
  update(text);
  update(spaced, true);
  tick(10000);
  assert.equal(segments.length, 1);
});

test("spacing revisions preserve the remainder after a continuous speech chunk", t => {
  const { tick, segments, update } = segmentHarness(t);
  update(japanese);
  tick(700);
  assert.equal(segments.length, 1);
  update([...japanese].join(" "));
  tick(900);
  update(japanese, true);
  assert.equal(segments.length, 2);
  assert.equal(segments.map(c => c.text).join(""), japanese);
});

test("Japanese normalization preserves Latin words and separate numbers", t => {
  const { segments, update } = segmentHarness(t);
  update("今回 は new game の 配信 で 順位 は 1 2 です", true);
  assert.equal(segments[0].text, "今回は new game の配信で順位は1 2です");
});

test("revisions restart the settled wait and short noise keeps waiting", t => {
  const { tick, segments, update } = segmentHarness(t);
  update("あこれはやばい");
  tick(1500);
  update("あこれはすごい");
  tick(1599);
  assert.equal(segments.length, 0);
  tick(1);
  assert.equal(segments[0].text, "あこれはすごい");
  update("あ");
  tick(10000);
  assert.equal(segments.length, 1);
});

test("speech after a fully emitted prefix receives a fresh time budget", t => {
  const { tick, segments, update } = segmentHarness(t);
  const first = "それでは始めましょう。";
  update(first);
  tick(10000);
  assert.equal(segments.length, 1);
  update(first + "まだ新しい文章の途中ですから");
  tick(700);
  assert.equal(segments.length, 1);
  tick(900);
  assert.equal(segments[1].text, "まだ新しい文章の途中ですから");
});

test("decimal points are not sentence boundaries in Japanese speech", t => {
  const { tick, segments, update } = segmentHarness(t);
  update("現在の倍率は12.5倍です");
  tick(700);
  assert.equal(segments.length, 0);
  tick(900);
  assert.equal(segments[0].text, "現在の倍率は12.5倍です");
});

test("corrected interim text must become stable before early emission", t => {
  const { tick, segments, update } = segmentHarness(t);
  update(japanese);
  tick(600);
  update(japanese.replace("今日は", "明日は"));
  tick(600);
  assert.equal(segments.length, 0);
  tick(100);
  assert.ok(segments[0].text.startsWith("明日は"));
});

test("insertions and deletions before a sent boundary preserve the next phrase", t => {
  const { tick, segments, update } = segmentHarness(t);
  update(japanese);
  tick(700);
  const tail = japanese.slice(segments[0].text.length);
  update(japanese.replace("今日は", "今日の配信では"));
  update(japanese.replace("今日は", "今日の配信では").replace("これから", ""), true);
  assert.equal(segments.at(-1).text, tail);
});

test("ambiguous rewrites replay corrections instead of dropping new leading characters", t => {
  const { tick, segments, update } = segmentHarness(t);
  update("それではここから新しいお話を始めていきます。");
  tick(700);
  const corrected = "それではここから別のお話を始めます。最初に大事なお知らせです。";
  update(corrected, true);
  assert.equal(segments.at(-1).text, corrected);
});

test("Latin chunks retain whole words and the complete continuation", t => {
  const { tick, segments, update } = segmentHarness(t, "en-US");
  const text = "We are going to talk about the new game and explain how everyone can join us while we explore the different areas of the map and learn about all of the characters together with our friends who are watching the stream";
  update(text);
  tick(700);
  assert.equal(segments.length, 1);
  assert.equal(text[segments[0].text.length], " ");
  update(text + " today", true);
  assert.equal(segments.map(c => c.text).join(" "), text + " today");
});

test("native-final mode keeps the complete English interim until Chrome finalizes it", t => {
  const { tick, segments, interim, update } = segmentHarness(t, "en-US", true);
  const first = "We are going to explain the plan for today before we start the game";
  const revised = `${first}, and then everyone can join us`;
  update(first);
  tick(10000);
  assert.equal(segments.length, 0);
  assert.equal(interim.at(-1).text, first);
  update(revised);
  assert.equal(segments.length, 0);
  assert.equal(interim.at(-1).text, revised);
  update(revised, true);
  assert.equal(segments.length, 1);
  assert.equal(segments[0].text, revised);
  assert.equal(segments[0].isProvisional, false);
});

test("native-final mode translates a natural Japanese clause before a long transcript finishes", t => {
  const { tick, segments, interim, update } = segmentHarness(t, "ja-JP", true);
  const clause = "今日は新しいゲームの進め方と最初に集めておきたい素材について順番に説明しておきたいと思いますので";
  const tail = "このあと実際の画面を見ながら一緒に確認していきましょうそのあとの予定についても詳しくお知らせしていきます";
  const text = clause + tail;
  assert.ok(text.length >= 60);
  assert.ok(text.length < 180);
  update(text);
  tick(699);
  assert.equal(segments.length, 0);
  tick(1);
  assert.equal(segments.length, 1);
  assert.equal(segments[0].text, `${clause}。`);
  assert.equal(segments[0].isProvisional, true);
  assert.equal(interim.at(-1).text, tail);
  update(text, true);
  assert.equal(segments.at(-1).text, tail);
  assert.equal(segments.at(-1).isProvisional, false);
});

test("native-final mode preserves recognized punctuation on an early segment", t => {
  const { tick, segments, update } = segmentHarness(t, "ja-JP", true);
  const sentence = "今日は新しいゲームの進め方と最初に集めておきたい素材について順番に説明します。";
  update(sentence.repeat(2) + "このあと実際の画面を見ながら詳しく確認してからそのあとの予定についても順番にお知らせしていきましょうね");
  tick(700);
  assert.equal(segments[0].text, sentence.repeat(2));
});

test("discarding an inactive language keeps its old interim out of a later turn", t => {
  const { segments, interim, discardPending, update } = segmentHarness(t, "ja-JP", true);
  const previous = "そのまま引き続き綺麗にしろよという話をしていて";
  const current = "今度は新しい日本語の話に戻ってきました";
  update(previous);
  discardPending();
  update(previous + current);
  assert.equal(interim.at(-1).text, current);
  update(previous + current, true);
  assert.deepEqual(segments.map(segment => segment.text), [current]);
});

test("native-final mode translates long unpunctuated English at a spoken clause boundary", t => {
  const { tick, segments, interim, update } = segmentHarness(t, "en-US", true);
  const clause = "I see I see I'm worried about the trip you'll have a lot of fun";
  const tail = "and you know right now it's such a convenient world now that there are a lot of translating apps Google Maps helps a lot with telling you what train goes where";
  const text = `${clause} ${tail}`;
  assert.ok(text.length >= 120);
  update(text);
  tick(700);
  assert.equal(segments[0].text, `${clause}.`);
  assert.equal(interim.at(-1).text, tail);
});

test("native-final mode has a stable word-boundary fallback for speech without clause markers", t => {
  const { tick, segments, interim, update } = segmentHarness(t, "en-US", true);
  const text = Array.from({ length: 40 }, (_, index) => `topic${index}`).join(" ");
  assert.ok(text.replaceAll(" ", "").length >= 180);
  update(text);
  tick(700);
  assert.equal(segments.length, 1);
  assert.ok(segments[0].text.endsWith("."));
  assert.equal(`${segments[0].text.slice(0, -1)} ${interim.at(-1).text}`, text);
});

test("native-final mode only splits an overlong English interim at a sentence boundary", t => {
  const { tick, segments, interim, update } = segmentHarness(t, "en-US", true);
  const sentence = "We are explaining one complete part of the story before continuing. ";
  const text = sentence.repeat(9) + "This ending is still being recognized";
  assert.ok(text.replaceAll(" ", "").length > 480);
  update(text);
  tick(699);
  assert.equal(segments.length, 0);
  tick(1);
  assert.ok(segments.length > 1);
  assert.ok(segments.every(segment => segment.isProvisional && segment.text.endsWith(".")));
  assert.equal(`${segments.map(segment => segment.text).join(" ")} ${interim.at(-1).text}`, text.trim());
});

test("repetition filtering runs before breaking a loop into smaller chunks", t => {
  const { tick, segments, update } = segmentHarness(t);
  update("あえんびえん".repeat(20));
  tick(10000);
  assert.equal(segments.length, 0);
});

function speechApi(t) {
  const tick = clock(t);
  const started = [];
  const previous = globalThis.SpeechRecognition;
  globalThis.SpeechRecognition = class {
    processLocally = true;
    static async available() { return "available"; }
    start() { started.push(this); this.onstart?.(); }
    stop() { assert.fail("Text segmentation must never stop Chrome recognition"); }
    abort() { this.onend?.(); }
    result(text, final = false) {
      this.onresult({ resultIndex: 0, results: [Object.assign([{ transcript: text, confidence: 0.9 }], { isFinal: final })] });
    }
  };
  t.after(() => { globalThis.SpeechRecognition = previous; });
  return { tick, started, stream: { getAudioTracks: () => [{ readyState: "live" }], getTracks: () => [] } };
}

test("recognition stays open at text boundaries; settings and stop clear stale timers", async t => {
  const { tick, started, stream } = speechApi(t);
  const segments = [];
  const recognizer = new SpeechRecognizer({ manageAudioOutput: false, stopStream: false, onFinal: c => segments.push(c) });
  t.after(() => recognizer.stop());
  await recognizer.start(stream, { sourceLanguage: "ja-JP", preferNativeFinal: false });
  started[0].result(japanese);
  tick(700);
  assert.equal(segments.length, 1);
  assert.equal(started.length, 1);
  started[0].result(japanese + "次のお話です", true);
  assert.equal(segments.map(c => c.text).join(""), japanese + "次のお話です");
  await recognizer.updateSettings({ sourceLanguage: "en-US" });
  const count = segments.length;
  started[1].result("We are now speaking about something else");
  await recognizer.stop();
  tick(20000);
  assert.equal(segments.length, count);
  assert.equal(started.length, 2);
});

test("removed interim entries dispose pending segmentation timers", async t => {
  const { tick, started, stream } = speechApi(t);
  const segments = [];
  const recognizer = new SpeechRecognizer({ manageAudioOutput: false, stopStream: false, onFinal: c => segments.push(c) });
  t.after(() => recognizer.stop());
  await recognizer.start(stream, { sourceLanguage: "ja-JP" });
  started[0].result(japanese);
  started[0].onresult({ resultIndex: 0, results: [] });
  tick(10000);
  assert.equal(segments.length, 0);
});

test("candidate selection preserves consecutive chunks and never learns provisional speech", async () => {
  const segments = [];
  const recognizer = new MultilingualSpeechRecognizer({ onFinal: c => segments.push(c) });
  recognizer.finalCandidates.push(
    { text: "最初の区間です", sourceLanguage: "ja-JP", confidence: 0.9, isProvisional: true },
    { text: "次の区間の先頭です", sourceLanguage: "ja-JP", confidence: 0.9 }
  );
  await recognizer.flushFinalCandidates();
  assert.deepEqual(segments.map(segment => segment.text), ["最初の区間です", "次の区間の先頭です"]);
  assert.equal(recognizer.sessionLanguageLearner.observations, 0);
  assert.equal(new SessionLanguageLearner().observe(segments[0]), false);
  await recognizer.stop();
});

test("repeated language switches discard each previous language's pending transcript", async () => {
  const discarded = [];
  const recognizer = new MultilingualSpeechRecognizer();
  recognizer.recognizers = ["en-US", "ja-JP", "id-ID"].map(sourceLanguage => ({
    settings: { sourceLanguage },
    discardPendingTranscript: () => discarded.push(sourceLanguage),
    stop: async () => {}
  }));
  recognizer.adoptDisplayedCandidate({ sourceLanguage: "en-US" }, 1);
  recognizer.adoptDisplayedCandidate({ sourceLanguage: "ja-JP" }, 2);
  recognizer.adoptDisplayedCandidate({ sourceLanguage: "en-US" }, 3);
  recognizer.adoptDisplayedCandidate({ sourceLanguage: "ja-JP" }, 4);
  assert.deepEqual(discarded, ["en-US", "ja-JP", "en-US"]);
  await recognizer.stop();
});

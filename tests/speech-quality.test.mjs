import test from "node:test";
import assert from "node:assert/strict";
import { hasExcessiveRepetition } from "../src/speech/transcript-quality.js";
import { MultilingualSpeechRecognizer, selectSpeechCandidate, SessionLanguageLearner } from "../src/speech/multilingual-speech-recognizer.js";
import { SpeechRecognizer } from "../src/speech/speech-recognizer.js";

test("rejects long word and phrase loops with varying separators", () => {
  for (const text of [
    "ホロライブ".repeat(20), "あえんびえん、".repeat(8),
    "Thank you! thank you, THANK YOU. thank you thank you thank you",
    "terima kasih ".repeat(10), "あ".repeat(30),
    `それでは始めます。${"さくらみこ".repeat(15)}今日はゲームをします。`
  ]) assert.equal(hasExcessiveRepetition(text), true, text);
});

test("preserves short emphasis, ordinary speech and naturally recurring words", () => {
  for (const text of [
    "no no no!", "そうそう、そうそう", "あー", "ありがとう！", "hello hello",
    "みこちは今日はゲーム、みこちは明日歌います。",
    "I think that that was very very funny.", "12345678901234567890"
  ]) assert.equal(hasExcessiveRepetition(text), false, text);
});

test("a high-confidence dictionary loop cannot beat a valid alternative or train the learner", async () => {
  const loop = { text: "あえんびえん".repeat(12), sourceLanguage: "ja-JP", confidence: 1 };
  const good = { text: "let us start the game", sourceLanguage: "en-US", confidence: 0.7 };
  const detector = { async detect(text) {
    assert.equal(text, good.text);
    return [{ detectedLanguage: "en", confidence: 0.9 }];
  } };
  assert.equal(await selectSpeechCandidate([loop, good], detector, ["ja"]), good);
  assert.equal(await selectSpeechCandidate([loop]), null);
  assert.equal(await selectSpeechCandidate([{ text: "…！？", sourceLanguage: "ja-JP" }]), null);
  const learner = new SessionLanguageLearner();
  assert.equal(learner.observe(loop), false);
  assert.equal(learner.observations, 0);
});

test("text-language agreement cannot rescue a weak dictionary transcription", async () => {
  const wrong = { text: "あえんびえん", sourceLanguage: "ja-JP", confidence: 0.2 };
  const correct = { text: "we can begin now", sourceLanguage: "en-US", confidence: 0.85 };
  const detector = { async detect(text) {
    return [{ detectedLanguage: text === wrong.text ? "ja" : "en", confidence: 0.99 }];
  } };
  assert.equal(await selectSpeechCandidate([wrong, correct], detector, ["ja"]), correct);
  assert.equal((await selectSpeechCandidate([
    { text: "あー", sourceLanguage: "ja-JP", confidence: 0.2 },
    { text: "are", sourceLanguage: "en-US", confidence: 0.9 }
  ], null, ["ja"])).sourceLanguage, "en-US");
});

test("missing or low recognition confidence never reinforces session language", () => {
  const learner = new SessionLanguageLearner();
  for (const confidence of [undefined, 0, 0.2, 0.64, NaN]) {
    assert.equal(learner.observe({ text: "あえんびえん", sourceLanguage: "ja-JP", confidence }), false);
  }
  assert.equal(learner.observations, 0);
  assert.equal(learner.observe({ text: "今日はゲームをします", sourceLanguage: "ja-JP", confidence: 0.8 }), true);
});

test("filters interim and final loops before display or translation", async () => {
  const interim = [];
  const final = [];
  const recognizer = new MultilingualSpeechRecognizer({ onInterim: c => interim.push(c), onFinal: c => final.push(c) });
  const normal = { text: "みこち", sourceLanguage: "ja-JP", confidence: 0.7 };
  const loop = { ...normal, text: "みこち".repeat(20) };
  recognizer.handleInterim(normal);
  recognizer.handleInterim(loop);
  recognizer.handleFinal(loop);
  await recognizer.flushFinalCandidates();
  assert.deepEqual(interim, [normal]);
  assert.equal(recognizer.interimCandidates.size, 0);
  assert.deepEqual(final, []);
  assert.equal(recognizer.sessionLanguageLearner.observations, 0);
  await recognizer.stop();
});

function interimHarness(t) {
  let now = 0;
  t.mock.method(performance, "now", () => now);
  const interim = [];
  const final = [];
  const recognizer = new MultilingualSpeechRecognizer({ onInterim: c => interim.push(c), onFinal: c => final.push(c) });
  recognizer.settings = { sourceLanguage: "auto", preferredLanguages: ["ja"] };
  t.after(() => recognizer.stop());
  return { recognizer, interim, final, tick: ms => { now += ms; } };
}

test("a short competing language cannot flash over active Japanese or emit a provisional translation", t => {
  const { recognizer, interim, tick } = interimHarness(t);
  const japanese = { text: "サンキューまた会いましょう", sourceLanguage: "ja-JP", confidence: 0.7 };
  const echo = { text: "I'm a show", sourceLanguage: "en-US", confidence: 1 };
  recognizer.handleInterim(japanese);
  tick(200);
  recognizer.handleInterim(echo);
  tick(700);
  recognizer.handleInterim(echo);
  recognizer.handleFinal({ ...echo, isProvisional: true });
  assert.deepEqual(interim, [japanese]);
  assert.equal(recognizer.finalCandidates.length, 0);
});

test("sustained stronger speech can switch the displayed interim language", t => {
  const { recognizer, interim, tick } = interimHarness(t);
  const japanese = { text: "こちらでお待ちください", sourceLanguage: "ja-JP", confidence: 0.2 };
  const english = { text: "Now let us speak English together", sourceLanguage: "en-US", confidence: 0.95 };
  recognizer.handleInterim(japanese);
  tick(100);
  recognizer.handleInterim(english);
  tick(599);
  recognizer.handleInterim(english);
  assert.deepEqual(interim, [japanese]);
  tick(1);
  recognizer.handleInterim(english);
  assert.deepEqual(interim, [japanese, english]);
});

test("one language's updates cannot keep an old competing hypothesis alive", t => {
  const { recognizer, interim, tick } = interimHarness(t);
  const english = { text: "an older English hypothesis", sourceLanguage: "en-US", confidence: 1 };
  const japanese = { text: "今はこちらの話をしています", sourceLanguage: "ja-JP", confidence: 0.5 };
  recognizer.handleInterim(english);
  tick(800);
  recognizer.handleInterim(japanese);
  assert.deepEqual(interim, [english]);
  tick(800);
  recognizer.handleInterim(japanese);
  tick(600);
  recognizer.handleInterim(japanese);
  assert.deepEqual(interim, [english, japanese]);
  assert.equal(recognizer.interimCandidates.has("en"), false);
});

test("a pause does not let a short alternate language bypass the display guard", t => {
  const { recognizer, interim, tick } = interimHarness(t);
  const japanese = { text: "すごい強いななんか120より", sourceLanguage: "ja-JP", confidence: 0.9 };
  recognizer.handleInterim(japanese);
  tick(7000);
  recognizer.handleInterim({ text: "Buka", sourceLanguage: "id-ID", confidence: 1 });
  const alternative = { text: "Buka-buka sejak kita", sourceLanguage: "id-ID", confidence: 1 };
  tick(1000);
  recognizer.handleInterim(alternative);
  assert.deepEqual(interim, [japanese]);
  recognizer.handleFinal({ ...alternative, isProvisional: true });
  assert.equal(recognizer.finalCandidates.length, 0);
  const next = { ...japanese, text: "ポカポカしてきたなんでなんで" };
  tick(400);
  recognizer.handleInterim(next);
  assert.deepEqual(interim, [japanese, next]);
});

test("a real language change after a pause is not held by an old confidence score", t => {
  const { recognizer, interim, tick } = interimHarness(t);
  const japanese = { text: "それでは始めましょう", sourceLanguage: "ja-JP", confidence: 1 };
  recognizer.handleInterim(japanese);
  tick(7000);
  const english = { text: "We are now speaking English", sourceLanguage: "en-US", confidence: 0.6 };
  recognizer.handleInterim(english);
  tick(600);
  recognizer.handleInterim(english);
  assert.deepEqual(interim, [japanese, english]);
});

test("native final language selection can switch after stale display evidence and stopping resets it", async t => {
  const { recognizer, final, tick } = interimHarness(t);
  recognizer.handleInterim({ text: "日本語でお話をしています", sourceLanguage: "ja-JP", confidence: 1 });
  tick(1600);
  const english = { text: "Thank you", sourceLanguage: "en-US", confidence: 0.95 };
  recognizer.finalCandidates.push(english);
  await recognizer.flushFinalCandidates();
  assert.deepEqual(final, [english]);
  assert.equal(recognizer.displayedCandidate, english);
  await recognizer.stop();
  assert.equal(recognizer.displayedCandidate, null);
  assert.equal(recognizer.interimReceivedAt.size, 0);
  assert.equal(recognizer.pendingInterimSwitch, null);
});

test("a late competing native final cannot replace a recently selected language", async t => {
  const { recognizer, final, tick } = interimHarness(t);
  const english = { text: "Thank you for watching", sourceLanguage: "en-US", confidence: 0.9 };
  recognizer.finalCandidates.push(english);
  await recognizer.flushFinalCandidates();
  tick(900);
  recognizer.finalCandidates.push({ text: "見てくれてありがとう", sourceLanguage: "ja-JP", confidence: 1 });
  await recognizer.flushFinalCandidates();
  assert.deepEqual(final, [english]);
  assert.equal(recognizer.displayedCandidate, english);
  assert.equal(recognizer.sessionLanguageLearner.observations, 1);
});

test("a sustained interim language change still allows its native final", async t => {
  const { recognizer, interim, final, tick } = interimHarness(t);
  const english = { text: "We are speaking English now", sourceLanguage: "en-US", confidence: 0.9 };
  recognizer.finalCandidates.push(english);
  await recognizer.flushFinalCandidates();
  const japanese = { text: "ここから日本語で話します", sourceLanguage: "ja-JP", confidence: 1 };
  tick(100);
  recognizer.handleInterim(japanese);
  tick(600);
  recognizer.handleInterim(japanese);
  assert.deepEqual(interim, [japanese]);
  recognizer.finalCandidates.push(japanese);
  await recognizer.flushFinalCandidates();
  assert.deepEqual(final, [english, japanese]);
});

test("discard a pending candidate selection when recognition is stopped", async () => {
  let resolveDetection;
  const final = [];
  const recognizer = new MultilingualSpeechRecognizer({
    onFinal: c => final.push(c),
    detector: { detect: () => new Promise(resolve => { resolveDetection = resolve; }) }
  });
  recognizer.finalCandidates.push({ text: "hello everyone", sourceLanguage: "en-US", confidence: 0.9 });
  const flushing = recognizer.flushFinalCandidates();
  await recognizer.stop();
  resolveDetection([{ detectedLanguage: "en", confidence: 0.9 }]);
  await flushing;
  assert.deepEqual(final, []);
  assert.equal(recognizer.sessionLanguageLearner.observations, 0);
});

function mockSpeechApi(t) {
  const previousRecognition = globalThis.SpeechRecognition;
  const previousPhrase = globalThis.SpeechRecognitionPhrase;
  const started = [];
  globalThis.SpeechRecognition = class {
    processLocally = true;
    phrases = [];
    static async available() { return "available"; }
    start() { started.push(this); this.onstart?.(); }
    abort() { this.aborted = true; this.onend?.(); }
  };
  globalThis.SpeechRecognitionPhrase = class {
    constructor(phrase, boost) { this.phrase = phrase; this.boost = boost; }
  };
  t.after(() => {
    globalThis.SpeechRecognition = previousRecognition;
    globalThis.SpeechRecognitionPhrase = previousPhrase;
  });
  return { started, stream: { getAudioTracks: () => [{ readyState: "live" }], getTracks: () => [] } };
}

test("auto recognition disables all dictionary hints; fixed language uses gentle Hololive hints only", async (t) => {
  const { started, stream } = mockSpeechApi(t);
  const recognizer = new MultilingualSpeechRecognizer();
  t.after(() => recognizer.stop());
  await recognizer.start(stream, { sourceLanguage: "auto", useHololiveVocabulary: true });
  assert.equal(started.length, 3);
  assert.ok(started.every(r => r.phrases.length === 0));
  assert.ok(recognizer.recognizers.every(r => r.settings.preferNativeFinal === true));
  await recognizer.updateSettings({ sourceLanguage: "ja-JP", useHololiveVocabulary: true });
  assert.ok(started.at(-1).phrases.length > 0);
  assert.equal(recognizer.recognizers.length, 1);
  assert.equal(started.filter(r => !r.aborted).length, 1);
  assert.ok(started.at(-1).phrases.every(p => p.boost <= 1));
  await recognizer.updateSettings({ sourceLanguage: "auto", useHololiveVocabulary: true });
  assert.ok(started.slice(-3).every(r => r.phrases.length === 0));
  assert.equal(started.filter(r => !r.aborted).length, 3);
  await recognizer.updateSettings({ sourceLanguage: "ja-JP", useHololiveVocabulary: false });
  assert.equal(started.at(-1).phrases.length, 0);
});

for (const sourceLanguage of ["ja-JP", "en-US", "id-ID"]) {
  test(`fixed ${sourceLanguage} uses one recognizer and forwards results without auto selection`, async t => {
    const { started, stream } = mockSpeechApi(t);
    const interim = [];
    const final = [];
    const recognizer = new MultilingualSpeechRecognizer({
      onInterim: c => interim.push(c),
      onFinal: c => final.push(c),
      detector: { detect() { assert.fail("Fixed speech must not run language detection for candidate selection"); } }
    });
    t.after(() => recognizer.stop());
    await recognizer.start(stream, { sourceLanguage });
    assert.equal(started.length, 1);
    assert.equal(started[0].lang, sourceLanguage);
    const child = recognizer.recognizers[0];
    const partial = { text: "hello everyone", sourceLanguage, confidence: 0.9 };
    const early = { ...partial, text: "first segment", isProvisional: true };
    const native = { ...partial, text: "second segment", isProvisional: false };
    child.onInterim(partial);
    child.onFinal(early);
    child.onFinal(native);
    assert.deepEqual(interim, [partial]);
    assert.deepEqual(final, [early, native]);
    assert.equal(recognizer.finalTimer, null);
    assert.equal(recognizer.interimTimer, null);
    assert.equal(recognizer.finalCandidates.length, 0);
    assert.equal(recognizer.interimCandidates.size, 0);
    assert.equal(recognizer.sessionLanguageLearner.observations, 0);
    const loop = { ...partial, text: "test ".repeat(20) };
    child.onInterim(loop);
    child.onFinal(loop);
    assert.equal(interim.length, 1);
    assert.equal(final.length, 2);
  });
}

test("emits a final result index once while preserving genuine repeated utterances", async (t) => {
  const { started, stream } = mockSpeechApi(t);
  const final = [];
  const recognizer = new SpeechRecognizer({ manageAudioOutput: false, stopStream: false, onFinal: c => final.push(c) });
  t.after(() => recognizer.stop());
  await recognizer.start(stream, { sourceLanguage: "en-US" });
  const recognition = started[0];
  const result = Object.assign([{ transcript: "hello", confidence: 0.9 }], { isFinal: true });
  recognition.onresult({ resultIndex: 0, results: [result] });
  recognition.onresult({ resultIndex: 0, results: [result] });
  recognition.onresult({ resultIndex: 0, results: [result, result] });
  assert.deepEqual(final.map(c => c.text), ["hello", "hello"]);
  await recognizer.stop();
  recognition.onresult({ resultIndex: 2, results: [result, result, result] });
  assert.equal(final.length, 2);
  await recognizer.start(stream, { sourceLanguage: "en-US" });
  started.at(-1).onresult({ resultIndex: 0, results: [result] });
  assert.equal(final.length, 3);
});

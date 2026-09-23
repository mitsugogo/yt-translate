import test from "node:test";
import assert from "node:assert/strict";
import { MultilingualSpeechRecognizer, selectSpeechCandidate, SessionLanguageLearner } from "../src/speech/multilingual-speech-recognizer.js";
import { MixedLanguageTranslator, splitLanguageRuns } from "../src/translation/mixed-language-translator.js";
import { LocalTranslator } from "../src/translation/translator.js";
import { getExactHololiveTranslation, getHololiveSpeechPhrases } from "../src/speech/hololive-vocabulary.js";

test("splits Japanese and Latin language runs without losing separators", () => {
  assert.deepEqual(splitLanguageRuns("今日は streaming dan musik!"), [
    { kind: "ja", text: "今日は " },
    { kind: "latin", text: "streaming dan musik!" }
  ]);
});

test("translates each mixed-language run into the selected target", async () => {
  const calls = [];
  const translator = {
    async translate(text, source, target) {
      calls.push({ text, source, target });
      return `[${target}:${text}]`;
    },
    reset() {}
  };
  const detector = {
    async detect(text) {
      return [{ detectedLanguage: /\bdan\b/u.test(text) ? "id" : "en", confidence: 0.95 }];
    },
    reset() {}
  };
  const mixed = new MixedLanguageTranslator({ translator, detector });
  const translated = await mixed.translate("今日は streaming dan musik!", "ja-JP", "ja");
  assert.equal(translated, "今日は [ja:streaming dan musik!]");
  assert.deepEqual(calls, [{ text: "streaming dan musik!", source: "id", target: "ja" }]);
});

test("provides Hololive names and glossary phrases to local recognition", () => {
  const japanese = getHololiveSpeechPhrases("ja-JP");
  const english = getHololiveSpeechPhrases("en-US");
  const indonesian = getHololiveSpeechPhrases("id-ID");
  const requestedCallNames = [
    "ぺこら", "あずきち", "マリン", "カエラ神", "みこち", "ころさん", "ころね",
    "ミオしゃ", "フブさん", "フブキ", "ラミィ", "ねね", "ねねち", "ぼたん",
    "こより", "こよちゃん", "ラプラス", "ルイルイ", "ルイ"
  ];
  assert.ok(japanese.some(({ phrase }) => phrase === "あえんびえん"));
  assert.ok(japanese.some(({ phrase }) => phrase === "ギョリノフ"));
  assert.ok(japanese.some(({ phrase }) => phrase === "ホロドリ"));
  assert.ok(english.some(({ phrase }) => phrase === "Holodori"));
  assert.ok(japanese.some(({ phrase }) => phrase === "そら先輩"));
  for (const callName of requestedCallNames) {
    assert.ok(japanese.some(({ phrase }) => phrase === callName), `${callName} should be a Japanese speech hint`);
  }
  assert.ok([...japanese, ...english].every(({ boost }) => boost > 0 && boost <= 10));
  assert.equal(japanese.find(({ phrase }) => phrase === "さくらみこ")?.boost, 4);
  assert.equal(japanese.find(({ phrase }) => phrase === "みこち")?.boost, 3);
  assert.equal(japanese.find(({ phrase }) => phrase === "ギョリノフ")?.boost, 5);
  for (const phrases of [english, indonesian]) {
    assert.equal(phrases.find(({ phrase }) => phrase === "Sakura Miko")?.boost, 2);
    assert.equal(phrases.find(({ phrase }) => phrase === "Biboo")?.boost, 1);
    assert.equal(phrases.find(({ phrase }) => phrase === "YAGOO")?.boost, 3);
  }
  assert.equal(new Set(japanese.map(({ phrase }) => phrase.toLocaleLowerCase("en-US"))).size, japanese.length);
});

test("uses exact Hololive glossary translations without calling the generic model", async () => {
  assert.equal(getExactHololiveTranslation("あえんびえん！", "en"), "aenbien (pandemonium)");
  assert.equal(getExactHololiveTranslation("みこち", "en"), "Sakura Miko");
  assert.equal(getExactHololiveTranslation("宝鐘マリン", "en"), "Houshou Marine");
  assert.equal(getExactHololiveTranslation("ぺこら", "en"), "Usada Pekora");
  assert.equal(getExactHololiveTranslation("カエラ神", "en"), "Kaela Kovalskia");
  assert.equal(getExactHololiveTranslation("ルイ", "en"), "Takane Lui");
  const mixed = new MixedLanguageTranslator({
    translator: { async translate() { assert.fail("Exact glossary entry must bypass the generic translator"); }, reset() {} },
    detector: { reset() {} }
  });
  assert.equal(await mixed.translate("あえんびえん！", "ja-JP", "en", { useHololiveVocabulary: true }), "aenbien (pandemonium)");
});

test("candidate selection uses recognition confidence and language detection", async () => {
  const detector = {
    async detect(text) {
      if (text === "terima kasih semuanya") return [{ detectedLanguage: "id", confidence: 0.98 }];
      return [{ detectedLanguage: "en", confidence: 0.9 }];
    }
  };
  const selected = await selectSpeechCandidate([
    { text: "the remake acid semester", sourceLanguage: "en-US", confidence: 0.52 },
    { text: "terima kasih semuanya", sourceLanguage: "id-ID", confidence: 0.62 }
  ], detector);
  assert.equal(selected.sourceLanguage, "id-ID");
  assert.equal(selected.text, "terima kasih semuanya");
});

test("preferred language resolves a close short-utterance decision", async () => {
  const candidates = [
    { text: "あー", sourceLanguage: "ja-JP", confidence: 0.7 },
    { text: "are", sourceLanguage: "en-US", confidence: 0.9 }
  ];
  assert.equal((await selectSpeechCandidate(candidates)).sourceLanguage, "en-US");
  assert.equal((await selectSpeechCandidate(candidates, null, "ja")).sourceLanguage, "ja-JP");
});

test("preferred language remains a small bias for clear longer speech", async () => {
  const selected = await selectSpeechCandidate([
    { text: "これは日本語です", sourceLanguage: "ja-JP", confidence: 0.1 },
    { text: "this is clearly English", sourceLanguage: "en-US", confidence: 0.9 }
  ], null, "ja");
  assert.equal(selected.sourceLanguage, "en-US");
});

test("ordered language priorities resolve otherwise equal candidates", async () => {
  const candidates = [
    { text: "123", sourceLanguage: "ja-JP", confidence: 0.5 },
    { text: "123", sourceLanguage: "en-US", confidence: 0.5 },
    { text: "123", sourceLanguage: "id-ID", confidence: 0.5 }
  ];
  assert.equal((await selectSpeechCandidate(candidates, null, ["id", "en", "ja"])).sourceLanguage, "id-ID");
  assert.equal((await selectSpeechCandidate(candidates.slice(0, 2), null, ["id", "en", "ja"])).sourceLanguage, "en-US");
  assert.equal((await selectSpeechCandidate(candidates, null, ["en", "ja"])).sourceLanguage, "en-US");
  assert.equal((await selectSpeechCandidate([candidates[0], candidates[2]], null, ["en", "ja"])).sourceLanguage, "ja-JP");
  assert.equal((await selectSpeechCandidate(candidates, null, ["ja"])).sourceLanguage, "ja-JP");
});

test("learns the dominant language from final speech within one session", async () => {
  const learner = new SessionLanguageLearner();
  for (let index = 0; index < 6; index += 1) {
    learner.observe({ text: "terima kasih semuanya", sourceLanguage: "id-ID", confidence: 0.85 });
  }
  const closeCandidates = [
    { text: "123", sourceLanguage: "en-US", confidence: 0.61 },
    { text: "123", sourceLanguage: "id-ID", confidence: 0.5 }
  ];
  assert.equal((await selectSpeechCandidate(closeCandidates)).sourceLanguage, "en-US");
  assert.equal((await selectSpeechCandidate(closeCandidates, null, [], learner)).sourceLanguage, "id-ID");
});

test("session learning ignores short noise, adapts to recent speech, and can be reset", () => {
  const learner = new SessionLanguageLearner();
  for (let index = 0; index < 8; index += 1) learner.observe({ text: "bahasa indonesia", sourceLanguage: "id-ID", confidence: 0.8 });
  const initialIdBias = learner.getBias({ text: "…", sourceLanguage: "id-ID" });
  learner.observe({ text: "ah", sourceLanguage: "en-US", confidence: 1 });
  assert.equal(learner.getBias({ text: "…", sourceLanguage: "id-ID" }), initialIdBias);

  for (let index = 0; index < 18; index += 1) learner.observe({ text: "we are speaking English now", sourceLanguage: "en-US", confidence: 0.9 });
  assert.ok(learner.getBias({ text: "…", sourceLanguage: "en-US" }) > learner.getBias({ text: "…", sourceLanguage: "id-ID" }));
  learner.reset();
  assert.equal(learner.getBias({ text: "…", sourceLanguage: "en-US" }), 0);
  assert.equal(learner.getBias({ text: "…", sourceLanguage: "id-ID" }), 0);
});

test("stopping a recognizer discards its session language learning", async () => {
  const recognizer = new MultilingualSpeechRecognizer();
  for (let index = 0; index < 6; index += 1) {
    recognizer.sessionLanguageLearner.observe({ text: "bahasa indonesia", sourceLanguage: "id-ID", confidence: 0.8 });
  }
  assert.ok(recognizer.sessionLanguageLearner.getBias({ text: "…", sourceLanguage: "id-ID" }) > 0);
  await recognizer.stop();
  assert.equal(recognizer.sessionLanguageLearner.getBias({ text: "…", sourceLanguage: "id-ID" }), 0);
});

test("translator caches separate model instances for each language pair", async (t) => {
  const previous = globalThis.Translator;
  t.after(() => { globalThis.Translator = previous; });
  const created = [];
  globalThis.Translator = class {
    static async availability() { return "available"; }
    static async create(options) {
      created.push(`${options.sourceLanguage}:${options.targetLanguage}`);
      return { async translate(text) { return text; }, destroy() {} };
    }
  };
  const translator = new LocalTranslator();
  await translator.translate("hello", "en", "ja");
  await translator.translate("halo", "id", "ja");
  await translator.translate("again", "en", "ja");
  assert.deepEqual(created, ["en:ja", "id:ja"]);
});

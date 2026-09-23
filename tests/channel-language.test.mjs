import test from "node:test";
import assert from "node:assert/strict";
import { detectChannelLanguageHint, detectChannelLanguagePriority, readYoutubePageContext } from "../src/content/channel-language.js";
import { findHololiveChannelMember } from "../src/speech/hololive-vocabulary.js";

test("uses Japanese as the JP channel preference", () => {
  assert.deepEqual(detectChannelLanguagePriority({
    channelIdentity: "Lui ch. 鷹嶺ルイ - holoX -",
    videoIdentity: "FUWAMOCOとのコラボ配信"
  }), ["ja"]);
  assert.equal(detectChannelLanguageHint({
    channelIdentity: "Lui ch. 鷹嶺ルイ - holoX -",
    videoIdentity: "FUWAMOCOとのコラボ配信"
  }), "ja");
});

test("uses branch-specific language priorities for EN and ID member channels", () => {
  assert.deepEqual(detectChannelLanguagePriority({ channelIdentity: "FUWAMOCO Ch. hololive-EN" }), ["en", "ja"]);
  assert.deepEqual(detectChannelLanguagePriority({ channelIdentity: "Kobo Kanaeru Ch. hololive-ID" }), ["id", "en", "ja"]);
});

test("falls back to affiliation in the video title and otherwise stays neutral", () => {
  assert.equal(detectChannelLanguageHint({ videoIdentity: "【MV】Example【hololive English】" }), "en");
  assert.equal(detectChannelLanguageHint({ channelIdentity: "Independent Channel" }), null);
});

test("marks a known member channel for Hololive vocabulary", () => {
  const node = (textContent) => ({ textContent, getAttribute() { return ""; } });
  const context = readYoutubePageContext({
    title: "配信タイトル - YouTube",
    querySelector(selector) {
      if (selector.includes("channel-name")) return node("Miko Ch. さくらみこ");
      if (selector.includes("h1")) return node("ゲーム配信");
      return null;
    }
  });
  assert.equal(context.channelLanguageHint, "ja");
  assert.deepEqual(context.channelLanguagePriority, ["ja"]);
  assert.equal(context.isHololive, true);
  assert.equal(context.channelMember, "さくらみこ");
});

test("identifies only the channel owner for personalized recognition hints", () => {
  assert.equal(findHololiveChannelMember("Mio Channel 大神ミオ"), "大神ミオ");
  assert.equal(findHololiveChannelMember("Ookami Mio Ch. hololive-JP"), "大神ミオ");
  assert.equal(findHololiveChannelMember("Independent Channel"), null);
  assert.equal(findHololiveChannelMember("大神ミオ・白上フブキ合同チャンネル"), null);
  const node = (textContent) => ({ textContent, getAttribute() { return ""; } });
  const context = readYoutubePageContext({
    title: "大神ミオとコラボ - YouTube",
    querySelector(selector) {
      if (selector.includes("channel-name")) return node("Fubuki Ch. 白上フブキ");
      if (selector.includes("h1")) return node("大神ミオとコラボ");
      return null;
    }
  });
  assert.equal(context.channelMember, "白上フブキ");
});

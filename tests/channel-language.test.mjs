import test from "node:test";
import assert from "node:assert/strict";
import { detectChannelLanguageHint, readYoutubePageContext } from "../src/content/channel-language.js";

test("uses Japanese as the JP channel preference", () => {
  assert.equal(detectChannelLanguageHint({
    channelIdentity: "Lui ch. 鷹嶺ルイ - holoX -",
    videoIdentity: "FUWAMOCOとのコラボ配信"
  }), "ja");
});

test("uses English for both EN and ID member channels", () => {
  assert.equal(detectChannelLanguageHint({ channelIdentity: "FUWAMOCO Ch. hololive-EN" }), "en");
  assert.equal(detectChannelLanguageHint({ channelIdentity: "Kobo Kanaeru Ch. hololive-ID" }), "en");
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
  assert.equal(context.isHololive, true);
});

import test from "node:test";
import assert from "node:assert/strict";
import { detectChannelLanguageHint } from "../src/content/channel-language.js";

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

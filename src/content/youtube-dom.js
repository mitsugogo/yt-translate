import { getVideoId as getSharedVideoId } from "../shared/settings.js";

export function getVideoId(url = location.href) {
  return getSharedVideoId(url);
}

export function isVideoPage(url = location.href) {
  return Boolean(getVideoId(url));
}

export function findTranslationInsertionPoint(doc = document) {
  const metadata = doc.querySelector("ytd-watch-flexy #below ytd-watch-metadata, ytd-watch-metadata, #above-the-fold #title, #below #title");
  if (metadata?.parentElement) return { parent: metadata.parentElement, before: metadata };

  const below = doc.querySelector("ytd-watch-flexy #below, #below, #below-the-fold");
  if (below) return { parent: below, before: below.firstElementChild || null };

  const player = doc.querySelector("ytd-watch-flexy #player-container-outer");
  if (player?.parentElement) return { parent: player.parentElement, before: player.nextSibling };
  return null;
}

export function hasPanel(doc = document) {
  return Boolean(doc.querySelector("yt-local-translator"));
}

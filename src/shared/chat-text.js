// Match whole reactions only; a sentence containing laughter still translates.
const LAUGHTER = /^(?:(?:w+|ｗ+|笑+|草+|大草原|爆笑|哈{2,}|呵{2,}|嘻{2,}|lol|lmao|lmfao|rofl|(?:ha){2,}h?|(?:he){2,}|(?:ja){2,}|(?:wk){2,}|k{3,}|[ㅋㅎ]+)[\s\p{P}\p{S}]*)+$/iu;

export function shouldSkipChatText(text) {
  const trimmed = String(text || "").trim();
  if (!/\p{L}/u.test(trimmed)) return true;
  // Emote names sent as :name: are presentation tokens, not prose.
  const withoutEmotes = trimmed.replace(/:[\w+-]+:/gu, "").trim();
  if (!/\p{L}/u.test(withoutEmotes)) return true;
  const reaction = withoutEmotes.replace(/[\p{M}\u200d]/gu, "").replace(/^[\s\p{P}\p{S}]+/u, "");
  return LAUGHTER.test(reaction);
}

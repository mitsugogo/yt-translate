export function meaningfulTextLength(text = "") {
  return [...String(text).replace(/[^\p{L}\p{N}]/gu, "")].length;
}

export function speechConfidence(candidate) {
  return Number.isFinite(candidate?.confidence) ? Math.min(1, Math.max(0, candidate.confidence)) : 0;
}

// Reject long loops, not ordinary emphasis such as "no no no" or "そうそう".
// Compact text also catches Japanese loops without spaces and punctuation changes.
export function hasExcessiveRepetition(text = "") {
  const normalized = String(text).normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
  if (normalized.length < 12) return false;
  for (let size = 1; size <= Math.min(32, Math.floor(normalized.length / 6)); size += 1) {
    let run = 0;
    for (let index = size; index < normalized.length; index += 1) {
      run = normalized[index] === normalized[index - size] ? run + 1 : 0;
      const span = run + size;
      if (run >= size * 5 && span >= 12 && (span >= normalized.length * 0.6 || span >= 48)) return true;
    }
  }
  return false;
}

export function isUsableSpeechCandidate(candidate) {
  return meaningfulTextLength(candidate?.text) > 0 && !hasExcessiveRepetition(candidate?.text);
}

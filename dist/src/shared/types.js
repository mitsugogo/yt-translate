/**
 * @typedef {Object} TranscriptChunk
 * @property {string} id
 * @property {string} original
 * @property {string=} translated
 * @property {boolean} isFinal
 * @property {number} timestamp
 */

/**
 * @typedef {Object} FeatureReport
 * @property {{supported: boolean, local: boolean, status?: string, message?: string}} speech
 * @property {{supported: boolean, status?: string, message?: string}} translator
 */

export const FEATURE_STATUS = Object.freeze({
  AVAILABLE: "available",
  DOWNLOADABLE: "downloadable",
  DOWNLOADING: "downloading",
  UNAVAILABLE: "unavailable"
});

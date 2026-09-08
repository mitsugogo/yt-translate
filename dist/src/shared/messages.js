export const MessageType = Object.freeze({
  CONTENT_READY: "content:ready",
  GET_SETTINGS: "settings:get",
  SETTINGS_UPDATED: "settings:updated",
  SET_ENABLED: "settings:set-enabled",
  GET_POPUP_STATE: "popup:get-state",
  PREPARE_MODELS: "models:prepare",
  REQUEST_FEATURES: "features:request",
  REQUEST_PAGE_CONTEXT: "page-context:request",
  START: "session:start",
  STOP: "session:stop",
  START_CAPTURE: "session:start-capture",
  OFFSCREEN_STOP: "session:offscreen-stop",
  OFFSCREEN_SETTINGS: "session:offscreen-settings",
  CHECK_FEATURES: "features:check",
  OFFSCREEN_FEATURES: "features:offscreen-result",
  OFFSCREEN_STATE: "session:state",
  OFFSCREEN_TRANSCRIPT: "transcript:result",
  OFFSCREEN_TRANSLATION: "translation:result",
  OFFSCREEN_ERROR: "pipeline:error"
});

export const TranslatorState = Object.freeze({
  IDLE: "idle",
  INITIALIZING: "initializing",
  DOWNLOADING: "downloading",
  LISTENING: "listening",
  PAUSED: "paused",
  ERROR: "error"
});

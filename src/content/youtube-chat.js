import { MessageType } from "../shared/messages.js";
import { ChatTranslationView } from "./chat-translation.js";

function hasContext() {
  try { return Boolean(chrome.runtime?.id); }
  catch { return false; }
}

async function send(message) {
  try {
    if (!hasContext()) { view.dispose(); return null; }
    return await chrome.runtime.sendMessage(message);
  } catch {
    if (!hasContext()) view.dispose();
    return null;
  }
}

const view = new ChatTranslationView({
  request: (item) => send({ type: MessageType.CHAT_TRANSLATE, ...item })
});
let settingsRevision = 0;

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === MessageType.OFFSCREEN_SETTINGS && message.settings) {
    settingsRevision += 1;
    view.setSettings(message.settings);
  }
});
window.addEventListener("pagehide", () => view.dispose(), { once: true });
void send({ type: MessageType.CHAT_READY }).then((response) => {
  if (settingsRevision === 0 && response?.settings) view.setSettings(response.settings);
});

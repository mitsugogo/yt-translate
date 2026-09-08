import { TranslatorState } from "../shared/messages.js";

export { TranslatorState };

export function speechError(code, originalMessage = "") {
  const messages = {
    unavailable: "このChromeでは端末内の音声認識を利用できません。",
    local_unavailable: "このChromeでは端末内の音声認識を利用できません。",
    language_unavailable: "選択した言語の音声認識モデルを、この端末では利用できません。",
    language_install_failed: "音声認識モデルをインストールできませんでした。",
    audio_track_unavailable: "このChromeでは取得したタブ音声を認識できません。",
    no_audio: "音声が検出されませんでした。",
    not_allowed: "Chromeが音声認識の実行を許可しませんでした。",
    start_failed: "音声認識を開始できませんでした。"
  };
  return {
    code,
    message: messages[code] || originalMessage || "音声認識に失敗しました。"
  };
}

export function translationError(code, originalMessage = "", direction = "") {
  const messages = {
    unavailable: "この環境ではChromeの翻訳機能を利用できません。",
    pair_unavailable: `${direction || "選択した言語の組み合わせ"} の翻訳を、この端末では利用できません。`,
    model_install_failed: `${direction || "翻訳"} モデルを準備できませんでした。`,
    user_activation: "翻訳モデルの準備にはクリック操作が必要です。拡張機能からモデルの準備を再実行してください。",
    failed: "翻訳に失敗しました。"
  };
  return {
    code,
    message: messages[code] || originalMessage || "翻訳に失敗しました。"
  };
}

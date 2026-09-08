import { FEATURE_STATUS } from "../shared/types.js";

const LANGUAGE_LABELS = { "ja-JP": "日本語", "en-US": "英語", "id-ID": "インドネシア語" };

export function getSpeechRecognitionConstructor(scope = globalThis) {
  return scope.SpeechRecognition || scope.webkitSpeechRecognition || null;
}

export function hasSpeechRecognition(scope = globalThis) {
  return Boolean(getSpeechRecognitionConstructor(scope));
}

export function hasLocalSpeechRecognition(scope = globalThis) {
  const Constructor = getSpeechRecognitionConstructor(scope);
  if (!Constructor) return false;
  try {
    return "processLocally" in Constructor.prototype && typeof Constructor.available === "function";
  } catch {
    return false;
  }
}

export async function checkSpeechLanguage({ language = "en-US", scope = globalThis } = {}) {
  const Constructor = getSpeechRecognitionConstructor(scope);
  if (!Constructor) {
    return { supported: false, local: false, status: FEATURE_STATUS.UNAVAILABLE, message: "このChromeでは音声認識機能を利用できません。" };
  }

  let recognition;
  try {
    recognition = new Constructor();
  } catch {
    return { supported: false, local: false, status: FEATURE_STATUS.UNAVAILABLE, message: "音声認識機能を初期化できませんでした。" };
  }

  const local = "processLocally" in recognition && typeof Constructor.available === "function";
  if (!local) {
    return {
      supported: true,
      local: false,
      status: FEATURE_STATUS.UNAVAILABLE,
      message: "このChromeでは端末内の音声認識に対応していません。"
    };
  }

  try {
    const status = await Constructor.available({
      langs: [language],
      processLocally: true
    });
    return { supported: true, local: true, status };
  } catch (error) {
    return {
      supported: true,
      local: true,
      status: FEATURE_STATUS.UNAVAILABLE,
      message: error instanceof Error ? error.message : "音声認識モデルの対応状況を確認できませんでした。"
    };
  }
}

export async function checkSpeechLanguages({ languages = ["en-US"], scope = globalThis } = {}) {
  const reports = await Promise.all(languages.map(async (language) => ({
    language,
    ...(await checkSpeechLanguage({ language, scope }))
  })));
  const statusOrder = {
    [FEATURE_STATUS.AVAILABLE]: 0,
    [FEATURE_STATUS.DOWNLOADING]: 1,
    [FEATURE_STATUS.DOWNLOADABLE]: 2,
    [FEATURE_STATUS.UNAVAILABLE]: 3
  };
  const furthest = reports.reduce((current, report) =>
    (statusOrder[report.status] ?? 3) > (statusOrder[current.status] ?? 3) ? report : current,
  reports[0] || { status: FEATURE_STATUS.UNAVAILABLE });
  return {
    supported: reports.length > 0 && reports.every((report) => report.supported),
    local: reports.length > 0 && reports.every((report) => report.local),
    status: furthest.status,
    message: (() => {
      const failed = reports.find((report) => report.message);
      return failed ? `${LANGUAGE_LABELS[failed.language] || failed.language}: ${failed.message}` : "";
    })(),
    languages: reports
  };
}

export async function ensureSpeechLanguage({ language = "en-US", onState, scope = globalThis } = {}) {
  const Constructor = getSpeechRecognitionConstructor(scope);
  const report = await checkSpeechLanguage({ language, scope });
  if (!report.supported || !report.local) {
    const error = new Error(report.message || "この環境では端末内の音声認識を利用できません。");
    error.code = "local_unavailable";
    throw error;
  }

  if (report.status === FEATURE_STATUS.AVAILABLE) return report;
  if (report.status === FEATURE_STATUS.UNAVAILABLE) {
    const error = new Error("選択した言語の音声認識モデルを、このChrome・端末では利用できません。翻訳モデルとは別のモデルが必要です。");
    error.code = "language_unavailable";
    throw error;
  }

  if (typeof Constructor.install !== "function") {
    const error = new Error("音声認識モデルのインストール機能を利用できません。");
    error.code = "language_install_failed";
    throw error;
  }

  onState?.("downloading");
  const installed = await Constructor.install({
    langs: [language],
    processLocally: true
  });
  if (!installed) {
    const error = new Error("音声認識モデルのインストールに失敗しました。");
    error.code = "language_install_failed";
    throw error;
  }

  const installedReport = await checkSpeechLanguage({ language, scope });
  if (installedReport.status !== FEATURE_STATUS.AVAILABLE) {
    const error = new Error("インストール後も音声認識モデルを利用できません。");
    error.code = "language_install_failed";
    throw error;
  }
  return installedReport;
}

export async function ensureSpeechLanguages({ languages = ["en-US"], onState, scope = globalThis } = {}) {
  const uniqueLanguages = [...new Set(languages)];
  const results = [];
  for (let index = 0; index < uniqueLanguages.length; index += 1) {
    const language = uniqueLanguages[index];
    try {
      const result = await ensureSpeechLanguage({
        language,
        scope,
        onState: (state) => onState?.(state, { language, index, total: uniqueLanguages.length })
      });
      results.push({ language, ...result });
    } catch (error) {
      error.message = `${LANGUAGE_LABELS[language] || language}: ${error.message}`;
      throw error;
    }
  }
  return results;
}

# YouTube Local Translator

YouTubeの音声をChromeのオンデバイス音声認識で文字起こしし、Chrome Translator APIでローカル翻訳するManifest V3拡張機能です。

## このMVPの範囲

- 対象はYouTubeの通常動画・ライブ・アーカイブ
- 日本語・英語・インドネシア語の自動判定、または単一言語の指定
- 自動判定では、チャンネルから推定した言語または手動指定した優先言語を候補選択に反映
- 認識候補を発話ごとに選び、混在する言語部分を指定した翻訳先へ変換
- プレイヤーと動画タイトルの間に最新の原文・翻訳を表示
- Chrome Built-in AIのSpeechRecognition / Translator APIを優先
- 文字起こし・翻訳結果を保存せず、外部サーバーへ送信しない
- YouTubeのSPA遷移でセッションとUIを再接続
- 原文表示・翻訳表示・フォントサイズ・ON/OFFをPopupで設定

字幕履歴、日本語・英語・インドネシア語以外の言語、クラウドAPI、Gemini Nano、エクスポートはこのMVPには含めていません。

## 導入

1. `npm run build` を実行する。
2. Chromeで `chrome://extensions` を開く。
3. デベロッパーモードを有効にする。
4. 「パッケージ化されていない拡張機能を読み込む」で `dist` フォルダーを選ぶ。
5. YouTubeの動画ページを開き、拡張機能Popupの `ON` を押す。
6. ChromeがAPIまたはモデルを利用できない場合は、Popupまたはパネルのエラー案内に従う。

`tabCapture` はユーザー操作後に開始する必要があります。音声取得開始時は、捕捉した音声をAudioContextから出力先へ戻して、YouTubeの音が消えないようにしています。

## Chrome側の前提

Chromeのバージョン、端末性能、Built-in AIのモデル状態によって利用可否が変わります。自動判定ではSpeechRecognitionの日本語・英語・インドネシア語ローカル言語パックを使用し、複数の認識候補から発話ごとの言語を選びます。必要な音声認識・言語判定・翻訳モデルを利用できない場合、拡張機能はクラウドへフォールバックせず、明示的にエラーを表示します。

「自動判定の優先言語」を「チャンネルから推定」にすると、ホロライブJPのチャンネルでは日本語、ホロライブEN・IDでは英語を候補選択で少し優先します。短く曖昧な発話では優先度をやや強めます。推定が合わないチャンネルでは、日本語・英語・インドネシア語を直接指定するか「優先なし」を選べます。

Translator APIのモデル作成にはユーザー操作が必要になる場合があります。その場合はPopupの操作から準備をやり直してください。

## 開発用チェック

依存パッケージはありません。

```powershell
npm test
npm run check
```

`npm run check` はManifestの参照先と全JavaScriptの構文を検査します。実際のChromeでの音声・モデル・YouTube DOMの動作は、Chromeの環境とユーザー操作を必要とするため、別途確認してください。

## Privacy

Audio is processed locally on your device.

No audio, transcript, or translation is sent to this extension's server. この拡張機能にはサーバー接続処理を含めていません。

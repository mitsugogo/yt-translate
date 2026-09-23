# YouTube Local Translator

YouTubeの音声をChromeのオンデバイス音声認識で文字起こしし、Chrome Translator APIでローカル翻訳するManifest V3拡張機能です。

## about

- YouTubeライブ・動画から文字起こしと翻訳をおこなう Chrome Extension です
- 処理はすべてChromeのAPIを利用しているため、ローカルでのみ完結し、サーバーには送信されません
- ホロライブをよくみるので、ホロライブに関する単語の辞書を試験的にプリインストールしています
- インドネシア語・英語・日本語 を相互変換できます

## 導入

1. `npm run build` を実行する。
2. Chromeで `chrome://extensions` を開く。
3. デベロッパーモードを有効にする。
4. 「パッケージ化されていない拡張機能を読み込む」で `dist` フォルダーを選ぶ。
5. YouTubeの動画ページを開き、拡張機能Popupの `ON` を押す。
6. ChromeがAPIまたはモデルを利用できない場合は、Popupまたはパネルのエラー案内に従う。

配布用のChrome拡張機能zipは `npm run zip` で作成できます。生成物は `.output/YouTube-Local-Translator-<version>-chrome.zip` に出力されます。

`tabCapture` はユーザー操作後に開始する必要があります。音声取得開始時は、捕捉した音声をAudioContextから出力先へ戻して、YouTubeの音が消えないようにしています。

## 開発用チェック

```powershell
npm test
npm run check
npm run zip
```

## リリース

GitHubで `vMAJOR.MINOR.PATCH` 形式のタグを付けたReleaseを公開すると、Actionsがタグのバージョンを `package.json` と `manifest.json` に反映し、テスト・検査・zip生成を実行して、生成したChrome拡張機能zipをReleaseへ添付します。

## Privacy

音声データや翻訳は全てChromeにプリインストールされているローカルの処理で行われます。  
外部サーバへの送信はされません。

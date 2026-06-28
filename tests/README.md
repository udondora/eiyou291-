# テスト

機能が多く「組み合わせ」で不具合が出やすいため、リリース前に下記を確認します。

## 自動回帰テスト（Playwright）

```bash
npm i playwright-core          # 初回のみ
# Chrome/Chromium のパスを指定（例）
CHROME=/path/to/chrome node tests/regression.mjs            # 最新の eiyou291_v*.html を自動選択
CHROME=/path/to/chrome node tests/regression.mjs eiyou291_v39.html
```

`tests/regression.mjs` が確認する重点シナリオ（モードの組み合わせ）:

| シナリオ | 確認内容 |
|----------|----------|
| 解答・永続化 | 正解/不正解の集計、リロード後も保持 |
| 選択肢トグル解除 | 同じ選択肢の再タップで正解/不正解数が戻る |
| 検索 ＋ 不正解だけ | 併用しても件数が破綻しない |
| 科目フィルタ ＋ 模試 | 出題対象がフィルタに従う（対象外が出ない） |
| 模試中 ＋ キーボード | 通常進捗を勝手に書き換えない |
| 採点後 ＋ キーボード | 採点結果表示中はキー操作無効 |
| 模試の終了 | 一覧（フィルタ状態）に正しく戻る |
| 集中モード ＋ シャッフル | 順序が崩れない（シャッフルで集中終了） |
| バックアップ復元 | 書き出し→クリア→読み込みで進捗が復元 |
| コンソールエラー | 0 件 |

## Service Worker（PWA）の手動確認

Service Worker は HTTPS または `localhost` でのみ動作します。

1. ルートで `python3 -m http.server 8000` を実行
2. Chrome/Edge の DevTools → Application → Service Workers で **Unregister**、Storage → **Clear site data**
3. `http://localhost:8000/` を開く
4. 10問ほど解く → リロードして進捗が残るか
5. Network → **Offline** にして再読み込み（オフラインで開けるか）
6. 新バージョン公開時は「🆕更新」バー → 押すと最新化されるか
7. iPhone Safari でホーム画面に追加し、同じ確認

## デバッグ補助

- `app.js` 冒頭で `window.error` / `unhandledrejection` を `console.error` に集約。
- localStorage は `safeLoad/safeSave/safeGetRaw/safeSetRaw` 経由（失敗時は警告のみで停止しない）。

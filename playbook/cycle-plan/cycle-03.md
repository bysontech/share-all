project: wedding-photo-share
cycle: 3
goal: 管理者の最小運用機能を追加し、当日の表示制御と不適切投稿対処を縦に動かす

## Scope（Must）
1. 管理者導線の確立
- /admin/:roomId から管理画面に入れる
- host_token による管理者認証を通せる
- 管理者トークンを localStorage に保持できる

2. 投稿管理
- 投稿一覧を管理者視点で取得できる
- visible / hidden を切り替えられる
- 投稿を削除できる
- 削除時は D1 レコードと R2 オブジェクトの整合を保つ

3. スライドショー設定
- slideshow_settings の取得・更新ができる
- interval_seconds を変更できる
- show_nickname を変更できる
- order_mode は asc / desc のみ対応する（manual は次以降）

4. スライドショー反映
- スライドショー画面が最新設定を反映する
- hidden の投稿は参加者一覧・スライドショーの両方から消える
- 削除済み投稿は表示対象から除外される

## Scope（Should）
- 管理画面から参加者用URLを再確認できる
- QR表示の土台を置く（画像生成が重ければURL表示のみでも可）
- 管理操作後に楽観更新または即時再取得で一覧が自然に更新される

## Scope（Could）
- 件数サマリ（visible / hidden / total）
- 危険操作前の確認ダイアログ改善

## Out of Scope
- 動画対応
- manual 並び順制御
- 一括操作
- ZIPダウンロード
- 合言葉変更
- SSE / WebSocket
- デザイン作り込み

## 完了条件
- 管理者が host_token でログインできる
- 管理者が投稿を hidden / visible 切替できる
- 管理者が投稿を削除できる
- スライドショー設定を変更できる
- 変更結果が参加者一覧とスライドショーに反映される
- build が通る
- Cycle-01 / 02 の既存導線を壊していない

## 実装メモ
- 管理者APIは X-Host-Token ヘッダーで統一
- 削除は R2 削除失敗時の扱いを明確にする
- hidden は物理削除せず status 更新のみ
- slideshow_settings レコード未作成時は初期値で自動生成 or フォールバック

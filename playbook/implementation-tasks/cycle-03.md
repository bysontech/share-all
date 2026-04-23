# Cycle-03 Implementation Tasks

## ゴール
管理者の最小運用機能を実装し、当日のトラブル対応と表示制御を可能にする。
対象は host_token 認証、投稿管理、スライドショー設定、表示反映まで。

---

## 1. API 実装（Workers / Hono）

### 1-1. 管理者用の認証共通化
- [ ] X-Host-Token を検証する共通ミドルウェアまたはヘルパーを実装
- [ ] roomId と host_token の組み合わせを検証
- [ ] 認証失敗時は 401 / 403 を明確に返す

### 1-2. 管理者向け投稿一覧取得
- [ ] 管理者向けに visible / hidden を含む投稿一覧取得を実装
- [ ] uploaded のみ対象にする
- [ ] 参加者向けAPIと責務を分けるか、role に応じて返却を分ける
- [ ] created_at desc を基本表示順にする

### 1-3. 投稿ステータス変更 API
- [ ] PATCH /api/rooms/:roomId/posts/:postId を実装
- [ ] status を visible / hidden に変更可能にする
- [ ] uploaded 以外の投稿をどう扱うかを整理する
- [ ] 更新後の投稿データを返す

### 1-4. 投稿削除 API
- [ ] DELETE /api/rooms/:roomId/posts/:postId を実装
- [ ] 対象投稿を取得し file_key を確認
- [ ] R2 のオブジェクト削除を実行
- [ ] D1 の投稿レコードを削除
- [ ] エラー時の扱いを整理
  - R2 削除失敗時に D1 を消さない
  - 失敗レスポンスを返す

### 1-5. スライドショー設定取得 API
- [ ] GET /api/rooms/:roomId/slideshow-settings を実装
- [ ] レコード未作成時は初期値を返す
- [ ] 必要なら初回アクセス時に自動 insert する

### 1-6. スライドショー設定更新 API
- [ ] PUT /api/rooms/:roomId/slideshow-settings を実装
- [ ] interval_seconds を更新可能にする
- [ ] show_nickname を更新可能にする
- [ ] order_mode は asc / desc のみ許可する
- [ ] バリデーションを入れる
  - interval_seconds の下限 / 上限
  - order_mode の許可値

---

## 2. フロント実装（React / Vite）

### 2-1. 管理者ページ作成
- [ ] /admin/:roomId ページを実装
- [ ] host_token 入力UIを追加
- [ ] localStorage 保存 / 再利用を実装
- [ ] トークン未入力時はログイン状態を促す

### 2-2. 管理者ダッシュボード最小UI
- [ ] ルームID / participantUrl を表示
- [ ] 投稿一覧を表示
- [ ] visible / hidden 状態を見分けられるようにする
- [ ] 非表示ボタン / 再表示ボタンを追加
- [ ] 削除ボタンを追加

### 2-3. 管理操作時の一覧更新
- [ ] visible → hidden 切替後に一覧更新
- [ ] hidden → visible 切替後に一覧更新
- [ ] delete 後に一覧から除外
- [ ] 二重更新やチラつきを避ける

### 2-4. スライドショー設定UI
- [ ] interval_seconds を編集できるUIを追加
- [ ] show_nickname の ON / OFF UIを追加
- [ ] order_mode の asc / desc 切替UIを追加
- [ ] 保存ボタン押下で API 更新
- [ ] 保存成功 / 失敗フィードバックを表示

### 2-5. スライドショー画面の設定反映
- [ ] slideshow-settings API を読み込む
- [ ] interval_seconds を表示切替間隔へ反映
- [ ] show_nickname をオーバーレイ表示へ反映
- [ ] order_mode asc / desc を反映
- [ ] hidden / delete 済み投稿が残り続けないよう再取得を調整

---

## 3. データ / 状態整合

### 3-1. posts の扱い
- [ ] 参加者一覧は visible のみ
- [ ] 管理者一覧は visible / hidden を表示
- [ ] slideshow は visible のみ
- [ ] delete 後はどの画面にも残さない

### 3-2. slideshow_settings の初期値
- [ ] interval_seconds = 5
- [ ] show_nickname = 1
- [ ] order_mode = asc
- [ ] 既存ルームでも安全に扱えるようにする

---

## 4. テスト観点
- [ ] host_token なしで管理APIに入れない
- [ ] 間違った host_token で更新できない
- [ ] hidden 化すると参加者一覧から消える
- [ ] hidden 化するとスライドショーから消える
- [ ] visible に戻すと再表示される
- [ ] delete すると再取得後も出ない
- [ ] interval_seconds 変更が反映される
- [ ] show_nickname ON / OFF が反映される
- [ ] asc / desc が反映される
- [ ] build が通る

---

## 5. 実装順の推奨
1. host_token 検証共通化
2. 管理者投稿一覧 API
3. PATCH / DELETE API
4. 管理画面 UI
5. slideshow-settings API
6. 設定 UI
7. スライドショーへの反映
8. 全体確認と既存導線の回帰確認

---

## 6. 注意点
- hidden は論理非表示であり、削除ではない
- delete は R2 と D1 の順序を意識する
- 管理者UIを作っても参加者導線を壊さない
- manual 並び順はまだ入れない
- 動画分岐は書き込み過ぎない

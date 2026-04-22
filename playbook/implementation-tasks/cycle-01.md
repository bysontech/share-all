# cycle-01 implementation tasks

## ゴール
ルーム作成から参加者入室、画像1枚の直アップロード、投稿一覧への即時反映までを動作させる。

## 前提
- 基本設計は architecture.md を唯一の設計基準とする
- テンプレC（Pages + Workers + D1 + R2）前提
- まずは画像のみ対応し、動画・複数ファイルは次サイクルへ送る
- 既存構成を壊さない
- 不要な依存を追加しない

## 実装タスク

### 1. スキーマとバインディングの最小セットを用意する
- D1 の初期マイグレーションを作成する
  - rooms
  - posts
  - slideshow_settings
- posts に以下を含める
  - upload_status
  - uploaded_at
- wrangler 側で D1 / R2 バインディングを設定する
- 開発環境で migrate が通る状態にする

完了条件
- ローカルまたは開発環境で DB 初期化ができる
- rooms / posts / slideshow_settings が作成される

### 2. Workers API の土台を作る
- Hono ルーターを初期化する
- 共通レスポンスと基本エラーハンドリングを用意する
- room existence / expires_at を見る共通ガードを用意する
- host_token 検証の最小ミドルウェアを用意する
- passcode 検証の最小ミドルウェアを用意する

完了条件
- API ルートを追加できる構成になっている
- 期限切れ / not found の基本エラーを返せる

### 3. ルーム作成・取得 API を実装する
- POST /api/rooms
  - roomId, hostToken を生成
  - expiresAt = now + 30日
  - rooms へ保存
  - slideshow_settings 初期レコードを作成
  - participantUrl を返す
- GET /api/rooms/:roomId
  - room 情報を取得
  - 参加画面に必要な最小情報だけ返す
  - 有効期限切れなら拒否する

完了条件
- ルームを作成すると DB に保存される
- 参加画面が room 情報を取得できる

### 4. upload-url / complete / fail API を実装する
- POST /api/rooms/:roomId/upload-url
  - fileName, mimeType, fileSize を受け取る
  - 画像 MIME とサイズ上限を検証する
  - postId を採番する
  - fileKey を決定する
  - posts に pending 仮レコードを作成する
  - 署名付き PUT URL を返す
- POST /api/rooms/:roomId/posts/:postId/complete
  - pending の対象レコードを uploaded に更新する
  - uploaded_at を記録する
- POST /api/rooms/:roomId/posts/:postId/fail
  - pending の対象レコードを failed に更新する

完了条件
- 仮レコード作成 → complete / fail の状態遷移ができる
- 不正 MIME / サイズ超過を拒否できる

### 5. 投稿一覧 API を実装する
- GET /api/rooms/:roomId/posts
  - visible かつ uploaded のみ返す
  - since / limit の最小対応を入れる
  - created_at 昇順の取得を基本とする
- レスポンスは参加者画面で使う最小項目に絞る

完了条件
- アップロード完了済みの投稿だけ一覧に出る
- failed / pending が混ざらない

### 6. フロントのページ骨組みを作る
- ルーティングを用意する
  - /
  - /room/:roomId
  - /admin/:roomId
- 共通 API クライアントを最小実装する
- loading / error / empty の基本表示を用意する

完了条件
- 各画面に遷移できる
- room 情報取得エラー時の表示がある

### 7. 管理者の最小導線を実装する
- トップ画面にルーム作成フォームを置く
  - name
  - passcode optional
  - description optional
- 作成成功後に /admin/:roomId へ遷移させる
- hostToken を localStorage に保存する
- 管理者画面で participantUrl と expiresAt を表示する

完了条件
- ブラウザ操作でルーム作成から管理画面到達まで通る

### 8. 参加者の入室導線を実装する
- /room/:roomId で room 情報を取得する
- passcode 設定時は入力フォームを出す
- ニックネーム入力フォームを出す
- ニックネームを localStorage に保存する
- 保存済みなら再訪時にメイン表示へ進める

完了条件
- 参加者がルームに入室できる
- ニックネームが保持される

### 9. 画像1枚アップロード UI を実装する
- 画像1枚選択 input を置く
- upload-url API を呼ぶ
- 署名付き URL に対して直接 PUT する
- 完了したら complete API を呼ぶ
- 失敗したら fail API を呼ぶ
- uploading / done / error 状態を UI に出す
- 手動リトライを実装する

完了条件
- 画像1枚を R2 へ直アップロードできる
- 失敗時に再試行できる

### 10. 投稿一覧の即時反映を実装する
- 初回ロードで一覧取得する
- complete 成功時に一覧へ即時反映する
- 暫定で再取得ベースでもよい
- 自分の投稿に簡易マークを出してもよい

完了条件
- アップロード成功直後に一覧へ見える

### 11. 最低限のテストと確認を行う
- API のユニットまたは軽い統合確認
  - room create
  - upload-url validation
  - complete / fail status transition
  - posts list filter
- build / lint / typecheck を通す
- 手動確認を行う
  - ルーム作成
  - passcode あり入室
  - passcode なし入室
  - 画像アップロード成功
  - 画像アップロード失敗
  - 期限切れ room の拒否

完了条件
- lint / typecheck / build が通る
- 対象ユースケースが縦に動く

## 実装順の推奨
1. DB と API 土台
2. ルーム作成 / 取得
3. upload-url / complete / fail
4. 参加者 UI
5. 管理者 UI
6. 投稿一覧反映
7. テスト・仕上げ

## 注意事項
- API サーバー経由でファイル本体を中継しない
- pending レコードを作らずに upload-url を返さない
- 一覧には pending / failed を出さない
- viewUrl 一括発行やスライドショーは今サイクルで広げない
- 動画対応に手を出さない

## このサイクルの完了判定
- ルーム作成から参加者入室、画像1枚投稿までがブラウザ上で通る
- R2 に画像が保存され、D1 の post 状態が uploaded になる
- 投稿一覧に uploaded のみ表示される
- エラー時に failed へ遷移し、再試行可能である
- build が通る

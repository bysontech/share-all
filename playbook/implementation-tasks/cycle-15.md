# Cycle-15 Implementation Tasks

## 1. 管理者認証設計

### 1-1. 環境変数

Worker側に以下を追加する。

- ADMIN_PASSWORD_HASH
- ADMIN_SESSION_SECRET
- ADMIN_SESSION_MAX_AGE

注意：
- 平文パスワードをコードに書かない
- secretはwrangler secretで設定する
- ローカル開発用は.dev.varsなどで管理する

---

### 1-2. パスワード検証

管理者ログインAPIを追加する。

POST /api/admin/login

Request:
- password

処理：
- passwordをハッシュ化または既存hashと照合
- 成功時に署名付きCookieを発行
- 失敗時は401

---

### 1-3. セッションCookie

Cookie方針：
- HttpOnly
- Secure（本番）
- SameSite=Lax
- Path=/
- Max-Ageあり

署名：
- ADMIN_SESSION_SECRETで署名
- 改ざん検知する

---

### 1-4. ログアウト

POST /api/admin/logout

処理：
- セッションCookieを削除

---

## 2. 管理者認証ミドルウェア

### 2-1. API用middleware

管理者専用APIでCookieを検証する。

対象：
- GET /api/admin/me
- GET /api/admin/rooms
- POST /api/admin/rooms
- DELETE /api/admin/rooms/:roomId

---

### 2-2. me API

GET /api/admin/me

用途：
- フロントでログイン状態確認
- 未ログインなら401
- ログイン済みならOKを返す

---

## 3. 管理者トップ画面

### 3-1. ルーティング

トップページ / を管理者ログイン/管理者トップにする。

表示：
- 未ログイン：管理者ログイン画面
- ログイン済み：管理者トップ

参加者ページ /room/:roomId は既存通り維持する。

---

### 3-2. ログイン画面

入力：
- パスワード

表示：
- ログイン失敗メッセージ
- ローディング状態

---

### 3-3. 管理者トップ

表示：
- ルーム作成フォーム
- ルーム一覧
- ログアウトボタン

---

## 4. ルーム作成API

### 4-1. 管理者用ルーム作成

POST /api/admin/rooms

認証：
- 管理者Cookie必須

入力：
- name
- description optional
- passcode optional

処理：
- 既存のルーム作成処理を利用
- host_token生成
- slideshow_settings初期化
- theme_settings初期化が必要なら行う

Response:
- roomId
- hostToken
- participantUrl
- adminUrl
- expiresAt

---

### 4-2. 既存POST /api/roomsの扱い

方針：
- 可能なら管理者認証必須に変更
- 既存フロントが使っていないなら /api/admin/rooms に寄せる
- 互換が必要なら内部的に同じ処理を呼ぶ

---

## 5. ルーム一覧API

GET /api/admin/rooms

認証：
- 管理者Cookie必須

返却：
- roomId
- name
- description
- createdAt
- expiresAt
- participantUrl
- adminUrl
- postCount
- imageCount
- videoCount

注意：
- host_tokenは不用意に返さない
- 管理画面遷移に必要な扱いは既存仕様と整合させる

---

## 6. ルーム削除API

DELETE /api/admin/rooms/:roomId

認証：
- 管理者Cookie必須

処理：
1. 対象roomの存在確認
2. posts取得
3. media_derivatives取得
4. R2 objectを削除
   - posts.file_key
   - media_derivatives.file_key
   - theme画像
5. D1関連レコード削除
   - media_derivatives
   - posts
   - slideshow_settings
   - theme_settings
   - rooms
6. 結果を返す

注意：
- R2削除に失敗してもログを残す
- DB削除順序に注意する
- 削除前にフロントで確認ダイアログを出す

---

## 7. フロント実装

### 7-1. APIクライアント

管理者API呼び出し時：
- credentials: 'include' を付与する

---

### 7-2. ログイン状態確認

アプリ起動時またはトップ表示時：
- /api/admin/me を呼ぶ
- 200なら管理者トップ
- 401ならログイン画面

---

### 7-3. ルーム作成フォーム

項目：
- ルーム名
- 説明文
- パスコード

作成後：
- 一覧再取得
- 作成成功表示

---

### 7-4. ルーム一覧UI

各行に表示：
- ルーム名
- 作成日
- 有効期限
- 投稿数
- 参加者URL
- 管理画面リンク
- 削除ボタン

---

### 7-5. 削除UI

- 削除ボタン
- 確認ダイアログ
- 削除中表示
- 成功後一覧から削除
- 失敗時エラー表示

---

## 8. 既存機能との整合

確認対象：
- /room/:roomId の参加者画面
- /room/:roomId/gallery
- /room/:roomId/slideshow
- /admin/:roomId の既存ルーム管理画面
- 投稿アップロード
- ダウンロード
- HEIC表示
- 動画カード

---

## 9. セキュリティ確認

最低限確認すること：
- 未ログインで /api/admin/rooms が401
- 未ログインでルーム削除不可
- Cookie改ざんで401
- 参加者URLはログイン不要
- secretがコードに含まれていない

---

## 10. 完了条件

- 管理者ログインできる
- 管理者ログアウトできる
- 管理者トップが表示される
- ルーム作成できる
- ルーム一覧を取得できる
- ルーム削除できる
- 未ログインでは管理APIを使えない
- 参加者導線が壊れていない
- buildが通る

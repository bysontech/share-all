# 基本設計書 — 結婚式写真共有アプリ  
  
> テンプレC（Cloudflare Pages + Workers + R2 + D1）    
> 対象規模：45人 / PoC グレード / 低コスト運用  
  
-----  
  
## 1. システム全体構成  
  
```  
参加者・管理者（ブラウザ）  
        │  
        ├─── HTTPS ──→ Cloudflare Pages（React / Vite SPA）  
        │                     │  
        │              fetch / REST API  
        │                     ↓  
        │             Cloudflare Workers（Hono）  
        │               ├─ D1（SQLite DB）  
        │               └─ R2（署名付きURL発行のみ）  
        │  
        └─── 署名付きURL ──→ Cloudflare R2（直接PUT / GET）  
```  
  
### 1.1 レイヤー責務  
  
|レイヤー   |サービス                     |責務                   |  
|-------|-------------------------|---------------------|  
|フロントエンド|Cloudflare Pages         |UI描画・状態管理・ポーリング      |  
|API    |Cloudflare Workers (Hono)|ビジネスロジック・D1操作・署名URL発行|  
|DB     |Cloudflare D1            |ルーム・投稿メタデータ管理        |  
|ストレージ  |Cloudflare R2            |ファイル保存・CDN配信         |  
  
-----  
  
## 2. データベース設計（D1）  
  
### 2.1 テーブル一覧  
  
```  
rooms  
posts  
slideshow_settings  
```  
  
-----  
  
### 2.2 rooms テーブル  
  
```sql  
CREATE TABLE rooms (  
  id           TEXT PRIMARY KEY,          -- UUID v4  
  name         TEXT NOT NULL,             -- 表示名（例："田中・山田 結婚式"）  
  passcode     TEXT,                      -- 参加パスコード（NULL=制限なし）  
  host_token   TEXT NOT NULL UNIQUE,      -- 管理者認証トークン（UUID v4）  
  description  TEXT,                      -- 主催者が設定する説明文  
  expires_at   INTEGER NOT NULL,          -- Unix timestamp（作成+30日）  
  created_at   INTEGER NOT NULL           -- Unix timestamp  
);  
```  
  
**補足**  
  
- `id` をURLパスに使用（`/room/:id`）  
- `host_token` はルーム作成時にクライアントへ一度だけ返す。管理者はlocalStorageに保持  
- `passcode` はプレーンテキストで十分（簡易制御目的）  
  
-----  
  
### 2.3 posts テーブル  
  
```sql  
CREATE TABLE posts (  
  id            TEXT PRIMARY KEY,         -- UUID v4  
  room_id       TEXT NOT NULL,  
  nickname      TEXT NOT NULL,            -- 投稿者ニックネーム  
  file_key      TEXT NOT NULL,            -- R2オブジェクトキー  
  file_type     TEXT NOT NULL,            -- "image" | "video"  
  mime_type     TEXT NOT NULL,            -- "image/jpeg" など  
  file_size     INTEGER NOT NULL,         -- bytes  
  status        TEXT NOT NULL DEFAULT 'visible', -- "visible" | "hidden"  
  sort_order    INTEGER,                  -- NULL=投稿順、設定時は手動順  
  created_at    INTEGER NOT NULL,         -- Unix timestamp  
  
  FOREIGN KEY (room_id) REFERENCES rooms(id)  
);  
  
CREATE INDEX idx_posts_room_id_status_created  
  ON posts(room_id, status, created_at);  
```  
  
**補足**  
  
- `file_key` の形式：`{roomId}/{type}/{postId}.{ext}`（例：`abc123/images/xyz.jpg`）  
- `sort_order` が NULL のレコードは `created_at` 昇順で表示  
- `upload_status` はアップロード整合性管理に使用し、一覧・スライドショーでは `uploaded` のみ表示対象とする  
  
-----  
  
### 2.4 slideshow_settings テーブル  
  
```sql  
CREATE TABLE slideshow_settings (  
  room_id          TEXT PRIMARY KEY,  
  interval_seconds INTEGER NOT NULL DEFAULT 5,  -- スライド切替間隔  
  show_nickname    INTEGER NOT NULL DEFAULT 1,  -- 投稿者名表示 0/1  
  order_mode       TEXT NOT NULL DEFAULT 'asc', -- "asc" | "desc" | "manual"  
  updated_at       INTEGER NOT NULL,  
  
  FOREIGN KEY (room_id) REFERENCES rooms(id)  
);  
```  
  
-----  
  
## 3. R2 ストレージ設計  
  
### 3.1 ディレクトリ構造  
  
```  
r2-bucket/  
└── {roomId}/  
    ├── images/  
    │   └── {postId}.{ext}  
    └── videos/  
        └── {postId}.{ext}  
```  
  
### 3.2 アクセスポリシー  
  
|操作    |方法                            |  
|------|------------------------------|  
|アップロード|Workers発行の署名付きPUT URL（有効期限15分）|  
|閲覧    |Workers発行の署名付きGET URL（有効期限1時間）|  
|削除    |Workers経由のみ（直接削除不可）           |  
  
- R2バケットのパブリックアクセスは**無効**  
- すべてのアクセスをWorkers経由で制御  
  
### 3.3 ファイル制限  
  
|項目        |画像                                           |動画                        |  
|----------|---------------------------------------------|--------------------------|  
|許可MIMEタイプ |image/jpeg, image/png, image/webp, image/heic|video/mp4, video/quicktime|  
|最大ファイルサイズ |20 MB                                        |50 MB                     |  
|同時アップロード上限|3件（フロント側キュー制御）                               |1件（画像キューと独立）              |  
  
-----  
  
## 4. API 設計（Workers / Hono）  
  
### 4.1 ルーティング概要  
  
```  
POST   /api/rooms                        -- ルーム作成  
GET    /api/rooms/:roomId                -- ルーム情報取得  
GET    /api/rooms/:roomId/qr            -- QRコード用URL情報返却  
  
POST   /api/rooms/:roomId/upload-url    -- 署名付きアップロードURL発行 + 仮レコード作成  
POST   /api/rooms/:roomId/posts/:postId/complete -- アップロード完了通知・確定登録  
POST   /api/rooms/:roomId/posts/:postId/fail     -- アップロード失敗通知  
GET    /api/rooms/:roomId/posts         -- 投稿一覧取得（ポーリング用）  
GET    /api/rooms/:roomId/posts/:postId/view-url  -- 個別閲覧用署名URL発行  
POST   /api/rooms/:roomId/posts/view-urls        -- 表示用短命URL一括発行  
  
PATCH  /api/rooms/:roomId/posts/:postId -- 投稿ステータス変更（管理者）  
DELETE /api/rooms/:roomId/posts/:postId -- 投稿削除（管理者）  
  
GET    /api/rooms/:roomId/slideshow-settings     -- スライドショー設定取得  
PUT    /api/rooms/:roomId/slideshow-settings     -- スライドショー設定更新（管理者）  
  
GET    /api/rooms/:roomId/download-url/:postId   -- ダウンロード用署名URL（管理者/参加者）  
```  
  
### 4.2 認証方式  
  
|ルート                    |認証                                     |  
|-----------------------|---------------------------------------|  
|参加者向け（GET/POST）        |`X-Room-Passcode` ヘッダー（passcode設定時のみ検証）|  
|管理者向け（PATCH/DELETE/PUT）|`X-Host-Token` ヘッダーでhost_tokenを検証      |  
  
### 4.3 主要エンドポイント詳細  
  
#### `POST /api/rooms` — ルーム作成  
  
**Request Body**  
  
```json  
{  
  "name": "田中・山田 結婚式",  
  "passcode": "wedding2025",   // optional  
  "description": "本日はありがとうございます！"  // optional  
}  
```  
  
**Response**  
  
```json  
{  
  "roomId": "uuid-v4",  
  "hostToken": "uuid-v4",     // 管理者用：クライアントで保持  
  "participantUrl": "https://example.pages.dev/room/uuid-v4",  
  "expiresAt": 1234567890  
}  
```  
  
-----  
  
#### `POST /api/rooms/:roomId/upload-url` — 署名付きURL発行  
  
**Request Body**  
  
```json  
{  
  "fileName": "IMG_001.jpg",  
  "mimeType": "image/jpeg",  
  "fileSize": 3145728  
}  
```  
  
**Response**  
  
```json  
{  
  "uploadUrl": "https://r2-presigned...",  // 有効期限15分  
  "fileKey": "roomId/images/postId.jpg",  
  "postId": "uuid-v4"  
}  
```  
  
**バリデーション（Workers内）**  
  
- mimeType が許可リストに含まれるか  
- fileSize が制限内か  
- ルームが有効期限内か  
  
-----  
  
#### `GET /api/rooms/:roomId/posts` — 投稿一覧取得  
  
**Query Parameters**  
  
```  
?since=1234567890   // Unix timestamp（差分取得用、省略時は全件）  
?limit=50  
?status=visible     // 参加者は visible のみ取得可  
```  
  
**Response**  
  
```json  
{  
  "posts": [  
    {  
      "id": "uuid",  
      "nickname": "太郎",  
      "fileType": "image",  
      "createdAt": 1234567890,  
      "sortOrder": null  
    }  
  ],  
  "serverTime": 1234567890    // 次回 since に使用  
}  
```  
  
> ⚠️ 一覧には `viewUrl` を含めない。表示時に個別で発行する。  
  
-----  
  
## 5. フロントエンド設計（React / Vite）  
  
### 5.1 ページ構成  
  
```  
/                         -- トップ（ルーム作成 or 参加）  
/room/:roomId             -- 参加者：ニックネーム入力 → メインページ  
/room/:roomId/slideshow   -- スライドショー表示（フルスクリーン）  
/admin/:roomId            -- 管理者ページ（host_token必要）  
```  
  
### 5.2 参加者フロー  
  
```  
QR/URL アクセス  
    ↓  
パスコード入力（設定時）  
    ↓  
ニックネーム入力（localStorage に保存）  
    ↓  
メインページ  
  ├── ファイル選択・アップロード  
  ├── 自分の投稿確認  
  └── スライドショー閲覧ボタン  
```  
  
### 5.3 管理者フロー  
  
```  
/admin/:roomId にアクセス  
    ↓  
host_token 入力（localStorage に保存）  
    ↓  
管理者ダッシュボード  
  ├── ルーム情報・QRコード表示  
  ├── 投稿一覧（非表示・削除操作）  
  ├── スライドショー設定  
  └── スライドショー画面を開く  
```  
  
### 5.4 アップロードキュー設計（フロント）  
  
```  
選択ファイル → キュー（Queue[]）  
                │  
                ├── 画像: 並行3件まで処理  
                ├── 動画: 並行1件まで処理  
                └── 完了次第、次のファイルを処理  
  
各ファイルの状態:  
  pending → signing → uploading → completing → done | error  
  
エラー時: 手動リトライボタンを表示  
```  
  
**アップロード処理フロー**  
  
```  
1. Workers に uploadUrl をリクエスト（バリデーション + 仮レコード作成）  
2. 取得した presigned URL に fetch PUT でR2へ直接アップロード  
3. プログレスバー表示（XHR または fetch + ReadableStream）  
4. 完了後、Workers に POST /posts/:postId/complete で確定登録  
5. 失敗時は POST /posts/:postId/fail を送る  
6. 投稿一覧を即時更新（ポーリング待ち不要）  
```  
  
### 5.5 スライドショー設計  
  
```  
ポーリング間隔: 5秒（設定変更可）  
差分取得: ?since={lastServerTime} で新着のみ取得  
  
表示ロジック:  
  - order_mode = "asc"    → created_at 昇順  
  - order_mode = "desc"   → created_at 降順  
  - order_mode = "manual" → sort_order 昇順  
  
画像:  
  - フルスクリーン表示  
  - 切替時フェードアニメーション  
  - 投稿者ニックネーム・時刻オーバーレイ（設定による）  
  
動画:  
  - 自動再生（muted 必須）  
  - 再生完了 or 最大30秒で次へ  
  - 音声は参加者が手動でアンミュート  
  
viewUrl の取得:  
  - 一覧またはスライドショー開始時に、表示対象分だけ短命URLを一括取得する  
  - 有効期限は5〜10分とし、期限切れ前後で必要分のみ再取得する  
  - 直前個別取得APIも残し、単体表示や再取得に使う  
```  
  
-----  
  
## 6. セキュリティ設計  
  
### 6.1 脅威と対策  
  
|脅威             |対策                         |  
|---------------|---------------------------|  
|不正なルームアクセス     |passcode検証 + URLをQRのみで配布   |  
|管理者なりすまし       |host_token（UUID v4、推測困難）   |  
|悪意のあるファイルアップロード|MIMEタイプ・サイズバリデーション（Workers）|  
|直接R2アクセス       |パブリックURL無効、署名付きURLのみ       |  
|過剰な署名URL発行     |ルームの有効期限チェック・レート制限         |  
|期限切れルームへのアクセス  |`expires_at` をすべてのAPIで検証   |  
  
### 6.2 host_token の扱い  
  
- ルーム作成レスポンスで**一度だけ**返す  
- DBには保存するが、APIで再取得はできない（紛失時は再作成）  
- 管理者はブラウザlocalStorageに保存して使用  
  
-----  
  
## 7. データ保持・削除設計（TTL）  
  
### 7.1 保持期間  
  
- ルーム作成時に `expires_at = now + 30日` を設定  
- 閲覧は `expires_at` 以降は不可（API側で拒否）  
  
### 7.2 削除処理  
  
**方式：Cloudflare Workers Cron Triggers**  
  
```  
スケジュール: 毎日 02:00 UTC  
  
処理内容:  
  1. D1 から expires_at < now の rooms を取得  
  2. 対象ルームの posts に紐づく file_key を取得  
  3. R2 からファイルを削除（r2.delete(fileKey)）  
  4. D1 から posts を削除  
  5. D1 から rooms を削除  
  
バッチサイズ: 100件ずつ処理（D1 / R2 の制限考慮）  
```  
  
### 7.3 管理者による即時削除  
  
- 投稿削除API呼び出し → R2ファイル削除 → D1レコード削除  
- 非表示は `status = "hidden"` に更新のみ（ファイルは保持）  
  
-----  
  
## 8. エラーハンドリング方針  
  
|ケース      |フロント挙動                                 |  
|---------|---------------------------------------|  
|署名URL発行失敗|エラーメッセージ表示、リトライボタン                     |  
|R2 PUT 失敗|ステータスを `error` に変更、リトライ可能              |  
|完了通知失敗  |警告表示（R2には存在、DBはpendingの可能性）＋リトライ            |  
|ポーリング失敗  |サイレントスキップ（次回ポーリングで再試行）                 |  
|ルーム有効期限切れ|「このルームは有効期限が切れています」ページ表示               |  
|ネットワーク断  |アップロードはキュー保持、再接続後に再開（ページリロード耐性はv1では対象外）|  
  
-----  
  
## 9. 環境・デプロイ構成  
  
### 9.1 環境  
  
|環境         |用途       |  
|-----------|---------|  
|production |本番（結婚式当日）|  
|staging（任意）|事前テスト用   |  
  
### 9.2 Wrangler 設定概要（wrangler.toml）  
  
```toml  
name = "wedding-photo-api"  
main = "src/index.ts"  
compatibility_date = "2025-01-01"  
  
[[d1_databases]]  
binding = "DB"  
database_name = "wedding-photo-db"  
database_id = "<id>"  
  
[[r2_buckets]]  
binding = "STORAGE"  
bucket_name = "wedding-photo-bucket"  
  
[triggers]  
crons = ["0 2 * * *"]  # TTL削除バッチ  
```  
  
### 9.3 環境変数（Secrets）  
  
```  
R2_ACCOUNT_ID       -- R2署名URL生成用  
R2_ACCESS_KEY_ID    -- R2アクセスキー  
R2_SECRET_ACCESS_KEY  
SIGNED_URL_EXPIRY_UPLOAD   = 900    # 15分（秒）  
SIGNED_URL_EXPIRY_VIEW     = 3600   # 1時間（秒）  
```  
  
-----  
  
## 10. コスト試算（PoC）  
  
|サービス              |想定使用量                 |費用         |  
|------------------|----------------------|-----------|  
|Cloudflare Pages  |静的ホスティング              |無料         |  
|Cloudflare Workers|~50万リクエスト/月           |無料枠内       |  
|Cloudflare D1     |~500万行read/月          |無料枠内       |  
|Cloudflare R2     |~10GB ストレージ / ~50GB 転送|ほぼ無料（転送無料） |  
|Cron Triggers     |1回/日                  |無料枠内       |  
|**合計**            |                      |**$0〜$1/月**|  
  
  
> 動画が多い場合はR2ストレージが増加するが、30日で自動削除するため蓄積しない  
  
-----  
  
## 11. 未解決事項・次フェーズ検討  
  
|項目             |内容                                                                   |  
|---------------|---------------------------------------------------------------------|  
|HEIC変換         |iPhoneのHEIC画像をブラウザ表示するには変換が必要。v1はwebp/jpeg推奨とし、HEICはアップロード可能だが表示崩れを許容|  
|動画サムネイル        |スライドショーでの一覧表示にサムネイルが欲しい。Workers上でのffmpeg利用は困難なため、v1は動画アイコン表示で代替      |  
|ZIPダウンロード      |複数画像の一括DLはWorkers上でのZIP生成が必要。v1はリンク順次DLまたは省略                         |  
|host_token紛失   |現仕様では再取得不可。ルーム再作成フローを案内するか、メール記録を推奨                                  |  
|WebSocket / SSE|v1はポーリングで対応。参加者増加やリアルタイム要件が高まった場合、Durable Objectsへの移行を検討             |  
|動画容量上限の再調整     |v1は50MB上限。実地テストで問題なければ100MBまで緩和を検討                                                         |  

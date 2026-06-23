# 基本設計書 — 結婚式・イベント写真/動画共有アプリ「Share Photo」

> Cloudflare Pages + Workers（Hono）+ R2 + D1
> 用途：結婚式・イベント単位のルーム作成、参加者投稿、会場スライドショー表示

-----

## 1. システム全体構成

```
参加者・管理者（ブラウザ）
        │
        ├─── HTTPS ──→ Cloudflare Pages（React / Vite SPA）
        │                     │
        │              fetch / REST API（credentials: include）
        │                     ↓
        │             Cloudflare Workers（Hono）── /api, /admin, /internal, /wedding
        │               ├─ D1（SQLite DB）
        │               └─ R2（署名付きURL発行 / プロキシアップロード・ダウンロード）
        │
        └─── 署名付きURL（または /upload-body, /view-file プロキシ）──→ Cloudflare R2（直接 PUT / GET）
```

### 1.1 レイヤー責務

|レイヤー   |サービス                     |責務                   |
|-------|-------------------------|---------------------|
|フロントエンド|Cloudflare Pages（React 18 + Vite 5 + react-router-dom 6）|UI描画・状態管理・ポーリング・アップロードキュー|
|API    |Cloudflare Workers（Hono 4）|ビジネスロジック・D1操作・署名URL発行・認証|
|DB     |Cloudflare D1            |ルーム・投稿・テーマ・スライドショー設定・派生メディアのメタデータ管理|
|ストレージ  |Cloudflare R2            |オリジナル/表示用/サムネイル画像・動画の保存（常にprivate）|
|画像変換   |Cloudflare Image Transformations（`/cdn-cgi/image`）|HEIC等のブラウザ非対応形式をオンザフライでWebPに変換表示|

-----

## 2. データベース設計（D1）

マイグレーションは `worker/migrations/0001`〜`0009` を順に適用した状態。新しいマイグレーションを追加した場合はローカル・本番の両方に適用すること（未適用だとAPIがSQLエラーになる）。

### 2.1 テーブル一覧

```
rooms
posts
slideshow_settings
theme_settings
media_derivatives
```

-----

### 2.2 rooms テーブル

```sql
CREATE TABLE rooms (
  id                 TEXT PRIMARY KEY,        -- UUID v4
  name               TEXT NOT NULL,           -- 表示名（例："田中・山田 結婚式"）
  passcode           TEXT,                    -- 参加パスコード（NULL=制限なし）
  host_token         TEXT NOT NULL UNIQUE,    -- ルーム管理者トークン（UUID v4、平文比較）
  description        TEXT,                    -- 主催者が設定する説明文
  expires_at         INTEGER NOT NULL,        -- レガシー項目。固定値プレースホルダーで運用上は未使用（7章参照）
  created_at         INTEGER NOT NULL,        -- Unix timestamp（秒）
  event_mode         TEXT,                    -- 'draft' | 'event_live' | 'archive' | NULL（NULL=時刻スケジュールで自動判定）
  slideshow_open_at  INTEGER,                  -- スライドショー（披露宴）開始時刻
  slideshow_close_at INTEGER,                  -- スライドショー終了時刻
  gallery_open_at    INTEGER,                  -- アルバム（写真）公開時刻
  video_open_at      INTEGER                   -- 動画公開時刻
);
```

**補足**

- `id` をURLパスに使用（`/room/:roomId`、`/admin/:roomId`）
- `host_token` はルーム単位の管理操作（スライドショー設定・テーマ・公開モード）に使うレガシー認証。サイト管理者セッション（cookie）でも代替可能（4.3節）
- `event_mode` と `slideshow_open_at`/`slideshow_close_at`/`gallery_open_at`/`video_open_at` は Cycle 24 で追加された公開モード制御用（4.5節）

-----

### 2.3 posts テーブル

```sql
CREATE TABLE posts (
  id                 TEXT PRIMARY KEY,        -- UUID v4
  room_id            TEXT NOT NULL,
  nickname           TEXT NOT NULL,           -- 投稿者ニックネーム
  file_key           TEXT NOT NULL,           -- R2オブジェクトキー（オリジナル）
  file_type          TEXT NOT NULL,           -- 'image' | 'video'
  mime_type          TEXT NOT NULL,           -- 'image/jpeg' など
  file_size          INTEGER NOT NULL,        -- bytes
  status             TEXT NOT NULL DEFAULT 'visible',      -- 'visible' | 'hidden'
  sort_order         INTEGER,                 -- NULL=投稿順、設定時は手動順
  upload_status      TEXT NOT NULL DEFAULT 'pending',      -- 'pending' | 'uploaded' | 'failed'
  uploaded_at        INTEGER,                  -- アップロード完了時刻（uploaded_atカーソルに使用）
  created_at         INTEGER NOT NULL,        -- Unix timestamp（秒）
  participant_id     TEXT,                     -- 参加者ID（localStorage由来のUUID、スライドショー投稿数カウント等に使用）
  display_file_key   TEXT,                     -- 表示用WebP（縮小版）のR2キー
  display_mime_type  TEXT,                     -- 表示用ファイルのMIME
  post_purpose       TEXT NOT NULL DEFAULT 'album',         -- 'slideshow' | 'album' | 'video'

  FOREIGN KEY (room_id) REFERENCES rooms(id)
);

CREATE INDEX idx_posts_room_id_status_created
  ON posts(room_id, status, created_at);
```

**補足**

- `file_key` の形式：`{roomId}/images/{postId}.{ext}`（画像）/ `{roomId}/videos/{postId}.{ext}`相当（動画）。拡張子はMIMEから解決（jpg/png/webp/heic/mp4/mov）
- 表示用WebPは `{roomId}/display/{postId}.webp`、サムネイルは `{roomId}/thumbnails/{postId}.{webp|jpg}`
- 一覧・スライドショーで表示対象になるのは `upload_status = 'uploaded'` のレコードのみ（**`completed` ではない**点に注意）
- `post_purpose` の意味は4.5節を参照（投稿可否は `event_mode` によって制御される）
- スライドショー投稿（`post_purpose='slideshow'`）は参加者1人あたり最大10件まで（Worker側でカウントして409を返す）

-----

### 2.4 slideshow_settings テーブル

```sql
CREATE TABLE slideshow_settings (
  room_id          TEXT PRIMARY KEY,
  interval_seconds INTEGER NOT NULL DEFAULT 5,    -- スライド切替間隔（1〜60秒、管理画面で設定）
  show_nickname    INTEGER NOT NULL DEFAULT 1,    -- 投稿者名表示 0/1
  order_mode       TEXT NOT NULL DEFAULT 'asc',   -- 'asc' | 'desc'（Fresh/Archive各プール内のタイブレークに使用）
  updated_at       INTEGER NOT NULL,

  FOREIGN KEY (room_id) REFERENCES rooms(id)
);
```

-----

### 2.5 theme_settings テーブル

```sql
CREATE TABLE theme_settings (
  room_id                       TEXT PRIMARY KEY,
  title                         TEXT,
  message                       TEXT,
  main_visual_key               TEXT,             -- メインビジュアル オリジナルのR2キー
  main_visual_display_key       TEXT,             -- メインビジュアル 表示用（縮小WebP）のR2キー
  main_visual_display_mime_type TEXT,
  background_image_key          TEXT,             -- 背景画像 オリジナルのR2キー
  background_display_image_key  TEXT,             -- 背景画像 表示用（縮小WebP）のR2キー
  background_display_mime_type  TEXT,
  theme_color                   TEXT,             -- 例: '#b8860b'
  animation_mode                TEXT NOT NULL DEFAULT 'none',  -- 'none' | 'fade' | 'float'
  updated_at                    INTEGER NOT NULL,

  FOREIGN KEY (room_id) REFERENCES rooms(id)
);
```

**補足**

- メインビジュアル・背景画像はアップロード時にオリジナルとは別に表示用WebP（最大1920px、quality 0.75〜0.80）を生成して保存し、表示時は表示用を優先して返す
- HEICアップロード時は表示用WebPが無いため、Image Transformations経由で表示する（3.4節）

-----

### 2.6 media_derivatives テーブル

```sql
CREATE TABLE media_derivatives (
  id            TEXT PRIMARY KEY,
  post_id       TEXT NOT NULL REFERENCES posts(id),
  type          TEXT NOT NULL,             -- 'display_image' | 'thumbnail' | 'slideshow_image'
  file_key      TEXT,                      -- NULL可（HEIC等、Image Transformationsのみで配信する場合）
  mime_type     TEXT,
  status        TEXT NOT NULL,             -- 'ready'
  created_at    INTEGER NOT NULL,
  provider      TEXT NOT NULL DEFAULT 'r2',-- 'r2' | 'cloudflare_images'
  external_id   TEXT,
  delivery_url  TEXT,
  error_message TEXT
);

CREATE INDEX idx_media_derivatives_post_id ON media_derivatives(post_id);
```

**補足**

- 投稿1件に対して用途別（表示用 / サムネイル / スライドショー用）の派生メディアを複数登録できる
- `purpose=display|thumbnail|slideshow` を指定した `view-urls` 取得時に、対応する派生が無ければオリジナルや他の派生にフォールバックする

-----

## 3. R2 ストレージ設計

### 3.1 オブジェクトキー構成

```
r2-bucket/
└── {roomId}/
    ├── images/{postId}.{ext}              -- 投稿オリジナル（画像）
    ├── videos/{postId}.{ext}              -- 投稿オリジナル（動画）相当のキー
    ├── display/{postId}.webp              -- 投稿の表示用縮小WebP
    ├── thumbnails/{postId}.{webp|jpg}     -- 動画サムネイル等
    └── theme/
        ├── main_visual/{fileId}.{ext}
        ├── main-visual-display/{fileId}.{ext}
        ├── background/{fileId}.{ext}
        └── background-display/{fileId}.{ext}
```

### 3.2 アクセスポリシー

|操作    |方法                            |
|------|------------------------------|
|アップロード|署名付きPUT URL（`SIGNED_URL_EXPIRY_UPLOAD`、既定900秒=15分）、またはWorker経由プロキシ（`/upload-body`）|
|閲覧    |署名付きGET URL（`SIGNED_URL_EXPIRY_VIEW`、既定3600秒=1時間）、またはWorker経由プロキシ（`/view-file`）|
|削除    |Worker経由のみ（投稿削除・ルーム削除時にR2オブジェクトも削除）|

- R2バケットは常に**private**。フロントは署名付きURLまたはプロキシ経由でのみアクセスする
- 署名付きURL発行には2方式があり、設定に応じて自動切り替え：
  1. **S3 API方式**（本番）：`R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_BUCKET_NAME` が揃っている場合、`aws4fetch` でSigV4署名したPUT/GET URLを発行
  2. **プロキシ方式**（ローカル開発等、R2 S3 APIキー未設定時）：Worker自身が `UPLOAD_BODY_SIGNING_SECRET` で署名したHMACトークンを発行し、`PUT /upload-body` / `GET /view-file` 経由でR2バインディング（`STORAGE.put`/`STORAGE.get`）を中継する
  - 画像かつ10MB以下（`PROXY_UPLOAD_MAX_BYTES`）はプロキシ方式でも許容するが、動画または10MB超は署名付きURL方式が必須（未対応構成の場合503を返す）

### 3.3 ファイル制限

|項目        |画像                                           |動画                        |
|----------|---------------------------------------------|--------------------------|
|許可MIMEタイプ |`image/jpeg`, `image/png`, `image/webp`, `image/heic`|`video/mp4`, `video/quicktime`|
|最大ファイルサイズ |20 MB（`MAX_IMAGE_SIZE`）                       |900 MB（`MAX_VIDEO_SIZE`）  |
|同時アップロード上限|フロントで全体3件まで（`MAX_CONCURRENT`、動画と共有）           |1件まで（`MAX_VIDEO_CONCURRENT`、画像と別枠で常に1スロット確保）|

### 3.4 HEIC表示（Cloudflare Image Transformations）

- HEIC/HEIFはブラウザでネイティブ表示できないため、`IMAGE_TRANSFORMATIONS_ORIGIN`（`/cdn-cgi/image` が有効なオリジン）が設定されている場合のみ、署名付きURL/プロキシURLを元画像として `/cdn-cgi/image/{width},{format},{fit}/...` 形式のURLを組み立てて返す（既定 `width=1600, format=webp, fit=scale-down`）
- 未設定の場合、HEIC画像の表示用URLは返せない（アップロード自体は可能）
- ローカルの `wrangler dev`（localhost）単体では `/cdn-cgi/image` は機能しない（Cloudflareのオレンジクラウド経由が必要）

-----

## 4. API 設計（Workers / Hono）

### 4.1 ルーティング概要

すべて `app.use('*', cors({ credentials: true, ... }))` の下、`/api`・`/admin`（site管理者用とは別に `/api/admin` 配下）・`/internal`・`/wedding` のサブルーターをマウントする構成。CORSは `FRONTEND_URL` 一致 or `*.pages.dev` or `localhost:*` のみ許可。

```
GET    /health                                          -- ヘルスチェック

# rooms
POST   /api/rooms                                       -- ルーム作成
GET    /api/rooms/:roomId                                -- ルーム基本情報取得
GET    /api/rooms/:roomId/bootstrap                       -- room + theme + event_mode 一括取得
GET    /api/rooms/:roomId/slideshow-settings              -- スライドショー設定取得
PUT    /api/rooms/:roomId/slideshow-settings              -- スライドショー設定更新（管理者）
GET    /api/rooms/:roomId/event-mode                      -- 公開モード状態取得
PUT    /api/rooms/:roomId/event-mode                      -- 公開モード設定更新（管理者）

# posts
POST   /api/rooms/:roomId/posts/upload-url                -- 署名付きアップロードURL発行 + 仮レコード作成
PUT    /api/rooms/:roomId/posts/:postId/upload-body        -- プロキシアップロード（オリジナル）
PUT    /api/rooms/:roomId/posts/:postId/upload-display      -- プロキシアップロード（表示用WebP）
POST   /api/rooms/:roomId/posts/:postId/complete            -- アップロード完了通知・派生メディア登録
POST   /api/rooms/:roomId/posts/:postId/fail                -- アップロード失敗通知
GET    /api/rooms/:roomId/posts                             -- 投稿一覧取得（since/limit/offset/cursor/post_purpose対応）
GET    /api/rooms/:roomId/posts/slideshow-count              -- 参加者のスライドショー投稿数取得
POST   /api/rooms/:roomId/posts/view-urls                    -- 表示用署名URLの一括発行（purpose指定可）
GET    /api/rooms/:roomId/posts/admin                         -- 管理者向け投稿一覧（非表示含む）
PATCH  /api/rooms/:roomId/posts/:postId                       -- 投稿の表示/非表示切替（管理者）
DELETE /api/rooms/:roomId/posts/:postId                        -- 投稿削除（管理者、R2オブジェクトも削除）
GET    /api/rooms/:roomId/posts/:postId/view-file               -- プロキシダウンロード

# theme
GET    /api/rooms/:roomId/theme                                -- テーマ設定取得
PUT    /api/rooms/:roomId/theme                                 -- テーマ設定更新（管理者）
POST   /api/rooms/:roomId/theme/upload-url                       -- テーマ画像アップロードURL発行（管理者）
PUT    /api/rooms/:roomId/theme/upload-body/:fileId               -- プロキシアップロード（テーマ画像）
POST   /api/rooms/:roomId/theme/view-urls                          -- テーマ画像の署名URL一括取得
GET    /api/rooms/:roomId/theme/view-file/:imageType                 -- プロキシダウンロード（テーマ画像）

# site admin
POST   /api/admin/login                                  -- サイト管理者ログイン（パスワード）
POST   /api/admin/logout                                  -- ログアウト
GET    /api/admin/me                                      -- セッション確認
GET    /api/admin/entry-check                              -- entryトークンcookie確認
GET    /api/admin/rooms                                    -- ルーム一覧（投稿数付き）
POST   /api/admin/rooms                                     -- ルーム作成（管理者経由）
DELETE /api/admin/rooms/:roomId                              -- ルーム削除（投稿・R2オブジェクトも削除）

# 管理入口・固定公開URL（QR運用）
GET    /internal/:token                                   -- entryトークン検証 → admin_entry cookie発行 → /admin/login へリダイレクト
GET    /wedding/:token                                     -- 検証 → /room/:PUBLIC_WEDDING_ROOM_ID へリダイレクト
GET    /wedding/live/:token                                  -- 検証 → /room/:PUBLIC_WEDDING_ROOM_ID/slideshow へリダイレクト
```

`/wedding/*` と `/internal/*` はWorker側で完結するサーバーサイドリダイレクトであり、フロントエンドのSPAルートではない（フロント側にはこれらに対応するReact Routeは存在しない）。詳細は `docs/wedding-url-setup.md` を参照。

### 4.2 認証方式まとめ

|機構                  |対象                              |方式                                                |
|--------------------|---------------------------------|---------------------------------------------------|
|`X-Host-Token`       |ルーム単位の管理操作（スライドショー設定・公開モード・テーマ・投稿管理）|`rooms.host_token` との平文一致比較|
|`admin_session` cookie|サイト管理者の全操作（上記すべて + ルーム作成/削除）|HMAC-SHA256署名（secret: `ADMIN_SESSION_SECRET`）、タイミング安全比較。既定有効期限24時間|
|`admin_entry` cookie  |管理者ログイン画面（`/admin/login`）への到達制御|HMAC-SHA256署名（secret: `ADMIN_ENTRY_SESSION_SECRET`）。既定有効期限30分|
|`ADMIN_ENTRY_TOKEN_HASH`|`/internal/:token` の一回限り入口リンク|トークンのSHA-256ハッシュと比較、検証成功時に`admin_entry` cookieを発行|
|アップロード/ダウンロードプロキシトークン|`/upload-body`, `/upload-display`, `/view-file` 等|HMAC署名トークン（secret: `UPLOAD_BODY_SIGNING_SECRET`）。postId/roomId/fileKey/mimeType/expをペイロードに含み、ファイル単位・期限付きで有効|
|`PUBLIC_WEDDING_ENTRY_TOKEN_HASH` / `PUBLIC_WEDDING_LIVE_TOKEN_HASH`|`/wedding/:token`, `/wedding/live/:token`|トークンのSHA-256ハッシュと比較|
|参加者ID（`participant_id`）|スライドショー投稿数カウント・連続表示防止|認証ではなくlocalStorage由来のUUID（`getOrCreateParticipantId`）|

`X-Host-Token` と `admin_session` cookie はOR条件（`authorizeRoomManage()`）で、どちらか一方が有効であればルーム管理操作を許可する。

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
  "hostToken": "uuid-v4",
  "participantUrl": "https://example.pages.dev/room/uuid-v4"
}
```

-----

#### `POST /api/rooms/:roomId/posts/upload-url` — 署名付きURL発行

**Request Body**

```json
{
  "nickname": "太郎",
  "fileName": "IMG_001.jpg",
  "mimeType": "image/jpeg",
  "fileSize": 3145728,
  "uploadType": "original",     // "original" | "display" | "thumbnail"
  "postId": "uuid-v4",           // display/thumbnail追加アップロード時に指定
  "postPurpose": "slideshow",    // "slideshow" | "album" | "video"
  "participantId": "uuid-v4"     // postPurpose=slideshow の場合必須
}
```

**Response**

```json
{
  "uploadUrl": "https://r2-presigned...",
  "fileKey": "roomId/images/postId.jpg",
  "postId": "uuid-v4"
}
```

**バリデーション（Workers内）**

- mimeTypeが許可リスト（`ALLOWED_IMAGE_MIMES` / `ALLOWED_VIDEO_MIMES`）に含まれるか
- fileSizeが上限内か（画像20MB / 動画900MB）
- `event_mode` に応じて `post_purpose` のアップロードが許可されているか（4.5節）
- スライドショー投稿は参加者あたり10件までか

-----

#### `GET /api/rooms/:roomId/posts` — 投稿一覧取得

**Query Parameters**

```
?since=1234567890       // Unix timestamp（差分取得用、省略時は全件）
?limit=50&offset=0
?post_purpose=album      // "slideshow" | "album" | "video"
?cursor=uploaded_at       // "created_at"（既定） | "uploaded_at"
```

**Response**

```json
{
  "posts": [
    {
      "id": "uuid",
      "nickname": "太郎",
      "file_type": "image",
      "file_key": "...",
      "mime_type": "image/jpeg",
      "file_size": 3145728,
      "created_at": 1234567890,
      "sort_order": null,
      "participant_id": "uuid",
      "display_file_key": "...",
      "post_purpose": "slideshow"
    }
  ],
  "serverTime": 1234567890
}
```

返却対象は `upload_status='uploaded'` かつ `status='visible'` の投稿のみ。一覧には署名URLを含めない（表示時に `view-urls` で個別取得）。スライドショーのポーリングは新着取り逃しを避けるため `cursor=uploaded_at` を使用する。

-----

### 4.4 アップロード用署名URL / プロキシの使い分け

```
fileSize > 10MB あるいは動画
  → 署名付きPUT URL（S3 API方式）必須。未対応構成（R2_ACCOUNT_ID等未設定）なら503

fileSize <= 10MB の画像
  → S3 API方式が使えればそちらを優先、無ければ /upload-body プロキシ方式にフォールバック
```

-----

### 4.5 公開モード（event_mode）制御

ルームの状態は3種類。`resolveEventMode(room, now)` で解決する。

|状態        |意味                  |許可される投稿(`post_purpose`)|
|----------|---------------------|----------------------|
|`draft`    |準備中（披露宴前）           |なし（アップロード不可）          |
|`event_live`|披露宴中                |`slideshow` のみ        |
|`archive`  |終了後                  |`album`, `video` のみ   |

解決ロジック（優先順）：

1. `rooms.event_mode` が `draft`/`event_live`/`archive` のいずれかで明示設定されていれば、それを採用（手動オーバーライド最優先）
2. 未設定（`NULL`）の場合は時刻スケジュールで自動判定：
   - `now < slideshow_open_at` → `draft`
   - `now >= min(slideshow_close_at, gallery_open_at, video_open_at)`（設定されている最も早い時刻） → `archive`
   - `now >= slideshow_open_at` → `event_live`
3. スケジュール未設定の既存ルームは後方互換のため既定 `event_live` として扱う

許可されないアップロードはWorker側で拒否される（フロントのUI制御だけでなく、サーバー側でも強制）。管理画面の「公開モード」セクションで手動切替・スケジュール設定の両方が可能。

-----

## 5. フロントエンド設計（React / Vite）

### 5.1 ページ構成（react-router-dom 6）

```
/                          -- トップ（HomePage、サービス説明・CTA）
/room/:roomId              -- 参加者メイン（パスコード/ニックネーム入力 → 投稿UI、event_modeで表示切替）
/room/:roomId/slideshow    -- スライドショー表示（フルスクリーン、Fresh/Archiveプール）
/room/:roomId/gallery      -- 統合アルバム（写真+動画、フィルタ・選択・一括ダウンロード）
/room/:roomId/photos       -- 写真のみ一覧（ページネーション、プレビュー）
/room/:roomId/videos       -- 動画のみ一覧（サムネイル、モーダル再生）
/admin/:roomId             -- ルーム管理画面（host_tokenまたはサイト管理者セッションで利用可）
/admin/login               -- サイト管理者ログイン（entry-check → ログインフォーム or 管理者トップ）
```

`/wedding/:token`・`/wedding/live/:token`・`/internal/:token` はWorker側のサーバーサイドリダイレクトのみで、対応するSPAルートはフロントに存在しない（4.1節）。

### 5.2 参加者フロー

```
ルームURLアクセス（または /wedding/:token 経由）
    ↓
パスコード入力（設定時のみ）
    ↓
ニックネーム入力（localStorageに保存）
    ↓
参加者ページ（event_modeに応じて表示切替）
  ├── draft        : 「準備中」表示、投稿不可
  ├── event_live   : スライドショー投稿のみ可（最大10件/人）
  └── archive      : 写真（album）・動画投稿可、ギャラリー閲覧リンク表示
```

### 5.3 管理者フロー

```
/internal/:token（任意） → admin_entry cookie発行 → /admin/login
    ↓
パスワード入力 → admin_session cookie発行
    ↓
管理者トップ（ルーム一覧・作成・削除）
    ↓
/admin/:roomId
  ├── 参加者URL表示・QRコード用情報
  ├── 投稿一覧（表示/非表示切替・削除）
  ├── スライドショー設定（間隔・ニックネーム表示・順序）
  ├── 公開モード設定（手動切替 + スケジュール）
  └── テーマ設定（タイトル・メッセージ・メインビジュアル・背景・カラー・アニメーション）
```

### 5.4 アップロードキュー設計（`useUploadQueue`フック）

```
選択ファイル → キュー（QueueItem[]）
                │
                ├── 全体で同時3件まで（MAX_CONCURRENT）
                └── 動画は同時1件まで（MAX_VIDEO_CONCURRENT、画像枠とは別に確保）

各ファイルの状態:
  pending → uploading → completing → done | error

1件のアップロード処理:
  1. POST /upload-url でアップロードURL取得 + 仮レコード作成
  2. 取得したURLへ直接（または /upload-body 経由で）PUT、進捗をXHRで追跡
  3. （HEIC以外の画像）canvasで表示用WebPを生成（最大2048px, quality 0.85）して追加アップロード
  4. （動画）動画フレームからサムネイルWebPを生成（最大480px, quality 0.8, タイムアウト15秒）して追加アップロード
  5. POST /complete で確定登録（displayFileKey/thumbnailFileKey等を通知）
  6. 失敗時は POST /fail を送信。手動リトライ（最大3回）またはキャンセル可
```

### 5.5 スライドショー設計（Fresh Pool / Archive Pool）

```
ポーリング: usePostsPolling(roomId, 'slideshow', { cursor: 'uploaded_at' })
  - 5秒間隔から開始し、新着が無ければ10秒→15秒→30秒に後退（タブ非表示時は60秒固定）
  - 新着があれば5秒間隔にリセット

候補プール分割（frontend/src/utils/slideshowPool.ts）:
  - Fresh Pool : created_at が直近30分以内（FRESH_WINDOW_SEC = 1800）
  - Archive Pool: それより古い投稿
  - 抽選比率   : Fresh 70% / Archive 30%（FRESH_RATIO = 0.7）

重複防止（4段階タイヤで段階的に緩和、Fresh/Archive両プールを各段で確認してから次段に緩和）:
  1. 直近8件（COOLDOWN_DISPLAYED_LIMIT）かつ直近3人の投稿者（RECENT_PARTICIPANT_LIMIT）を除外
  2. 直近8件のみ除外
  3. 直前に表示した1件のみ除外
  4. 制限なし（候補が極端に少ない場合のフォールバック）
  各段で上位3件（RANDOM_TOP_K）からランダム選択し、軽くランダム性を持たせる

新規投稿の優先表示（boost）:
  - ポーリングで新着スライドショー画像を検知すると、再生キューを現在地点で切り詰めて
    新着投稿を優先候補として次の表示に織り込む

表示:
  - フルスクリーン、クロスフェード（600ms）
  - 次の2件を先読み（タイムアウト2500ms）
  - ニックネームオーバーレイ（show_nickname設定時）
  - キーボード（←→・Space）、スワイプ、一時停止/再生、フルスクリーン切替に対応
  - 操作後3秒で操作UIを自動的に隠す

order_mode（asc/desc）は各プール内のタイブレークソートとして残置（管理画面で設定可能）。

viewUrlの取得:
  - POST /posts/view-urls（purpose=slideshow）で表示対象分の短命URLを一括取得・キャッシュ
  - 期限切れ前後（60秒間隔、期限120秒前）で再取得
```

状態（再生キュー・表示履歴・boostキュー）はすべてブラウザメモリ内（refベース）のみで保持し、DBに永続化しない。

-----

## 6. セキュリティ設計

### 6.1 脅威と対策

|脅威             |対策                         |
|---------------|---------------------------|
|不正なルームアクセス     |passcode検証 + URLをQRのみで配布   |
|ルーム管理者なりすまし    |host_token（UUID v4）または admin_session cookie（HMAC署名）|
|サイト管理者なりすまし    |パスワードハッシュ照合 + HMAC署名cookie + entryトークンによる二段ゲート|
|悪意のあるファイルアップロード|MIMEタイプ・サイズバリデーション（Workers側で強制、20MB/900MB）|
|直接R2アクセス       |バケットは常にprivate、署名付きURLまたは署名トークン付きプロキシのみ|
|公開モード違反のアップロード |`event_mode` に応じてWorker側でも `post_purpose` を強制（フロントのUI制御だけに依存しない）|
|期限切れ管理者セッション/entryトークン|cookieにMax-Age（既定24h / 30min）を設定し、期限切れ後は再認証を要求|

### 6.2 host_token の扱い

- ルーム作成レスポンスで返す。DBには平文相当で保持し、平文比較で検証する
- 管理者はブラウザlocalStorageに保存して使用する想定（再取得APIは無し）
- サイト管理者セッション（cookie）でも同等の操作が可能なため、host_token紛失時はサイト管理者ログインで代替できる

-----

## 7. データ保持・削除設計

- `rooms.expires_at` カラムは存在するが、**自動削除のCron Trigger等は実装されていない**（`wrangler.toml` に `[triggers]` の定義なし、Worker側にscheduledハンドラなし）。値は固定の遠未来プレースホルダーとして設定され、運用上の期限管理には使用していない
- ルーム・投稿の削除は管理者操作（`DELETE /api/rooms/:roomId`相当、または `DELETE /api/admin/rooms/:roomId`）による即時削除のみ：
  - 投稿削除 → R2オブジェクト（オリジナル・表示用・サムネイル等）削除 → D1の `posts`/`media_derivatives` レコード削除
  - ルーム削除 → 配下の全投稿について上記を実施 → `theme_settings`/`slideshow_settings`/`rooms` レコード削除
- 投稿の非表示化は `status='hidden'` への更新のみ（ファイルは保持され、復元可能）
- 自動TTL削除を導入する場合は別途Cron Triggerの実装が必要（未実装の既知ギャップ）

-----

## 8. エラーハンドリング方針

|ケース      |フロント挙動                                 |
|---------|---------------------------------------|
|署名URL発行失敗|エラーメッセージ表示、リトライボタン（最大3回）             |
|R2 PUT 失敗|ステータスを `error` に変更、手動リトライ可能              |
|完了通知失敗  |`fail` 通知を送信し再試行を促す（R2には存在、DBはpendingの可能性）|
|ポーリング失敗  |エラーメッセージ表示しつつ次回ポーリングで自動再試行           |
|公開モード違反のアップロード試行|サーバーが拒否（4xx）。フロントは該当カードを操作不可表示にして事前に防止|
|表示用/サムネイル生成失敗|非致命的として扱い、オリジナルアップロードの完了は継続する|

-----

## 9. 環境・デプロイ構成

### 9.1 デプロイ先

|サービス|内容|
|---|---|
|Cloudflare Pages|フロントエンド（`frontend/dist` を配信、`VITE_API_BASE` をビルド時環境変数に設定）|
|Cloudflare Workers|API（`cd worker && npm run deploy`）|

### 9.2 wrangler.toml 概要

```toml
name = "share-photo-api"
main = "src/index.ts"
compatibility_date = "2025-01-01"

[[d1_databases]]
binding = "DB"
database_name = "share-photo-db"
database_id = "<id>"

[[r2_buckets]]
binding = "STORAGE"
bucket_name = "share-photo-bucket"

[vars]
SIGNED_URL_EXPIRY_UPLOAD = "900"
SIGNED_URL_EXPIRY_VIEW = "3600"
FRONTEND_URL = "https://share-photo.bysontech.jp"
UPLOAD_BODY_SIGNING_SECRET = "..."          # ローカル既定値。本番はSecretで上書き推奨
R2_BUCKET_NAME = "share-photo-bucket"
IMAGE_TRANSFORMATIONS_ORIGIN = "https://share-photo-api.bysontech.jp"
PUBLIC_WEDDING_ROOM_ID = "..."               # /wedding/* の対象ルーム

[dev]
port = 8787
```

Cron Trigger（`[triggers]`）は定義されていない（7章参照）。

### 9.3 環境変数 / Secret 一覧

|変数|用途|設定方法|
|---|---|---|
|`FRONTEND_URL`|CORS許可・リダイレクト先|`[vars]`|
|`SIGNED_URL_EXPIRY_UPLOAD` / `SIGNED_URL_EXPIRY_VIEW`|R2署名URLの有効期限（秒）|`[vars]`|
|`UPLOAD_BODY_SIGNING_SECRET`|プロキシアップロード/閲覧トークンのHMAC secret|`[vars]`（本番はSecret推奨）|
|`R2_BUCKET_NAME`|S3 API署名対象バケット名|`[vars]`|
|`IMAGE_TRANSFORMATIONS_ORIGIN`|HEIC表示に使う `/cdn-cgi/image` 有効オリジン|`[vars]`|
|`PUBLIC_WEDDING_ROOM_ID`|`/wedding/*` 固定公開URLの対象ルームID|`[vars]`|
|`R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY`|R2 S3 API署名（presigned URL生成用）|Secret|
|`ADMIN_PASSWORD_HASH`|サイト管理者ログイン（SHA-256ハッシュ）|Secret|
|`ADMIN_SESSION_SECRET` / `ADMIN_SESSION_MAX_AGE`|管理者セッションcookieのHMAC secret・有効期限（既定86400秒）|Secret|
|`ADMIN_ENTRY_TOKEN_HASH`|`/internal/:token` 入口トークンのハッシュ|Secret|
|`ADMIN_ENTRY_SESSION_SECRET` / `ADMIN_ENTRY_SESSION_MAX_AGE`|entry cookieのHMAC secret・有効期限（既定1800秒）|Secret|
|`PUBLIC_WEDDING_ENTRY_TOKEN_HASH` / `PUBLIC_WEDDING_LIVE_TOKEN_HASH`|`/wedding/*` 固定公開URLのトークンハッシュ|Secret|

詳細・発行手順は `docs/wedding-url-setup.md` を参照。

-----

## 10. 未解決事項・次フェーズ検討

|項目             |内容                                                                   |
|---------------|---------------------------------------------------------------------|
|自動TTL削除        |`rooms.expires_at` は存在するがCron Triggerが未実装。長期運用する場合は削除バッチの実装が必要        |
|host_token紛失   |再取得APIは無し。サイト管理者ログインでの代替操作、またはルーム再作成フローの案内が必要                       |
|ZIPダウンロード      |複数ファイルの一括DLは現在「個別ダウンロードの連続実行」で対応（フロントで逐次fetch+blob保存）。ZIP生成は未実装       |
|WebSocket / SSE|現状はポーリング（5〜30秒の適応バックオフ）で対応。参加者増加やリアルタイム要件が高まった場合はDurable Objects等への移行を検討|
|レート制限          |Worker側に明示的なレート制限は無い（必要であればWAF等で対応）                                    |

-----

## 11. 関連ドキュメント

- [docs/system-overview-frontend-worker.md](system-overview-frontend-worker.md) — フロント/Workerの実装全体像（ルーティング、API、認可、ハマりどころの詳細）
- [docs/wedding-url-setup.md](wedding-url-setup.md) — 固定公開URL（QR運用）のトークン設定手順
- [playbook/cycle-plan/](../playbook/cycle-plan) — 開発サイクルごとのテーマ・スコープ
- [playbook/implementation-tasks/](../playbook/implementation-tasks) — 開発サイクルごとの実装タスク詳細

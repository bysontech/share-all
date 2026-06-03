# Share Photo Frontend / Worker System Overview

このドキュメントは、別のAIや開発者が **Share Photo** のフロントエンドと Cloudflare Worker の全体像を短時間で把握するための引き継ぎ資料です。実装の正本は各ソースファイルです。

## 1. システムの概要

Share Photo は、結婚式・イベント向けの写真/動画共有アプリです。

- 参加者はルームURLから入室し、ニックネームを登録して投稿する。
- 投稿は用途別に `slideshow` / `album` / `video` に分かれる。
- 管理者はサイト管理画面からルーム作成・削除・各ルーム管理を行う。
- 画像・動画の実体は Cloudflare R2 に保存する。
- メタデータは Cloudflare D1 に保存する。
- HEIC 表示は Cloudflare Images Storage ではなく、Cloudflare Image Transformations (`/cdn-cgi/image/...`) を使う。

主要コンポーネント:

- `frontend/`: React + Vite の SPA。
- `worker/`: Hono ベースの Cloudflare Worker API。
- `worker/migrations/`: D1 スキーマ変更。
- `docs/`: 補足設計ドキュメント。
- `playbook/`: Cycle ごとの計画・実装タスク。

## 2. 実行・ビルド

### Frontend

場所: `frontend/`

```bash
npm run dev
npm run build
npm run typecheck
```

`frontend/vite.config.ts` の `server.proxy` は開発時だけ有効です。本番で API が別ホストの場合は、ビルド環境変数 `VITE_API_BASE` に API のオリジンを設定します。

例:

```bash
VITE_API_BASE=https://share-photo-api.bysontech.jp
```

`frontend/src/api/client.ts` は `VITE_API_BASE` があれば `${VITE_API_BASE}/api` を使い、未設定なら同一オリジンの `/api` を使います。

### Worker

場所: `worker/`

```bash
npm run dev
npm run typecheck
npm run build
npm run deploy
```

`npm run build` は `typecheck` と `wrangler deploy --dry-run` です。

D1 の重要なマイグレーション:

```bash
npm run migrate:local
npm run migrate:local:0006
npm run migrate:remote:0006
```

`0006_post_purpose.sql` は `posts.post_purpose` を追加します。これが本番 D1 に未適用だと、投稿時に `no such column: post_purpose` が出ます。

## 3. Cloudflare リソース

`worker/wrangler.toml` の主な binding / vars:

- Worker 名: `share-photo-api`
- D1 binding: `DB`
- D1 database: `share-photo-db`
- R2 binding: `STORAGE`
- R2 bucket: `share-photo-bucket`
- `FRONTEND_URL`: フロントの公開オリジン。
- `SIGNED_URL_EXPIRY_UPLOAD`: アップロードURL期限。
- `SIGNED_URL_EXPIRY_VIEW`: 表示/ダウンロードURL期限。
- `UPLOAD_BODY_SIGNING_SECRET`: Worker 経由アップロード/閲覧トークン用 HMAC secret。
- `IMAGE_TRANSFORMATIONS_ORIGIN`: `/cdn-cgi/image` が効く Worker 公開オリジン。HEIC 表示で使う。
- `PUBLIC_WEDDING_ROOM_ID`: `/wedding/*` の固定公開URLが向くルームID。

本番では以下のような値は Cloudflare Secret で管理する想定です。

- `ADMIN_PASSWORD_HASH`
- `ADMIN_SESSION_SECRET`
- `ADMIN_ENTRY_TOKEN_HASH`
- `ADMIN_ENTRY_SESSION_SECRET`
- `PUBLIC_WEDDING_ENTRY_TOKEN_HASH`
- `PUBLIC_WEDDING_LIVE_TOKEN_HASH`
- R2 API credentials を使う構成の場合は `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY`

## 4. フロントエンド構成

### 4.1 ルーティング

入口: `frontend/src/main.tsx`

| Path | Component | 役割 |
| --- | --- | --- |
| `/` | `HomePage` | サイト管理トップ。管理者ログイン状態ならルーム一覧/作成/削除を表示。 |
| `/admin/login` | `AdminLoginPage` | 内部入口トークン経由の管理者ログインページ。 |
| `/room/:roomId` | `RoomPage` | 参加者画面。ニックネーム入力、投稿、テーマ表示。 |
| `/room/:roomId/slideshow` | `SlideshowPage` | 会場表示用のスライドショー。 |
| `/room/:roomId/gallery` | `GalleryPage` | 旧/汎用ギャラリー画面。 |
| `/room/:roomId/photos` | `PhotosPage` | アルバム用写真一覧。 |
| `/room/:roomId/videos` | `VideosPage` | 動画一覧。 |
| `/admin/:roomId` | `AdminPage` | ルーム単位の管理画面。投稿の表示/非表示/削除、スライドショー設定、テーマ設定。 |

### 4.2 API クライアント

中心ファイル: `frontend/src/api/client.ts`

重要ポイント:

- `VITE_API_BASE` あり: `https://api.example.com/api/...`
- `VITE_API_BASE` なし: `/api/...`
- `request` は `credentials: 'include'` を付ける。サイト管理者 Cookie を通常 API にも送るため。
- `resolvePublicMediaUrl` は API が返す相対URL `/api/...` を、必要に応じて API オリジン付きの絶対URLへ変換する。
- R2 の署名付き絶対URLや Transformations URL はそのまま使う。

主な API ラッパー:

- `api.getRoom`
- `api.getSlideshowSettings` / `api.updateSlideshowSettings`
- `api.getUploadUrl`
- `api.completeUpload` / `api.failUpload`
- `api.getPosts`
- `api.getSlideshowCount`
- `api.getViewUrls`
- `api.getTheme` / `api.updateTheme`
- `api.getThemeUploadUrl` / `api.getThemeViewUrls`
- `api.getAdminPosts` / `api.updatePostStatus` / `api.deletePost`
- `adminApi.login` / `adminApi.logout` / `adminApi.me`
- `adminApi.getRooms` / `adminApi.createRoom` / `adminApi.deleteRoom`
- `adminApi.entryCheck`
- `putToR2`

### 4.3 参加者画面 `RoomPage`

`frontend/src/pages/RoomPage.tsx`

役割:

- ルーム情報とテーマを取得する。
- ルームにパスコードがある場合は簡易パスコード入力を出す。
- ニックネームを `localStorage` に保存する。
- `participantId` は `utils/participantId.ts` でルームごとに生成/保存する。
- 3種類の投稿カードを表示する。
  - スライドショー用写真: `postPurpose = 'slideshow'`
  - 共有アルバム用写真: `postPurpose = 'album'`
  - 動画: `postPurpose = 'video'`
- スライドショー用写真は参加者ごとに最大10枚。`api.getSlideshowCount` で件数を取得する。

アップロード UI は `UploadCard`、実処理は `useUploadQueue` に委譲しています。

### 4.4 アップロード処理 `useUploadQueue`

`frontend/src/hooks/useUploadQueue.ts`

流れ:

1. `api.getUploadUrl` で Worker からアップロードURLを取得する。
2. `putToR2` で original を R2 または Worker proxy に PUT する。
3. 非HEIC画像はクライアントで WebP display を生成し、`uploadType='display'` で追加アップロードする。
4. 動画は video element + canvas で thumbnail WebP を生成し、`uploadType='thumbnail'` で追加アップロードする。
5. `api.completeUpload` で投稿を `uploaded` にする。display/thumbnail の `fileKey` も渡す。
6. 失敗時は `api.failUpload` を呼ぶ。

制御:

- 最大同時アップロード `MAX_CONCURRENT = 3`
- 動画は `MAX_VIDEO_CONCURRENT = 1`
- リトライ上限 `MAX_RETRIES = 3`
- HEIC / HEIF はクライアント WebP 生成をしない。表示は Worker 側の Transformations URL で処理する。

### 4.5 表示画面

- `SlideshowPage`: `postPurpose='slideshow'` の画像をスライドショー表示。`getViewUrls(..., purpose='slideshow')` を使う。
- `PhotosPage`: `postPurpose='album'` の画像一覧。表示 URL を使ってプレビュー/保存する。
- `VideosPage`: `postPurpose='video'` の動画一覧。thumbnail があれば表示する。
- `GalleryPage`: 旧/汎用の一覧画面。`post_purpose !== 'slideshow'` を表示対象にする意図。

`ViewUrlsResponse.expiresAt` はルーム期限ではなく、表示/ダウンロードURLの有効期限です。

### 4.6 管理画面

- `HomePage`: サイト管理トップ。`adminApi.me` でログイン確認し、ルーム一覧を表示する。
- `AdminLoginPage`: `/internal/:token` から発行される `admin_entry` Cookie がある場合のみ使う管理ログイン画面。
- `AdminPage`: ルーム単位管理。サイト管理者の `admin_session` Cookie で API が通る。旧 `hostToken` も API は受け付けるが、画面上のトークン入力は撤去済み。

## 5. Worker 構成

入口: `worker/src/index.ts`

Hono app に以下を mount しています。

| Mount | File | 役割 |
| --- | --- | --- |
| `/api/rooms` | `routes/rooms.ts` | ルーム作成/取得/スライドショー設定 |
| `/api/rooms/:roomId/posts` | `routes/posts.ts` | 投稿アップロード/一覧/表示URL/管理操作 |
| `/api/rooms/:roomId/theme` | `routes/theme.ts` | 参加者画面テーマ設定/画像 |
| `/api/admin` | `routes/admin.ts` | サイト管理者ログイン、ルーム一覧/作成/削除 |
| `/internal` | `routes/internal.ts` | 管理画面入口トークン |
| `/wedding` | `routes/wedding.ts` | 固定公開URLから特定ルームへリダイレクト |
| `/health` | `index.ts` | ヘルスチェック |

CORS:

- `FRONTEND_URL`
- `*.pages.dev`
- `http://localhost:*`

を許可し、`credentials: true` です。

## 6. Worker 主要 API

### 6.1 Rooms API

`worker/src/routes/rooms.ts`

- `POST /api/rooms`
  - ルーム作成。
  - `rooms` と `slideshow_settings` を作る。
  - `expires_at` はレガシー NOT NULL 列のためプレースホルダー値を保存するが、アクセス制御には使わない。
- `GET /api/rooms/:roomId`
  - ルーム情報を返す。
- `GET /api/rooms/:roomId/slideshow-settings`
  - スライドショー設定取得。
- `PUT /api/rooms/:roomId/slideshow-settings`
  - スライドショー設定更新。
  - `authorizeRoomManage` で `X-Host-Token` または admin session Cookie を許可する。

### 6.2 Posts API

`worker/src/routes/posts.ts`

#### アップロードURL発行

`POST /api/rooms/:roomId/posts/upload-url`

用途:

- original 投稿: `uploadType` なし。
- display WebP: `uploadType='display'`。
- thumbnail: `uploadType='thumbnail'`。

original 投稿時の `postPurpose`:

- 動画は常に `video`。
- 画像は `slideshow` 指定なら `slideshow`、それ以外は `album`。
- `slideshow` は `participantId` 必須で、参加者ごとに最大10枚。

アップロード先:

- R2 presigned PUT が使える場合: R2 署名付きURL。
- ローカル/Miniflare 等で presigned が使えない場合: Worker proxy URL (`upload-body`, `upload-display`)。

#### アップロード本体

- `PUT /api/rooms/:roomId/posts/:postId/upload-body`
- `PUT /api/rooms/:roomId/posts/:postId/upload-display`

HMAC token を検証し、R2 に保存する。

#### 完了/失敗

- `POST /api/rooms/:roomId/posts/:postId/complete`
  - `posts.upload_status = 'uploaded'` にする。
  - `displayFileKey` があれば `media_derivatives(type='display_image')` を作る。
  - `thumbnailFileKey` があれば `media_derivatives(type='thumbnail')` を作る。
  - HEIC で display が無い場合は `provider='cloudflare_images'` の `display_image` マーカーを作る。
  - slideshow 画像は `slideshow_image` derivative を作り、Transformations 表示に使う。
- `POST /api/rooms/:roomId/posts/:postId/fail`
  - `upload_status = 'failed'` にする。

#### 一覧

`GET /api/rooms/:roomId/posts`

- `upload_status='uploaded'` かつ `status='visible'` の投稿を返す。
- `post_purpose` query で `slideshow` / `album` / `video` を絞り込み可能。
- `since` query で差分取得可能。

`GET /api/rooms/:roomId/posts/slideshow-count?participantId=...`

- 参加者ごとの `slideshow` 投稿数を返す。

#### 表示URL一括発行

`POST /api/rooms/:roomId/posts/view-urls`

body:

```json
{
  "postIds": ["..."],
  "purpose": "display"
}
```

`purpose`:

- `display`: 画像表示用。display derivative、HEIC Transformations、通常画像 original fallback。
- `slideshow`: slideshow 用。`slideshow_image` derivative を使う。
- `thumbnail`: 動画 thumbnail / 画像 display fallback。
- 未指定: ダウンロード用途。original を返す。

重要:

- ダウンロードは original を返す。
- 動画の表示用には original 動画URLを返さない。
- HEIC の `<img>` 表示は raw HEIC を直接渡さず、Transformations URL を返せる場合のみ返す。

#### 管理 API

- `GET /api/rooms/:roomId/posts/admin`
- `PATCH /api/rooms/:roomId/posts/:postId`
- `DELETE /api/rooms/:roomId/posts/:postId`

`authorizeRoomManage` で `X-Host-Token` または admin session Cookie を許可する。

### 6.3 Theme API

`worker/src/routes/theme.ts`

- `GET /api/rooms/:roomId/theme`
- `PUT /api/rooms/:roomId/theme`
- `POST /api/rooms/:roomId/theme/upload-url`
- `PUT /api/rooms/:roomId/theme/upload-body/:fileId`
- `POST /api/rooms/:roomId/theme/view-urls`
- `GET /api/rooms/:roomId/theme/view-file/:imageType`

テーマ項目:

- `title`
- `message`
- `mainVisualKey`
- `backgroundImageKey`
- `themeColor`
- `animationMode`: `none` / `fade` / `float`

### 6.4 Admin API

`worker/src/routes/admin.ts`

- `POST /api/admin/login`
  - 入力パスワードの SHA-256 hex と `ADMIN_PASSWORD_HASH` を比較。
  - 成功時に `admin_session` Cookie を発行。
- `POST /api/admin/logout`
- `GET /api/admin/me`
- `GET /api/admin/entry-check`
  - `admin_entry` Cookie の有効性確認。失敗時は 404。
- `GET /api/admin/rooms`
  - ルーム一覧。投稿数、画像数、動画数を集計。
  - `upload_status='uploaded'` のみ集計対象。
- `POST /api/admin/rooms`
- `DELETE /api/admin/rooms/:roomId`
  - R2 object と D1 record を削除する。

### 6.5 Internal / Wedding routes

`routes/internal.ts`

- `GET /internal/:token`
  - token の SHA-256 hex と `ADMIN_ENTRY_TOKEN_HASH` を比較。
  - 成功時に `admin_entry` Cookie を発行し、`FRONTEND_URL/admin/login` へリダイレクト。
  - 失敗は 404。

`routes/wedding.ts`

- `GET /wedding/:token`
  - `PUBLIC_WEDDING_ENTRY_TOKEN_HASH` が合えば `PUBLIC_WEDDING_ROOM_ID` の参加者画面へリダイレクト。
- `GET /wedding/live/:token`
  - `PUBLIC_WEDDING_LIVE_TOKEN_HASH` が合えば同ルームのスライドショーへリダイレクト。
- 失敗は 404。

## 7. 認証・権限

### 7.1 サイト管理者

- `ADMIN_PASSWORD_HASH`: 管理パスワードの SHA-256 hex。
- `ADMIN_SESSION_SECRET`: `admin_session` Cookie の HMAC secret。
- `admin_session` Cookie があると、サイト管理トップとルーム管理 API を使える。

### 7.2 管理入口

- `/internal/:token` は管理画面URLを隠すための入口。
- token が正しい場合のみ `admin_entry` Cookie を発行して `/admin/login` へ誘導する。
- `/api/admin/entry-check` は `admin_entry` Cookie が無ければ 404。

### 7.3 ルーム管理権限

`roomManageAuth.ts` の `authorizeRoomManage` が以下のどちらかを許可します。

- legacy `X-Host-Token` が room の `host_token` と一致。
- `admin_session` Cookie が有効。

現在のフロントはルーム管理画面で host token 入力を出さず、サイト管理者 Cookie で操作します。

### 7.4 参加者

- ニックネームはルームごとに `localStorage` 保存。
- `participantId` もルームごとに `localStorage` 保存。
- room passcode は UI 上の簡易ゲートです。現状 API 全体の認可には使われていません。

## 8. D1 データモデル

主なテーブル:

### `rooms`

- `id`
- `name`
- `passcode`
- `host_token`
- `description`
- `expires_at`: レガシー NOT NULL 列。アクセス制御には使わない。
- `created_at`

### `posts`

- `id`
- `room_id`
- `nickname`
- `file_key`
- `file_type`: `image` / `video`
- `mime_type`
- `file_size`
- `status`: `visible` / `hidden`
- `sort_order`
- `upload_status`: `pending` / `uploaded` / `failed`
- `uploaded_at`
- `created_at`
- `participant_id`
- `display_file_key`
- `display_mime_type`
- `post_purpose`: `slideshow` / `album` / `video`

### `media_derivatives`

- `id`
- `post_id`
- `type`: `display_image` / `thumbnail` / `slideshow_image`
- `file_key`
- `mime_type`
- `status`
- `created_at`
- `provider`: `r2` / `cloudflare_images`
- `external_id`
- `delivery_url`
- `error_message`

`provider='cloudflare_images'` は Cloudflare Images Storage に保存したという意味ではなく、Transformations 表示のマーカーとして使います。

### `slideshow_settings`

- `room_id`
- `interval_seconds`
- `show_nickname`
- `order_mode`
- `updated_at`

### `theme_settings`

- `room_id`
- `title`
- `message`
- `main_visual_key`
- `background_image_key`
- `theme_color`
- `animation_mode`
- `updated_at`

## 9. R2 object key 方針

主な key:

- original: `${roomId}/images/${postId}.${ext}`
- display image: `${roomId}/display/${postId}.webp`
- thumbnail: `${roomId}/thumbnails/${postId}.${ext}`
- theme image: `${roomId}/theme/${imageType}/${fileId}.${ext}`

R2 は private のままです。フロントが R2 private URL を直接参照することはありません。

## 10. HEIC / Cloudflare Image Transformations

このプロジェクトでは **Cloudflare Images Upload API は使わない** 方針です。

理由:

- No cost / 自分のストレージを使う構成。
- Images Storage へアップロードすると、プランによって `403 code 5453` などになる。

表示方針:

- original HEIC は R2 に保存。
- `<img>` には raw HEIC を直接渡さない。
- Worker の `view-file` endpoint を source URL にした `/cdn-cgi/image/...` の Transformations URL を返す。
- `IMAGE_TRANSFORMATIONS_ORIGIN` が未設定、または Transformations URL を組めない場合は URL を返さない。フロントは placeholder 表示になる。

Transformations URL のイメージ:

```text
https://<api-origin>/cdn-cgi/image/width=1600,format=webp,fit=scale-down/https%3A%2F%2F<api-origin>%2Fapi%2Frooms%2F...%2Fview-file%3Ftoken%3D...
```

## 11. 代表的なユーザーフロー

### 11.1 管理者がルームを作る

1. `/internal/:token` にアクセス。
2. Worker が `admin_entry` Cookie を発行し `/admin/login` へリダイレクト。
3. `/admin/login` で管理パスワードを入力。
4. `admin_session` Cookie が発行される。
5. `/` の管理トップでルームを作成。
6. ルーム一覧から参加者URL・管理URLへ移動。

### 11.2 参加者が投稿する

1. `/room/:roomId` にアクセス。
2. 必要なら passcode を入力。
3. ニックネームを入力。
4. スライドショー写真、アルバム写真、動画のいずれかを選ぶ。
5. フロントが original をアップロード。
6. 必要に応じて display WebP / thumbnail を生成してアップロード。
7. `complete` で D1 を更新。

### 11.3 表示する

- スライドショー: `/room/:roomId/slideshow`
- 写真アルバム: `/room/:roomId/photos`
- 動画一覧: `/room/:roomId/videos`
- 旧ギャラリー: `/room/:roomId/gallery`

表示URLは `POST /api/rooms/:roomId/posts/view-urls` で一括取得します。

## 12. 注意点・よくあるハマりどころ

- 本番 D1 に `0006_post_purpose.sql` が未適用だと、`post_purpose` 関連で SQL error になります。
- `upload_status` の完了値は `uploaded` です。`completed` ではありません。
- ルームの `expires_at` はレガシー列です。アクセス制御では使いません。
- `VITE_API_BASE` はフロントの本番ビルド時に必要になることがあります。Vite dev proxy は本番では効きません。
- `server.proxy` はローカル開発専用です。
- admin Cookie を API へ送るため、CORS は `credentials: true`、フロントも `credentials: 'include'` が必要です。
- HEIC 表示には `IMAGE_TRANSFORMATIONS_ORIGIN` が必要です。ローカル `wrangler dev` の `localhost` だけでは `/cdn-cgi/image` は期待どおり動きません。
- R2 object を直接 public にしないでください。
- 表示用 WebP/Transformations とダウンロード original は分けて考えてください。

## 13. ファイル対応表

### Frontend

| File | 役割 |
| --- | --- |
| `src/main.tsx` | SPA routing |
| `src/api/client.ts` | API wrapper / URL resolver / R2 PUT helper |
| `src/pages/HomePage.tsx` | サイト管理トップ |
| `src/pages/AdminLoginPage.tsx` | 管理者ログイン |
| `src/pages/RoomPage.tsx` | 参加者ルーム画面 / 投稿 |
| `src/pages/AdminPage.tsx` | ルーム管理画面 |
| `src/pages/SlideshowPage.tsx` | スライドショー表示 |
| `src/pages/PhotosPage.tsx` | 写真アルバム |
| `src/pages/VideosPage.tsx` | 動画一覧 |
| `src/pages/GalleryPage.tsx` | 旧/汎用ギャラリー |
| `src/hooks/useUploadQueue.ts` | アップロードキュー、display/thumbnail 生成 |
| `src/hooks/usePostsPolling.ts` | 投稿 polling |
| `src/utils/participantId.ts` | 参加者ID localStorage 管理 |

### Worker

| File | 役割 |
| --- | --- |
| `src/index.ts` | Hono app entry / CORS / route mount |
| `src/routes/rooms.ts` | room API / slideshow settings |
| `src/routes/posts.ts` | upload, posts, view URLs, room admin post ops |
| `src/routes/theme.ts` | room theme API |
| `src/routes/admin.ts` | site admin API |
| `src/routes/internal.ts` | admin entry token route |
| `src/routes/wedding.ts` | public wedding redirect route |
| `src/adminSession.ts` | admin session Cookie verification |
| `src/entrySession.ts` | admin entry Cookie signing/verification |
| `src/roomManageAuth.ts` | room management authorization |
| `src/uploadBodyToken.ts` | upload/view token signing |
| `src/r2.ts` | R2 presigned URL helper |
| `src/image-transformations.ts` | `/cdn-cgi/image` URL builder |
| `src/db.ts` | common DB helpers |
| `src/types.ts` | Env and D1 row types |
| `src/utils.ts` | UUID/time/mime helpers |

## 14. 次にAIが作業するときの確認順

1. ユーザーが触りたい画面の route を `frontend/src/main.tsx` で確認する。
2. 画面が使う API を `frontend/src/api/client.ts` で確認する。
3. Worker の mount を `worker/src/index.ts` で確認する。
4. 対応ルート実装を `worker/src/routes/*.ts` で読む。
5. D1 の列が関係する場合は `worker/migrations/*.sql` と本番適用状況を確認する。
6. 画像表示の問題なら `view-urls` の `purpose`、`media_derivatives`、`IMAGE_TRANSFORMATIONS_ORIGIN` を確認する。
7. アップロードの問題なら `useUploadQueue`、`upload-url`、`complete`、R2 key、`upload_status` を確認する。

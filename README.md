# Share Photo

結婚式・イベント向けの写真/動画共有アプリ。参加者はルームURLから入室し、ニックネームを登録してスライドショー用写真・アルバム用写真・動画を投稿する。会場のモニターでは投稿がリアルタイムにスライドショー表示される。

- フロントエンド: React + Vite SPA（Cloudflare Pages）
- API: Cloudflare Workers（Hono）
- DB: Cloudflare D1（SQLite）
- ストレージ: Cloudflare R2（署名付きURLで直接 PUT / GET）
- HEIC表示: Cloudflare Image Transformations（`/cdn-cgi/image/...`）

```
参加者・管理者（ブラウザ）
        │
        ├─ HTTPS ─→ Cloudflare Pages（React / Vite SPA）
        │                 │ fetch / REST API
        │                 ↓
        │         Cloudflare Workers（Hono）
        │           ├─ D1（メタデータ）
        │           └─ R2（署名付きURL発行）
        └─ 署名付きURL ─→ Cloudflare R2（直接 PUT / GET）
```

---

## 主な機能

- **ルーム単位の参加者投稿**: ニックネーム登録、スライドショー用写真 / 共有アルバム用写真 / 動画の3種類の投稿（`post_purpose`）。
- **スライドショー表示**: 会場モニター向けのフルスクリーン表示。直近30分以内の投稿（Fresh Pool）を既存投稿（Archive Pool）より優先しつつ（約70:30）、同一写真・同一参加者の連続表示を抑制して混在表示する。
- **公開モード制御（draft / event_live / archive）**: 手動切替 + 時刻スケジュールでルームの状態（準備中・披露宴中・終了後）を制御し、Worker側でもアップロード可否を強制する。
- **テーマ設定**: タイトル・メッセージ・メインビジュアル・背景画像・テーマカラー・アニメーションを管理画面から設定可能。
- **管理画面**: ルーム作成/削除、投稿の表示/非表示・削除、スライドショー設定、テーマ設定。サイト管理者ログイン（Cookieベース）。
- **固定公開URL（QR運用）**: `/wedding/:token` → 参加者画面、`/wedding/live/:token` → スライドショーへリダイレクト。
- **HEIC対応**: original はR2に保存し、表示はCloudflare Image TransformationsのURLを返す（Images Storageは使わない）。

---

## ディレクトリ構成

```
frontend/             React + Vite SPA
  src/pages/             各画面（RoomPage, SlideshowPage, PhotosPage, VideosPage, AdminPage 等）
  src/hooks/             usePostsPolling, useUploadQueue 等
  src/api/client.ts      APIクライアント
  src/utils/             participantId, slideshowPool（Fresh/Archive抽選ロジック）等
worker/                Cloudflare Worker（Hono）
  src/routes/            rooms / posts / theme / admin / internal / wedding
  src/                   D1ヘルパー、認可、R2署名、Image Transformations 等
  migrations/            D1スキーマ変更（順番付きSQL）
docs/                  設計・運用ドキュメント（後述）
playbook/              開発サイクルごとの計画・実装タスク
scripts/               運用補助スクリプト
```

---

## セットアップ

### 前提

- Node.js（frontend/worker とも `package.json` 参照）
- Cloudflare アカウント（D1 / R2 / Workers / Pages）
- `wrangler` CLI（`worker/` の devDependencies に含む）

### Frontend

```bash
cd frontend
npm install
npm run dev        # 開発サーバー（vite.config.ts の proxy で /api をWorkerへ転送）
npm run typecheck
npm run build
```

本番ビルドでAPIが別オリジンの場合は `VITE_API_BASE` を設定する。

```bash
VITE_API_BASE=https://share-photo-api.bysontech.jp npm run build
```

### Worker

```bash
cd worker
npm install
cp .dev.vars.example .dev.vars   # R2 S3 API credentials等をローカル用に設定
npm run dev         # wrangler dev
npm run typecheck
npm run build        # typecheck + wrangler deploy --dry-run
npm run deploy
```

D1マイグレーションはローカル/本番それぞれ `wrangler d1 execute` で適用する。

```bash
npm run migrate:local        # 0001〜0005 をまとめて適用
npm run migrate:local:0006   # 0006以降は個別に追加されている
```

新しいマイグレーションファイルを追加した場合は、ローカル・本番の双方に忘れず適用すること（未適用だと該当カラム不足でAPIエラーになる）。

### 主な環境変数 / Secret（`worker/wrangler.toml` の `[vars]` および Cloudflare Secret）

| 変数 | 用途 |
|---|---|
| `FRONTEND_URL` | フロントの公開オリジン（CORS許可・リダイレクト先） |
| `SIGNED_URL_EXPIRY_UPLOAD` / `SIGNED_URL_EXPIRY_VIEW` | R2署名URLの有効期限 |
| `UPLOAD_BODY_SIGNING_SECRET` | Worker経由アップロード/閲覧トークンのHMAC secret |
| `IMAGE_TRANSFORMATIONS_ORIGIN` | HEIC表示に使う `/cdn-cgi/image` 有効オリジン |
| `PUBLIC_WEDDING_ROOM_ID` | `/wedding/*` 固定公開URLの対象ルームID |
| `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` | R2 S3 API（presigned URL生成用、Secretで管理） |
| `ADMIN_PASSWORD_HASH` / `ADMIN_SESSION_SECRET` | サイト管理者ログイン |
| `ADMIN_ENTRY_TOKEN_HASH` / `ADMIN_ENTRY_SESSION_SECRET` | `/internal/:token` 管理入口 |
| `PUBLIC_WEDDING_ENTRY_TOKEN_HASH` / `PUBLIC_WEDDING_LIVE_TOKEN_HASH` | `/wedding/*` 固定公開URLのトークン |

詳細は `docs/system-overview-frontend-worker.md` と `docs/wedding-url-setup.md` を参照。

---

## デプロイ

- Worker: `cd worker && npm run deploy`（Cloudflare Workers）
- Frontend: Cloudflare Pages にビルド出力（`frontend/dist`）を配信。`VITE_API_BASE` をビルド時環境変数として設定する。

---

## ドキュメント

| ドキュメント | 内容 |
|---|---|
| [docs/architecture.md](docs/architecture.md) | 基本設計書（システム構成、D1スキーマ、API設計） |
| [docs/system-overview-frontend-worker.md](docs/system-overview-frontend-worker.md) | フロント/Workerの実装全体像（ルーティング、API、認可、ハマりどころ） |
| [docs/wedding-url-setup.md](docs/wedding-url-setup.md) | 固定公開URL（QR運用）のトークン設定手順 |
| [playbook/cycle-plan/](playbook/cycle-plan) | 開発サイクルごとのテーマ・スコープ |
| [playbook/implementation-tasks/](playbook/implementation-tasks) | 開発サイクルごとの実装タスク詳細 |

`docs/promotion_criteria.md`、`docs/migration_b_to_c.md`、`docs/repository_contract.md`、`docs/auth_contract.md`、`docs/decision_log.md` は別系統（テンプレB→C昇格設計）の参考ドキュメントであり、本アプリの実装とは直接関係しない。

---

## 注意点・よくあるハマりどころ

- D1マイグレーション未適用（特に `post_purpose` や `event_mode` 系カラム）だとAPIがSQLエラーになる。
- `upload_status` の完了値は `uploaded`（`completed` ではない）。
- R2オブジェクトは常にprivate。フロントは署名付きURL経由でのみ画像/動画にアクセスする。
- HEIC表示には `IMAGE_TRANSFORMATIONS_ORIGIN` が必要。ローカルの `wrangler dev`（localhost）単体では `/cdn-cgi/image` は機能しない。
- admin Cookieを送るため、CORSは `credentials: true`、フロントの fetch も `credentials: 'include'` が必要。

詳細は `docs/system-overview-frontend-worker.md` の「注意点・よくあるハマりどころ」を参照。

---

## License

(プロジェクトに応じて記載)

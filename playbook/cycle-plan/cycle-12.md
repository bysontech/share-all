project: wedding-photo-app
cycle: 12
goal: Cloudflare Images検証・HEIC表示用派生画像生成の最小導入

## 背景

cycle-11で original と display_image を分離し、media_derivatives に表示用派生メディアを持てる構造にした。
ただし、HEIC はブラウザ側 WebP 生成に失敗するケースがあり、display_image が作られない。
このサイクルでは Cloudflare Images を使い、HEIC を表示可能な WebP/JPEG 系の派生画像として扱えるかを検証し、最小導入する。

## 方針

- オリジナルは引き続き R2 に保存する
- 表示用派生画像は Cloudflare Images を利用して生成・配信する
- display_image が ready になった投稿のみ、ギャラリー・スライドショーで画像表示する
- ダウンロードは引き続きオリジナルを対象にする
- 動画機能は広げない

## Scope（Must）

### 1. Cloudflare Images利用可否の検証
- HEICをCloudflare Imagesに投入できるか確認する
- WebP/JPEGなどWeb表示可能形式で配信できるか確認する
- R2 originalとの共存方針を確認する
- コスト・制限・必要な環境変数を整理する

### 2. 画像変換フローの最小導入
- HEICなどブラウザWebP生成に失敗した画像を対象に、Cloudflare Images側で表示用画像を作る
- 成功時は media_derivatives に type=display_image / status=ready として登録する
- 失敗時は status=failed または派生なしで安全に扱う

### 3. media_derivativesとの統合
- Cloudflare Images由来の表示用情報を media_derivatives で管理する
- R2 file_key 由来と Cloudflare Images 由来が混在しても表示ロジックが壊れないようにする
- 必要に応じて provider / external_id / delivery_url などの管理項目を追加する

### 4. 表示ロジック維持
- ギャラリーは display_image ready のものを表示する
- display_image が無いものは placeholder 表示を維持する
- スライドショーは display_image ready の画像のみ対象にする

### 5. ダウンロード方針維持
- 保存・ダウンロードは original を対象にする
- Cloudflare Imagesの表示用画像を保存対象にしない

## Scope（Should）

- HEIC変換中の状態をUIに出せるようにする
- Cloudflare Images変換失敗時の理由をログに残す
- 変換処理を同期で待ちすぎないようにする

## Scope（Could）

- HEIC以外もCloudflare Imagesへ寄せる検討
- 将来的な thumbnail 派生との共通化
- 管理画面で display_status を確認できるようにする

## Out of Scope

- 動画再生
- 動画サムネイル生成
- Cloudflare Stream導入
- ZIPダウンロード
- 既存画像の一括再変換
- 大規模なDB再設計
- Cloudflare Images以外の変換サーバー本実装

## 完了条件

- HEIC投稿に対してCloudflare Images経由の表示用派生を作れる
- 成功した投稿はギャラリーで表示できる
- 成功した投稿はスライドショー対象になる
- 失敗した投稿は壊れ画像にならず placeholder になる
- media_derivatives で provider 差異を扱える
- ダウンロードはオリジナルのまま維持される
- 既存のJPEG/PNG/WebP投稿が壊れていない
- build が通る

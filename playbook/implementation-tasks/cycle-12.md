# Cycle-12 Implementation Tasks

## 1. Cloudflare Images検証

### 1-1. 必要情報確認
- Account ID
- Images API Token
- Delivery URL形式
- Upload APIまたはDirect Upload方式
- HEIC入力対応
- WebP/JPEG配信方法

### 1-2. 検証項目
- HEICファイルをCloudflare Imagesへ登録できる
- 登録後、Web表示可能な形式で配信できる
- 署名や公開範囲の扱いを確認する
- 料金・無料枠・制限を確認する

---

## 2. 環境変数

**Image Transformations（/cdn-cgi/image）用（No cost / 自前ストレージ）**

- `IMAGE_TRANSFORMATIONS_ORIGIN` — デプロイした Worker の公開オリジン（例: `https://api.example.com`）。同一ゾーンで Transformations が効くホスト。未設定時はローカル同様、HEIC は表示 URL を返さずプレースホルダ。

**使わないもの（Images Storage / Upload API は使用しない）**

- ~~CF_ACCOUNT_ID~~ / ~~CF_IMAGES_API_TOKEN~~ … 削除済み

注意：secret は wrangler secret / ダッシュボードで管理し、リポジトリに直書きしない。

---

## 3. DB拡張

### 3-1. media_derivatives拡張

必要であれば以下を追加する。

- provider（r2 / cloudflare_images）
- external_id（Cloudflare Images image id）
- delivery_url（必要な場合のみ）
- updated_at
- error_message（任意）

### 3-2. 後方互換
- 既存 derivatives が壊れないようにする
- provider が無い既存行は r2 相当として扱う

---

## 4. Cloudflare Images連携API

### 4-1. Worker側ヘルパー作成

Cloudflare Images API呼び出し用ヘルパーを作る。

責務：
- 画像アップロード
- レスポンスから image id を取得
- delivery URL を組み立てる
- エラーを安全に返す

---

### 4-2. 変換対象

対象：
- file_type = image
- display_image が無い
- mime_type = image/heic または image/heif
- 必要に応じてWebP生成失敗として扱われた投稿

---

## 5. 変換フロー

### 5-1. complete後の処理

オリジナルアップロード完了後、HEICの場合にCloudflare Imagesへ登録する。

流れ：
1. original R2保存完了
2. complete API
3. HEIC判定
4. R2からoriginalを取得、または署名URL/公開可能な一時URLを使ってCloudflare Imagesへ登録
5. 成功したら media_derivatives に display_image / ready を登録
6. 失敗したら failed を登録、またはplaceholder継続

---

### 5-2. 同期/非同期方針

Cycle-12では最小実装でよい。

推奨：
- complete API内で短時間試行
- 失敗時も投稿自体は成功
- UIはplaceholderのまま

注意：
- complete APIが長時間ブロックしないようにする
- 変換失敗で投稿を失敗扱いにしない

---

## 6. viewUrl / 表示URL処理

### 6-1. provider別処理

- provider = r2
  - 既存の署名付きviewUrlを使う

- provider = cloudflare_images
  - Cloudflare Imagesのdelivery URLを返す
  - 署名が不要な構成ならURLをそのまま返す

---

### 6-2. 表示ロジック

- display_image ready がある場合のみ表示URLを返す
- display_image が無い場合は null
- original HEICにはフォールバックしない

---

## 7. フロント修正

### 7-1. ギャラリー
- Cloudflare Images由来のURLでも表示できるようにする
- URL取得元の違いでUIを変えない
- 変換中/失敗はplaceholder維持

### 7-2. スライドショー
- display_image ready の画像のみ表示
- HEIC変換成功後は表示対象になる
- 変換前/失敗はスキップ

---

## 8. 管理画面

必要に応じて以下を軽く表示する。

- 表示用画像あり
- 表示準備中
- 表示変換失敗

※ 管理画面の大幅改修はしない。

---

## 9. エラー処理

対応すること：
- Cloudflare Images API失敗
- API token未設定
- HEIC以外が渡された場合
- 変換結果が取得できない場合
- 既存データにproviderが無い場合

方針：
- 投稿成功を優先
- 表示用変換失敗はplaceholder
- ログに原因を残す

---

## 10. 確認

### 10-1. HEIC
- HEICをアップロード
- display_image derivative が作られる
- ギャラリーに表示される
- スライドショーに表示される
- ダウンロードはオリジナルHEICになる

### 10-2. JPEG/PNG/WebP
- 既存のブラウザWebP生成フローが壊れない
- display_image が表示される

### 10-3. 失敗時
- API tokenなし/変換失敗でも投稿自体は成功する
- placeholder表示になる
- 画面が壊れない

---

## 完了条件

- Cloudflare Images経由のdisplay_image登録ができる
- HEIC投稿がギャラリー表示できる
- HEIC投稿がスライドショー表示対象になる
- 変換失敗時に壊れ画像にならない
- ダウンロードはオリジナルを維持する
- buildが通る
- 既存機能が壊れていない

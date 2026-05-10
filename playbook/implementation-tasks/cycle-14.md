# Cycle-14 Implementation Tasks

## 1. 動画アップロード対応

### 1-1. 許可MIMEタイプ確認

以下を許可する。

- video/mp4
- video/quicktime

必要に応じて拡張子も正規化する。

- video/mp4 → mp4
- video/quicktime → mov

---

### 1-2. サイズ制限

動画サイズ上限を設定する。

推奨：
- 50MB

既存設定がある場合はそれを尊重する。

---

### 1-3. アップロード並列数

動画は1件ずつ処理する。

- 画像：既存の並列数を維持
- 動画：1並列

---

## 2. 動画サムネ生成（クライアント）

### 2-1. 生成処理

動画ファイルからサムネイル画像を作る。

流れ：
1. File から object URL を作成
2. video 要素に読み込む
3. loadedmetadata 後、1秒付近に seek
4. canvas に描画
5. WebP または JPEG Blob を生成

---

### 2-2. media_derivatives登録

サムネ生成成功時：

- type = thumbnail
- status = ready
- provider = r2
- mime_type = image/webp または image/jpeg

R2の保存先例：
{roomId}/thumbnails/{postId}.webp

---

### 2-3. 失敗時

以下の場合はサムネなしで進める。

- 動画がブラウザで読み込めない
- seekできない
- canvas描画に失敗
- toBlobに失敗

投稿自体は失敗にしない。

---

## 3. completeフロー拡張

動画投稿時にも以下を保存する。

- file_type = video
- mime_type
- file_size
- participant_id
- original file_key

thumbnail がある場合は media_derivatives に登録する。

---

## 4. ギャラリー表示

### 4-1. 動画カード

file_type = video の投稿は動画カードとして表示する。

表示：
- thumbnail があれば画像表示
- 無ければ動画placeholder
- 動画アイコン
- ファイルサイズ
- 投稿者名
- 保存済み状態

---

### 4-2. プレビュー対象

cycle-14では動画プレビューは対象外。

- 画像：既存プレビューを維持
- 動画：カード表示のみ

---

## 5. view-urls API

### 5-1. thumbnail purpose

purpose=thumbnail で動画thumbnailを取得できるようにする。

- thumbnail derivative が ready の場合はURLを返す
- 無い場合は null

---

### 5-2. 動画originalは表示用URLにしない

動画originalを img / video 表示用として返さない。

保存用URLは既存のダウンロード処理で扱う。

---

## 6. ダウンロード対応

### 6-1. 対象

動画も保存対象に含める。

- 選択保存
- 全保存
- 未保存保存
- 自分以外保存

---

### 6-2. 直列処理

動画はサイズが大きいため、ダウンロードは直列処理を維持する。

---

### 6-3. ファイル名

cycle-09の命名ルールを動画にも適用する。

例：
wedding_taro_20260505_120000_abcd1234.mp4

---

## 7. UI/UX

### 7-1. アップロード中表示

動画はアップロード時間が長くなりやすいため、以下を表示する。

- アップロード中
- 進捗
- 完了
- 失敗時のリトライ

---

### 7-2. サムネ準備中

サムネ未生成の場合：

- 動画として保存できます
- サムネイル準備中

などを表示する。

---

## 8. スライドショー除外

スライドショーでは file_type = video を除外する。

- slideshow_image のみ対象
- video は対象外

---

## 9. 確認

### 9-1. MP4

- アップロードできる
- ギャラリーで動画カード表示
- サムネ生成できる場合は表示
- 保存できる

---

### 9-2. MOV

- アップロードできる
- サムネ生成できない場合も壊れない
- 保存できる

---

### 9-3. 既存画像

- JPEG
- PNG
- WebP
- HEIC

が壊れていないことを確認する。

---

## 完了条件

- 動画アップロードが動く
- 動画カードが表示される
- 動画サムネが可能なら表示される
- サムネ失敗時も壊れない
- 動画保存が動く
- スライドショーに動画が出ない
- build が通る

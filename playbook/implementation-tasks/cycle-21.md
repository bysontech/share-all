# Cycle-21 Implementation Tasks

## 1. アップロード進捗表示

### 1-1. upload queue state整理

アップロードキューで以下を管理する。

- fileId
- filename
- fileSize
- uploadedBytes
- progressPercent
- status
  - waiting
  - uploading
  - processing
  - completed
  - failed
- error message
- retry count

---

### 1-2. ファイルごとの進捗

各ファイルで進捗を表示する。

表示：
- ファイル名
- 進捗バー
- %
- MB / MB
- status

---

### 1-3. 全体進捗

複数ファイル選択時：

- 完了件数 / 全件数
- 全体パーセント
- 現在アップロード中のファイル

を表示する。

---

## 2. upload実装の進捗対応

### 2-1. XHR upload progress

presigned URLへのPUTで進捗を取りたい場合、
fetchではなく XMLHttpRequest を使うことを検討する。

理由：
- xhr.upload.onprogress で進捗取得しやすい

---

### 2-2. 既存fetch維持の場合

fetchを維持する場合は、
ReadableStreamなどで可能な範囲で進捗を取得する。

ただし実装が複雑になるなら、
XHRへ寄せる方を優先してよい。

---

### 2-3. direct upload維持

ファイルは引き続きAPIサーバーを経由せず、
署名付きURLでR2へ直接アップロードする。

---

## 3. 動画アップロードUX

### 3-1. 動画用表示

動画アップロード時：

- 大きなファイルです
- Wi-Fi環境を推奨します
- アップロードに時間がかかる場合があります

を表示する。

---

### 3-2. MB表示

動画は特に：

- uploaded MB
- total MB
- percent

を分かりやすく表示する。

---

### 3-3. 残り時間

可能なら推定する。

必須ではない。

---

## 4. 失敗・リトライUX

### 4-1. 失敗表示

失敗時：

- ファイル名
- エラー内容
- 再試行ボタン

を表示する。

---

### 4-2. partial success

複数アップロード時：

- 成功済みは成功扱い
- 失敗分だけ再試行可能

にする。

---

## 5. 背景画像軽量化

### 5-1. derivative type追加

背景用derivativeを追加する。

推奨 type：
- background_image

用途：
- participant page background
- album/photos/videos page background

---

### 5-2. 生成方針

背景画像アップロード時に表示用背景を生成する。

推奨：
- width 1920
- format webp or jpeg
- quality 70〜80

---

### 5-3. Cloudflare Transformations利用

既存のCloudflare Images Transformations構成を活用してよい。

R2 originalを直接背景に使わず、
background_image derivative または transformation URLを使う。

---

### 5-4. fallback

background_imageが無い場合：

- 既存背景を使わずplaceholder
- または低コストな既存displayを使う

ただし巨大originalを初回背景に直接使わない。

---

## 6. 初回表示改善

### 6-1. critical path整理

参加者ページ初期表示では：

- room basic info
- nickname state
- main buttons

を先に表示する。

---

### 6-2. 非同期読み込み

以下は後から読み込む。

- background image
- posts
- view-urls
- counts

---

### 6-3. loading状態

背景や件数が読み込み中でも、
投稿ボタン・閲覧ボタンは操作できるようにする。

---

## 7. background loading UI

### 7-1. placeholder

背景読み込み前：

- gradient
- solid color
- theme color

などを表示。

---

### 7-2. fade-in

背景画像読み込み完了後、
軽くfade-inしてよい。

---

## 8. 既存機能確認

壊してはいけない：

- slideshow upload
- album upload
- video upload
- HEIC表示
- photos page
- videos page
- fullscreen slideshow
- download
- admin theme settings

---

## 9. 動作確認

### 9-1. 写真アップロード

- 複数画像
- HEIC
- JPEG
- 進捗表示
- 完了表示

---

### 9-2. 動画アップロード

- MP4
- MOV
- 大きめファイル
- 進捗表示
- 失敗時表示

---

### 9-3. 背景画像

- 管理者画面で背景設定
- 参加者ページで軽量背景表示
- 初回表示が重くなりすぎない

---

### 9-4. 低速回線

DevTools等で低速回線を想定し、
UIが止まって見えないことを確認する。

---

## 完了条件

- upload progressが表示される
- video upload progressが表示される
- upload失敗時に再試行できる
- 背景画像が軽量化される
- original背景を直接初回表示に使わない
- 初回表示が改善される
- build成功

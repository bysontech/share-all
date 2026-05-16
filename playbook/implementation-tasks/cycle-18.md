# Cycle-18 Implementation Tasks

## 1. post purpose導入

### 1-1. posts schema拡張

posts に用途を追加する。

推奨：
- post_purpose

候補：
- slideshow
- album
- video

注意：
- 既存データmigrationを考慮
- video は file_type=video でも判定可能だが、
  purposeを明示しておくとUIが簡単

---

### 1-2. migration

既存データは：

画像：
- album
または
- slideshow

へ寄せる。

動画：
- video

---

## 2. upload導線分離

### 2-1. participant page

参加者ページで以下を分離。

- スライドショーに写真を送る
- 共有アルバムに写真を送る
- 動画を送る

---

### 2-2. slideshow upload

制限：
- image only
- participantごと10枚まで

説明表示：
- 会場スクリーンに表示されます
- 最大10枚まで

---

### 2-3. album upload

制限：
- image only

特徴：
- slideshow対象外

---

### 2-4. video upload

制限：
- video only

説明：
- スライドショーには表示されません

---

## 3. slideshow upload制限

### 3-1. API側制限

Worker側で必ず制限する。

条件：
- room_id
- participant_id
- post_purpose = slideshow

count <= 10

超過時：
- 400 or 409

message：
- スライドショー投稿は10枚までです

---

### 3-2. frontend制限

アップロード前にも表示。

例：
- 10枚まで投稿できます
- 残り○枚

---

## 4. slideshow対象変更

### 4-1. slideshow query

slideshowでは：

- post_purpose = slideshow
- file_type = image

のみ対象にする。

---

### 4-2. 除外

除外：
- album画像
- video
- failed derivative
- original HEIC

---

## 5. photos page

### 5-1. route追加

追加：
/room/:roomId/photos

---

### 5-2. 対象

表示：
- post_purpose = album
- image only

---

### 5-3. 機能

既存gallery機能を利用：
- 保存
- 選択
- preview
- 自分除外
- 未保存のみ

---

## 6. videos page

### 6-1. route追加

追加：
/room/:roomId/videos

---

### 6-2. 対象

表示：
- file_type = video

---

### 6-3. UI

表示：
- thumbnail
- placeholder
- nickname
- 投稿日
- 保存状態

---

## 7. navigation整理

### 7-1. participant home

導線：
- スライドショーへ送る
- 写真を共有する
- 動画を共有する
- 写真を見る
- 動画を見る

---

### 7-2. gallery route整理

既存：
/gallery

扱い：
- photosへredirect
または
- compatibility維持

---

## 8. participant保持

### 8-1. localStorage

保持：
- participant_id
- nickname

---

### 8-2. 維持

同一端末では：
- nickname維持
- 自分投稿判定維持
- slideshow投稿数維持

---

## 9. 既存機能確認

壊してはいけない：
- slideshow
- upload queue
- HEIC display
- video thumbnail
- download
- admin
- room join

---

## 10. 動作確認

### 10-1. slideshow upload

- 10枚以内成功
- 11枚目失敗

---

### 10-2. album upload

- photosへ表示
- slideshowへ出ない

---

### 10-3. video upload

- videosへ表示
- slideshowへ出ない

---

### 10-4. photos page

- 保存
- preview
- filters

---

### 10-5. videos page

- 表示
- 保存
- placeholder

---

## 完了条件

- 投稿導線分離
- slideshow制限動作
- photos/videos分離
- slideshow対象整理
- participant維持
- build成功
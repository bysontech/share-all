# Cycle-13 Implementation Tasks

## 1. media_derivatives 整理

### 1-1. derivative type 正式化

使用する type：

- display_image
- slideshow_image
- thumbnail

既存 display_image は維持。

---

### 1-2. slideshow_image 導入

画像投稿時：

- slideshow向け派生を生成
- provider は既存設計に従う
- Cloudflare Transformations利用可

推奨：
- width 2048 前後
- quality高め

---

### 1-3. thumbnail 導入

一覧表示向け。

画像：
- 小型WebP/JPEG

動画：
- placeholder前提
- 将来サムネ生成に対応できる構造

---

## 2. ギャラリー UX 改善

### 2-1. 選択モード OFF

画像タップ：
- fullscreen preview
- swipe navigation
- save button

---

### 2-2. 選択モード ON

追加機能：
- 複数選択
- 全選択
- 未保存のみ
- 自分以外のみ
- 一括保存

既存 savedPostIds / participant_id を利用。

---

### 2-3. UI整理

選択モード切替を追加。

例：
- 「選択」
- 「完了」

---

## 3. スライドショー修正

### 3-1. slideshow_image 利用

スライドショーでは：

- slideshow_image を優先
- display_image を使わない

---

### 3-2. 対象制御

表示対象：
- image のみ

除外：
- video
- display無し
- failed derivative

---

### 3-3. 表示改善

- object-fit調整
- fullscreen最適化
- preload最適化（可能なら）

---

## 4. アップロードUX改善

### 4-1. 成功判定

original 保存成功時点で：
- UI上は投稿成功扱い

---

### 4-2. derivative生成状態

状態例：
- uploading
- processing
- ready

---

### 4-3. 表示準備中UI

placeholder改善。

例：
- 「表示準備中」
- 「高画質表示を準備しています」

---

## 5. 動画カード整理

### 5-1. 動画カードUI

表示：
- 動画アイコン
- 投稿日時
- ファイルサイズ
- placeholder thumbnail

---

### 5-2. 保存

動画も既存保存対象に含める。

---

## 6. API調整

### 6-1. view-urls

用途別に返せるようにする。

例：
- purpose=display
- purpose=slideshow
- purpose=thumbnail

---

### 6-2. derivative選択

purpose に応じて：
- display_image
- slideshow_image
- thumbnail

を返す。

---

## 7. 確認

### 7-1. JPEG

- ギャラリー表示
- slideshow表示
- preview表示

---

### 7-2. HEIC

- ギャラリー表示
- slideshow表示
- placeholder崩れ無し

---

### 7-3. 動画

- カード表示
- 保存可能

---

### 7-4. UX

- 選択モード切替
- 一括保存
- preview遷移

---

## 完了条件

- slideshow_image が使われる
- ギャラリーUX改善
- preview動作
- 動画カード安定
- build成功
- 既存機能維持
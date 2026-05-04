# Cycle-11 Implementation Tasks

## 1. DB設計

### 1-1. media_derivatives テーブル追加

カラム：
- id
- post_id
- type（display_image / thumbnail）
- file_key
- mime_type
- status（pending / ready / failed）
- created_at

---

### 1-2. posts の調整

- display_file_key を廃止（または非推奨扱い）
- file_type を image / video に明示

---

## 2. アップロードフロー修正

### 2-1. オリジナル

- 既存通り保存

---

### 2-2. display生成

- WebP生成成功時のみ derivatives に登録
- type = display_image
- status = ready

---

### 2-3. 失敗時

- display生成失敗 → derivatives作らない or status=failed
- 投稿自体は成功扱い

---

## 3. API修正

### 3-1. posts API

- 派生情報は直接返さない（軽量維持）
- 必要に応じて has_display フラグだけ追加可

---

### 3-2. view-url API

- post_id から display_image を優先取得
- 無い場合は original を返さない（重要）
- display無い場合はURLを返さない or null

---

## 4. フロント修正

### 4-1. 表示ロジック

if display_image exists:
    → 表示

else if file_type == image:
    → placeholder（表示準備中）

else if file_type == video:
    → 動画カード表示

---

### 4-2. 壊れ画像の排除

- <img> に HEIC を渡さない
- src 未設定 or placeholder

---

## 5. ギャラリー修正

- display_image のみ画像として表示
- displayが無い画像はカード表示（非画像扱い）

---

## 6. 動画対応（最小）

- file_type = video の投稿を許可
- ギャラリーで動画カード表示
- アイコン + ファイルサイズ + 名前

---

## 7. フィルタとの統合

- 既存フィルタ（自分以外 / 未保存）を維持
- displayの有無はフィルタに影響させない

---

## 8. UI追加

### 8-1. placeholder

例：
- 「表示準備中」
- 「この画像は表示形式に変換中です」

---

### 8-2. 動画カード

- 動画アイコン
- 再生ボタン風UI（実際には再生しない）

---

## 9. 確認

### 9-1. HEIC
- 壊れない
- placeholderになる

---

### 9-2. JPEG/PNG
- display生成される
- 正常表示

---

### 9-3. 動画
- 投稿できる
- ギャラリーに表示される

---

## 完了条件

- display依存の表示に切り替わる
- HEICで壊れない
- UIが安定する
- 動画が扱える状態になる
- buildが通る
- 既存機能が壊れていない
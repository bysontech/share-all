# Cycle-23 Implementation Tasks

## 1. Migration

theme_settings に追加

- main_visual_display_key TEXT
- main_visual_display_mime_type TEXT

---

## 2. Main Visual Display生成

### 2-1. 管理者画面

main visual選択時：

- original upload
- display生成
- display upload

を行う。

---

### 2-2. display仕様

推奨：

- max width: 1920
- format: webp
- quality: 0.80

---

### 2-3. 保存先

{roomId}/theme/main-visual-display/{uuid}.webp

---

## 3. updateTheme拡張

保存対象：

- mainVisualDisplayKey
- mainVisualDisplayMimeType

---

## 4. bootstrap API拡張

返却：

theme.mainVisualDisplayUrl

---

## 5. theme/view-urls修正

優先順位：

1. main_visual_display_key
2. main_visual_key
3. null

---

## 6. RoomPage修正

### Main Visual

表示：

mainVisualDisplayUrl

優先。

---

### Fallback

displayが無い場合のみ

mainVisualUrl

を使用。

---

## 7. 背景画像修正

### 7-1. opacity撤廃

削除：

opacity: 0.2〜0.4

---

### 7-2. overlay導入

背景画像はそのまま表示。

視認性は：

- gradient overlay
- card background
- text shadow

で確保。

---

### 7-3. fade-in維持

背景画像の読み込み演出は維持。

ただし画像自体を薄くしない。

---

## 8. Preload

bootstrap取得後：

- main visual preload
- background preload

を実施。

---

## 9. 動作確認

### Main Visual

- JPEG
- PNG
- 大サイズ画像

---

### 既存ルーム

displayなし
→ fallback確認

---

### 背景

- opacity復活確認
- overlay確認
- 可読性確認

---

### Network

確認：

- display取得
- original取得削減
- bootstrap利用

---

## 完了条件

- migration適用
- display生成
- display保存
- bootstrap返却
- RoomPage利用
- 背景opacity撤廃
- overlay方式化
- build成功
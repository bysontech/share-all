# Cycle-23

## テーマ

Main Visual Display Generation + Visual Quality Recovery

---

## 背景

Cycle-22で背景画像の事前軽量化と bootstrap API の導入を行った。

その結果、

- 初回表示速度は改善
- API往復は削減
- background display の事前生成が実現

した一方で、

背景画像を装飾扱いにするために導入した opacity 調整により、

- 背景画像が薄すぎる
- テーマ画像の存在感が弱い
- 管理者が設定した背景の意味が薄れる

という課題が発生した。

Cycle-23では、

- Main Visual の display版生成
- 背景画像の見た目改善
- 初回表示品質の向上

を行う。

---

## ゴール

### Main Visual

現在

main_visual_key
↓
signed URL
↓
参加者画面

改善後

main_visual_key
↓
保存用

main_visual_display_key
↓
表示用

参加者画面
↓
display版利用

---

### 背景画像

現在

background image
opacity 0.2〜0.4

↓

画像が薄い

改善後

background image
opacity 1.0

↓

overlayで視認性調整

---

## Scope（Must）

### 1. Main Visual Display版生成

管理者設定時に

- original
- display

を生成する。

保存先例：

{roomId}/theme/main-visual-display/{id}.webp

---

### 2. theme_settings拡張

追加：

- main_visual_display_key
- main_visual_display_mime_type

---

### 3. bootstrap API拡張

返却：

- mainVisualDisplayUrl

---

### 4. RoomPage修正

参加者画面では

mainVisualDisplayUrl

を優先利用する。

---

### 5. 背景画像の透明度撤廃

背景画像：

opacity: 1

へ戻す。

背景そのものを薄くしない。

---

### 6. Overlay方式へ変更

視認性は

- gradient overlay
- card background
- backdrop blur

で確保する。

背景画像の情報量は維持する。

---

### 7. 後方互換

display key が無い既存ルームは

originalへフォールバック。

---

## Scope（Should）

### Main Visual preload

bootstrap取得後に preload。

---

### Skeleton改善

main visual 読み込み中のプレースホルダー追加。

---

### CLS対策

aspect-ratio固定。

---

## Scope（Could）

- blur placeholder
- dominant color placeholder
- main visual prewarm

---

## Out of Scope

- 動画サムネイル
- Stream
- 動画変換
- Service Worker
- offline対応

---

## 完了条件

- main visual display生成
- display保存
- bootstrap返却
- RoomPage利用
- 背景opacity撤廃
- overlay方式へ変更
- build成功
# Cycle-22 Implementation Tasks

## 1. DB migration

### 1-1. theme_settings拡張

theme_settings に以下を追加する。

推奨：
- background_display_image_key TEXT
- background_display_mime_type TEXT
- main_visual_display_key TEXT
- main_visual_display_mime_type TEXT

main_visual は実装が大きくなる場合は後回しでもよい。
背景を優先する。

---

### 1-2. 後方互換

既存データでは新規カラムは NULL でよい。

NULLの場合：
- gradient/themeColor placeholder
- または既存fallback

で壊さない。

---

## 2. 背景表示用画像生成

### 2-1. 生成タイミング

管理者が背景画像をアップロード・設定するタイミングで、軽量版を生成する。

対象：
- backgroundImage

---

### 2-2. 生成仕様

推奨：
- width: 1600〜1920
- format: webp
- quality: 0.7〜0.8
- fit: scale-down

---

### 2-3. 保存先

R2 key例：

{roomId}/theme/background-display/{fileId}.webp

---

### 2-4. 保存結果

theme_settings に保存：

- background_display_image_key
- background_display_mime_type

---

## 3. 生成方法

### 3-1. クライアント生成優先

管理者画面で背景画像を選択した時、
ブラウザ側で canvas により軽量WebPを生成できる場合はそれを使う。

理由：
- Workerで画像変換しない
- 既存の画像WebP生成処理を流用しやすい

---

### 3-2. 失敗時

軽量版生成に失敗した場合：

- original uploadは成功させる
- background display key は null
- 参加者画面は gradient fallback

---

### 3-3. HEIC背景

HEICを背景に使う可能性がある場合：
- クライアント変換できなければ display生成失敗扱い
- originalを背景に直接表示しない
- 管理者に「表示用背景の生成に失敗しました」程度を表示

---

## 4. theme upload API調整

### 4-1. upload-url

theme uploadで、display用背景をアップロードできるようにする。

候補：
- uploadType = background_display
- imageType = background

---

### 4-2. updateTheme

updateTheme時に以下を受け取れるようにする。

- backgroundDisplayImageKey
- backgroundDisplayMimeType

既存backgroundImageKeyも維持。

---

## 5. theme view-urls修正

### 5-1. backgroundDisplay

theme/view-urls は backgroundDisplay で以下を優先する。

1. background_display_image_key
2. fallback gradient（URLなし）
3. 既存Transformations URLは移行用fallbackに留める

---

### 5-2. original直参照禁止

参加者ページ初回背景に original background_image_key を直接返さない。

---

## 6. bootstrap API追加

### 6-1. route追加

GET /api/rooms/:roomId/bootstrap

返却候補：

{
  room: {
    id,
    name,
    description,
    passcodeRequired
  },
  theme: {
    title,
    message,
    themeColor,
    animationMode,
    backgroundDisplayUrl,
    mainVisualDisplayUrl
  }
}

---

### 6-2. 認可

参加者画面で使うAPIなので、ログイン不要。

room passcode がある場合の扱いは既存仕様と整合させる。
passcodeそのものは返さない。

---

### 6-3. cache

過剰なcacheは不要。
ただし、短時間cacheできる構造にしてもよい。

---

## 7. RoomPage修正

### 7-1. bootstrap利用

RoomPage初期表示で bootstrap API を使う。

既存の getRoom + getTheme + getThemeViewUrls の連鎖を減らす。

---

### 7-2. 表示順

初期表示：
1. localStorage nickname / participantId確認
2. UI skeleton / main buttons表示
3. bootstrap取得
4. backgroundDisplay preload
5. 背景fade-in

---

### 7-3. 背景の見せ方

背景画像は装飾扱いにする。

推奨：
- opacity 0.2〜0.4
- gradient overlay
- transition 1.0〜1.5s
- background imageが遅れても違和感が少ない見た目

---

## 8. 管理者画面

### 8-1. 背景設定

背景画像設定時に：
- original upload
- background display upload
- updateTheme

を行う。

---

### 8-2. 表示

設定後に背景が反映されることを確認できるようにする。

---

## 9. 既存機能確認

壊してはいけない：

- participant page
- admin theme settings
- main visual
- slideshow
- photos/videos
- upload progress
- HEIC表示
- wedding fixed URL
- admin login

---

## 10. 動作確認

### 10-1. 背景画像設定

- JPEG背景
- PNG背景
- 大きい画像
- HEIC背景（失敗時も壊れない）

---

### 10-2. 初回表示

- background displayあり
- background displayなし
- themeなし

---

### 10-3. Network確認

- original背景が初回背景として取得されていない
- background displayのサイズが軽い
- bootstrapで初回取得が整理されている

---

## 11. 完了条件

- migration追加
- background display key保存
- R2へ軽量背景保存
- RoomPageが軽量背景使用
- bootstrap API追加
- original背景直使用なし
- build成功

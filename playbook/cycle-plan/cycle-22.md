project: wedding-photo-app
cycle: 22
goal: 背景画像の事前軽量化・theme bootstrap導入・初回表示体験改善

## 背景

Cycle-21で初回表示の骨組みは速くなったが、背景画像が後から遅れて表示されるため、かえって遅さが目立つ状態になっている。

現在の背景画像は、管理者画面で事前設定される。
そのため、参加者アクセス時に on-the-fly 変換するよりも、管理者設定時に軽量表示用画像を生成・保存しておく方が適している。

現状：
- theme_settings に background_image_key がある
- backgroundDisplay は Cloudflare Image Transformations の on-the-fly URLで返している
- 初回アクセス時に変換待ち・キャッシュ待ちが見えやすい
- SPAの index.html にルーム別背景を直埋めするのは向いていない

---

# 方針

背景画像は、管理者設定時に表示用軽量版を生成してR2へ保存する。

- original: 保存用
- background_display: 表示用軽量背景

参加者画面では original を背景に使わない。

また、初回表示で必要な room/theme/backgroundDisplayUrl をまとめて返す bootstrap API を追加し、API往復を減らす。

---

# Scope（Must）

## 1. theme_settings 拡張

背景画像の表示用keyを保持できるようにする。

追加候補：
- background_display_image_key
- background_display_mime_type
- main_visual_display_key（可能なら）

---

## 2. 背景画像の事前軽量化

管理者が背景画像をアップロード・設定したタイミングで、表示用背景を作る。

要件：
- width 1600〜1920px
- format WebP または JPEG
- quality 70〜80
- R2へ保存
- theme_settings に display key を保存

---

## 3. 参加者画面で軽量背景を使用

参加者画面では：

- background_display_image_key があればそれを使う
- background_image_key original は初回背景に直接使わない
- display key が無ければ gradient / themeColor placeholder

---

## 4. theme view-urls 修正

theme/view-urls は backgroundDisplay に、R2保存済みの軽量背景URLを返す。

on-the-fly Transformations URLは fallback か移行用に留める。

---

## 5. bootstrap API導入

参加者ページ初回表示用に、room + theme + backgroundDisplayUrl をまとめて返すAPIを追加する。

例：
GET /api/rooms/:roomId/bootstrap

返却：
- room basic info
- theme title/message/themeColor/animationMode
- backgroundDisplayUrl
- mainVisualDisplayUrl（あれば）
- slideshowCountに必要な最小情報は別でも可

---

## 6. RoomPage初回表示修正

RoomPage は bootstrap API を使って、初回に必要な情報をまとめて取得する。

要件：
- UI骨組みは即時表示
- backgroundDisplayUrlがあれば早めに読み込み開始
- 背景未ロードでも操作可能
- 背景出現が目立たないようにopacity/overlay調整

---

# Scope（Should）

## 1. 背景画像の装飾化

背景画像は主役ではなく装飾扱いにする。

推奨：
- opacity 0.2〜0.4
- gradient overlay
- transition 1.2s前後
- blur/scaleは必要なら軽く

---

## 2. 既存背景の後方互換

既存roomで display key が無い場合も壊れないようにする。

- fallback gradient
- 可能なら管理者が再保存したときに display生成

---

## 3. 管理者画面の表示

管理者画面で背景画像設定後、軽量背景も反映されることが分かるようにする。

---

# Scope（Could）

- 既存背景画像の再生成ボタン
- blur placeholder生成
- main visual の軽量版生成
- background prewarm操作
- theme bootstrap cache header調整

---

# Out of Scope

- SPA index.html へのルーム別画像直埋め
- Service Worker
- offline対応
- Cloudflare Images Storage
- 動画背景
- BGM
- 高度な画像編集
- AI画像加工

---

# 完了条件

- 背景画像の軽量版がR2へ保存される
- theme_settings が background display key を保持できる
- 参加者画面が軽量背景を使う
- original背景を初回表示に直接使わない
- backgroundDisplayの初回表示遅延が目立ちにくくなる
- bootstrap APIで初回取得が整理される
- 既存ルームが壊れない
- admin theme settings が壊れない
- build が通る

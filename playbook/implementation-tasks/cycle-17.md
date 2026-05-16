# Cycle-17 Implementation Tasks

## 1. slideshow layout刷新

### 1-1. full viewport layout

slideshow page を：

- width: 100vw
- height: 100vh

前提へ変更する。

背景：
- black

不要な：
- card
- border
- panel
- shadow

などを除去する。

---

### 1-2. image rendering

初期設定：
- object-fit: contain

理由：
- 写真を切らない
- 結婚式写真との相性が良い

必要に応じて将来：
- cover mode

を追加しやすい構造にする。

---

## 2. overlay controls

### 2-1. controls overlay

操作UIを overlay 化する。

表示候補：
- top gradient
- bottom controls

---

### 2-2. auto hide

以下で controls 表示：

- mouse move
- touch
- key input

無操作数秒：
- controls fade out

推奨：
- 2〜4秒

---

### 2-3. hidden state

hidden時：
- opacity 0
- pointer-events none

などで扱う。

---

## 3. preload architecture

### 3-1. preload current/next

最低限 preload：
- current
- next

可能なら：
- next + 1

---

### 3-2. preload方式

Image object を利用して preload する。

current を消す前に：
- next complete
- decode完了

を待つ。

---

### 3-3. failure handling

preload失敗時：
- current を維持
- skip
- retry不要

黒画面を出さない。

---

## 4. crossfade rendering

### 4-1. double layer構成

以下2枚構成へ変更：

- current layer
- next layer

absolute overlay で重ねる。

---

### 4-2. transition

next ready後：

- next opacity 0 → 1
- current opacity 1 → 0

transition完了後：
- current入替

---

### 4-3. duration

推奨：
- 400〜800ms

極端に長くしない。

---

## 5. slideshow state管理

### 5-1. states

最低限：

- currentIndex
- nextIndex
- currentImage
- nextImage
- preloadState
- controlsVisible
- isPlaying

を整理する。

---

### 5-2. timer

現在の切替timerがある場合：

- preload完了後のみ切替

へ変更する。

---

## 6. fullscreen support

### 6-1. Fullscreen API

fullscreen button追加。

対応：
- enter fullscreen
- exit fullscreen

---

### 6-2. keyboard

Esc時：
- fullscreen解除

---

## 7. keyboard support

追加：
- Space
- ArrowRight
- ArrowLeft

---

## 8. touch support

最低限：
- tap → controls表示

可能なら：
- swipe navigation

---

## 9. empty state

画像0件時：

- 黒背景
- シンプル文言

のみ表示。

---

## 10. performance注意

以下を避ける：

- 毎回view-urls大量取得
- preload無限化
- re-render連打
- image flicker

---

## 11. 既存機能確認

壊してはいけない：
- slideshow自動更新
- slideshow設定
- gallery
- upload
- download
- HEIC表示
- 動画除外

---

## 12. 動作確認

### 12-1. slideshow

- fullscreen表示
- controls auto hide
- controls re-show
- autoplay
- pause

---

### 12-2. transition

- 黒画面無し
- preload成功
- crossfade成功
- flicker無し

---

### 12-3. image types

確認：
- jpeg
- png
- webp
- heic(display derivative)

---

### 12-4. long running

長時間表示：
- memory leak無し
- timer暴走無し
- controls不具合無し

---

## 完了条件

- slideshowが映像表示UIになる
- controls auto hide動作
- fullscreen動作
- preload動作
- 黒画面無し
- crossfade成功
- slideshow安定動作
- build成功
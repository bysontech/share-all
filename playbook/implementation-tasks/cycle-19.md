# Cycle-19 Implementation Tasks

## 1. gallery/photos最適化

### 1-1. rendering削減

大量画像時：
- re-render抑制
- memo化
- stable keys

を整理する。

---

### 1-2. lazy rendering

offscreen item を：
- lazy render
- lazy image load

する。

---

### 1-3. image decoding

可能なら：
- decoding="async"
- loading="lazy"

を利用。

---

## 2. slideshow安定化

### 2-1. preload制限

保持数を制限：
- current
- next
- next+1

のみ。

---

### 2-2. timer cleanup

確認：
- interval cleanup
- timeout cleanup
- animation cleanup

---

### 2-3. object cleanup

不要：
- Image object
- blob URL
- event listener

を解放。

---

### 2-4. long running確認

長時間動作：
- 数時間
- 数百枚

でも安定するようにする。

---

## 3. polling最適化

### 3-1. visibility対応

document.hidden 時：
- polling slow
- slideshow pause optional

---

### 3-2. adaptive polling

状況に応じ：
- active: 短め
- idle: 長め

へ変更。

---

### 3-3. duplicate request防止

同時：
- posts fetch
- view-urls fetch

が重複しないようにする。

---

## 4. view-urls cache

### 4-1. reuse

同じURLを毎回取得しない。

TTL内：
- reuse

---

### 4-2. expiration handling

期限切れのみ再取得。

---

### 4-3. batch最適化

必要最小限だけ取得。

---

## 5. upload queue改善

### 5-1. concurrency制御

同時upload数制限。

推奨：
- 2〜4

---

### 5-2. retry整理

retry暴走防止：
- max retry
- exponential backoff

---

### 5-3. memory使用量抑制

大量HEIC時：
- blob保持しすぎない
- convert後即解放

---

## 6. mobile Safari対策

### 6-1. fullscreen

Safari差異吸収。

---

### 6-2. memory対策

大画像：
- preload制限
- object release

---

### 6-3. video

動画previewで：
- autoplay問題
- inline問題

確認。

---

## 7. IntersectionObserver

### 7-1. media visibility

画面外：
- preload停止
- rendering軽減

---

### 7-2. lazy fetch

必要になった時だけ：
- thumbnail fetch
- image decode

---

## 8. network resilience

### 8-1. weak network

弱回線時：
- retry
- graceful degrade

---

### 8-2. offline edge

一時失敗でも：
- UI崩壊しない
- queue維持

---

## 9. instrumentation

最低限：
- console noise削減
- error logging整理

---

## 10. 既存機能確認

壊してはいけない：
- slideshow
- fullscreen slideshow
- upload
- HEIC表示
- video
- download
- admin
- participant保持

---

## 11. 動作確認

### 11-1. 大量画像

- 数百枚
- 長スクロール
- memory確認

---

### 11-2. slideshow

- 数時間動作
- black frame無し
- memory leak無し

---

### 11-3. upload

- 大量HEIC
- 大量JPEG
- 動画

---

### 11-4. Safari

- iPhone Safari
- fullscreen
- upload
- slideshow

---

## 完了条件

- gallery軽量化
- slideshow安定化
- polling最適化
- upload queue安定
- Safari安定化
- memory改善
- build成功
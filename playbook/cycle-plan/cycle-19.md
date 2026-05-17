project: wedding-photo-app
cycle: 19
goal: パフォーマンス最適化・長時間運用安定化・大量メディア耐性改善

## 背景

現在までに：

- slideshow
- fullscreen slideshow
- HEIC対応
- album/photos分離
- videos分離
- participant維持
- admin hardening

など、主要機能は完成した。

次段階では、
「機能追加」よりも：

- 長時間運用
- 大量投稿
- Safari/iPhone
- 弱回線
- 会場利用

への耐性を高める。

---

# 方針

最優先：
- 止まらない
- 重くならない
- 黒画面にならない
- Safariで崩れない
- uploadが詰まらない

機能追加より、
安定化・最適化を優先する。

---

# Scope（Must）

## 1. gallery大量表示最適化

大量画像時でも：

- 初期表示が重くならない
- メモリ使用量が暴走しない

ようにする。

---

## 2. slideshow長時間安定化

長時間表示でも：

- memory leak
- timer drift
- preload増殖
- black frame

が発生しないようにする。

---

## 3. preload/cache最適化

slideshow:
- current
- next
- next+1

程度のみ保持。

無限preload禁止。

---

## 4. polling負荷削減

posts polling を最適化する。

- interval整理
- visibility対応
- backoff
- inactive tab負荷削減

---

## 5. view-urls最適化

不要な view-urls 再取得を減らす。

- URL cache
- TTL reuse
- batch reuse

を整理する。

---

## 6. upload queue安定化

大量アップロード時：
- queue暴走
- memory急増
- retryループ

を防ぐ。

---

## 7. mobile Safari安定化

iPhone Safari で：

- memory crash
- video問題
- fullscreen不整合

を減らす。

---

# Scope（Should）

## 1. virtualized rendering

photos/videos 一覧で：

- virtualization
- incremental rendering

を導入可能なら導入。

---

## 2. IntersectionObserver

offscreen media の：
- preload停止
- lazy load

を行う。

---

## 3. visibility handling

tab非表示時：
- slideshow pause
- polling減速

など。

---

## 4. decode最適化

可能なら：
- HTMLImageElement.decode()
- requestIdleCallback

活用。

---

# Scope（Could）

- SSE検討
- WebSocket検討
- service worker cache
- offline support
- adaptive preload

---

# Out of Scope

- user registration
- cloud sync
- OAuth
- AI機能
- 動画slideshow
- ffmpeg pipeline

---

# 完了条件

- gallery大量表示が軽くなる
- slideshow長時間動作が安定
- polling負荷削減
- view-urls無駄取得削減
- upload queue安定
- Safariで致命的不具合が減る
- memory leak が改善
- build が通る
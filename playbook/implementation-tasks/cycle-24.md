# Cycle-24 Implementation Tasks

## 1. Migration

rooms または room_settings に追加。

推奨：

- event_mode TEXT
- slideshow_open_at TEXT
- slideshow_close_at TEXT
- gallery_open_at TEXT
- video_open_at TEXT

---

## 2. Room Mode判定

有効状態：

- draft
- event_live
- archive

不正値は event_live 扱い。

---

## 3. Mode解決処理

優先順位：

手動設定
↓
時間設定
↓
デフォルト

---

## 4. API制御

### slideshow upload

許可：

event_live

拒否：

draft
archive

---

### photo upload

許可：

archive

拒否：

draft
event_live

---

### video upload

許可：

archive

拒否：

draft
event_live

---

## 5. APIレスポンス

Room情報へ追加。

例：

{
  "eventMode": "event_live",
  "nextTransitionAt": "..."
}

---

## 6. bootstrap API

追加：

eventMode

返却。

---

## 7. Participant UI

### draft

表示：

「現在準備中です」

---

### event_live

表示：

- スライドショー投稿
- スライドショー閲覧

非表示：

- 写真共有
- 動画共有

説明文：

「写真・動画共有は披露宴終了後に開放されます」

---

### archive

表示：

- 写真共有
- 動画共有
- 写真閲覧
- 動画閲覧

表示：

「スライドショー投稿は終了しました」

---

## 8. Admin UI

追加：

現在状態

- draft
- event_live
- archive

---

追加：

手動切替

- 準備中
- 披露宴中
- 終了後

---

追加：

スケジュール設定

- slideshow_open_at
- slideshow_close_at
- gallery_open_at
- video_open_at

---

## 9. Worker防御確認

確認：

API直叩きで

- slideshow
- photo
- video

投稿できないこと。

---

## 10. 動作確認

### draft

投稿不可

---

### event_live

スライドショーのみ投稿可

---

### archive

写真・動画投稿可

---

### 管理画面

手動切替確認

---

### 自動切替

時刻到達確認

---

## 完了条件

- migration追加
- mode判定実装
- bootstrap返却
- UI切替
- API制御
- 管理画面設定
- build成功
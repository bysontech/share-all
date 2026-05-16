project: wedding-photo-app
cycle: 18
goal: 投稿用途分離・メディア閲覧分離・スライドショー投稿上限制御

## 背景

現在は：

- 写真投稿
- スライドショー表示
- アルバム共有
- 動画投稿

の役割が参加者目線では曖昧になっている。

また、
- スライドショーへ大量投稿される
- 写真と動画が混在する
- 会場表示向け投稿と共有アルバム用途が分離されていない

という課題がある。

そのため、投稿用途を明確に分離し、
参加者が迷わないUIへ整理する。

---

# 方針

投稿用途を分離する。

- スライドショー投稿
- 写真共有投稿
- 動画投稿

を別導線にする。

また、
- 写真一覧
- 動画一覧

も分離する。

---

# Scope（Must）

## 1. 投稿用途分離

参加者画面で以下を分離する。

### スライドショー用写真投稿

用途：
- 会場モニター表示

制限：
- 画像のみ
- 1人10枚まで

特徴：
- slideshow対象
- slideshow derivative生成

---

### 共有アルバム写真投稿

用途：
- 後から保存・共有

制限：
- 画像のみ

特徴：
- slideshow対象外
- gallery/photos表示

---

### 動画投稿

用途：
- 動画共有

制限：
- 動画のみ

特徴：
- slideshow対象外
- videos画面表示

---

## 2. 閲覧画面分離

以下を分離する。

### 写真一覧

/room/:roomId/photos

対象：
- album用画像

---

### 動画一覧

/room/:roomId/videos

対象：
- video投稿

---

### slideshow

/room/:roomId/slideshow

対象：
- slideshow用途画像のみ

---

## 3. slideshow投稿上限

1 participant あたり：

- 最大10枚

に制限する。

---

## 4. participant識別維持

participant_id を維持し：

- 自分の投稿
- slideshow投稿数

を識別する。

localStorage前提でよい。

---

# Scope（Should）

## 1. slideshow投稿数表示

例：
- 3 / 10 枚

---

## 2. slideshow説明表示

例：
- 会場スクリーンに表示されます
- 最大10枚まで

---

## 3. 動画説明

例：
- 動画はスライドショーには表示されません

---

# Scope（Could）

- slideshow投稿削除
- slideshow投稿並び替え
- slideshow favorites
- slideshow moderation

---

# Out of Scope

- user registration
- account system
- OAuth
- cloud sync
- multi device sync
- slideshow AI selection

---

# 完了条件

- 投稿導線が3種類に分離される
- 写真一覧と動画一覧が分離される
- slideshowがslideshow用途のみ表示する
- participantごとの10枚制限が動く
- gallery/download/upload が壊れていない
- build が通る
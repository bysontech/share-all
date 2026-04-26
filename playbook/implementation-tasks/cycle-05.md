# Cycle-05 Implementation Tasks

## 1. ルーティング
- /room/:roomId/gallery を追加

---

## 2. ギャラリー画面

### 2-1. 投稿取得
- 既存API GET /posts を使用
- uploaded + visible のみ表示

---

### 2-2. グリッドUI
- 画像一覧表示
- 2〜3列（モバイル）
- object-fit: cover

---

## 3. 選択機能

### state
- selectedPostIds: Set<string>

### 操作
- クリックでtoggle
- 全選択
- 全解除

---

## 4. 保存状態管理

### localStorage
key:
room:{roomId}:savedPostIds

- ダウンロード成功時に追加
- 初期ロード時に復元

---

## 5. ダウンロード処理

### 5-1. URL取得
POST /posts/view-urls

- 選択postIdsを送信

---

### 5-2. ダウンロード実行
- 1件ずつダウンロード
- awaitで直列処理

---

### 5-3. 保存処理
- 成功時 savedPostIds に追加

---

## 6. 未保存フィルタ

### 判定
- savedPostIds に含まれていないもの

### ボタン
- 未保存のみ選択
- 未保存のみダウンロード

---

## 7. UI

- 選択状態：枠 or チェック
- 保存済み：バッジ表示
- ダウンロードボタン3種
  - 選択
  - 全部
  - 未保存

---

## 8. 導線変更

- 参加者画面：
  スライドショーボタン削除
  ↓
  ギャラリーボタン追加

---

## 9. エラー対応

- 個別DL失敗 → スキップ
- 全体は止めない

---

## 10. 完了条件

- ギャラリー表示
- 選択できる
- ダウンロードできる
- 保存状態維持
- 既存機能が壊れていない
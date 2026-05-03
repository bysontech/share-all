project: wedding-photo-app
cycle: 10
goal: 表示用WebP導入と参加者単位のフィルタ（自分の投稿除外 / 未保存）を追加

## Scope（Must）

### 1. participant_id の導入
- 参加者端末ごとに UUID を生成
- localStorage に保存（例：room:{roomId}:participantId）
- 投稿時に participant_id を送信・保存

---

### 2. 画像の表示用WebP生成（ブラウザ側）
- アップロード前に WebP を生成（canvas / createImageBitmap など）
- オリジナル（そのまま）と表示用WebPの両方をR2へアップロード
- 失敗時はフォールバック（オリジナルのみ）

---

### 3. データモデル拡張
- posts に以下を追加（新規のみ）
  - display_file_key（WebP）
  - display_mime_type（image/webp）
  - participant_id
- 既存データはそのまま（後方互換）

---

### 4. 表示ロジックの切替
- ギャラリー・参加者表示・サムネは display_file_key を優先
- 無い場合は file_key を使用（フォールバック）

---

### 5. フィルタ機能（ギャラリー）
- フィルタ追加：
  - すべて
  - 自分以外
  - 未保存
  - 自分以外かつ未保存
- participant_id と savedPostIds を利用

---

## Scope（Should）

- WebP品質調整（例：0.7〜0.85）
- 画像サイズ縮小（長辺上限を設定、例：2048px）
- HEIC読込不可時のユーザー案内

---

## Scope（Could）

- サムネイル（小サイズWebP）の追加
- 画像枚数が多い場合の仮想リスト

---

## Out of Scope

- サーバー側画像変換
- HEICのサーバー変換
- ZIPダウンロード
- 動画対応（cycle-11で実施）
- 既存データの再変換

---

## 完了条件

- 新規アップロードで display_file_key が保存される
- ギャラリーが WebP（display）で表示される
- display が無い既存データも表示できる
- participant_id が保存される
- 「自分以外」「未保存」などのフィルタが機能する
- 既存機能（アップロード・管理・ギャラリー・DL）が壊れていない
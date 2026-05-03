# Cycle-10 Implementation Tasks

## 1. participant_id

### 1-1. 生成と保存
- 初回アクセス時に UUID を生成
- localStorage に保存
  - key: room:{roomId}:participantId

### 1-2. 投稿時に送信
- upload-url / complete フローに participant_id を付与

---

## 2. 画像のWebP生成（フロント）

### 2-1. 生成処理
- createImageBitmap または Image を使用して読み込み
- canvas に描画し toBlob('image/webp', quality) で生成

### 2-2. サイズ制御（任意）
- 長辺上限（例：2048px）でリサイズ

### 2-3. フォールバック
- 変換失敗時は WebP を生成せず、オリジナルのみアップロード

---

## 3. アップロードフロー拡張

### 3-1. オリジナル
- 既存フローでアップロード（file_key）

### 3-2. 表示用WebP
- 別の upload-url を取得（type: display など）
- R2へPUT

### 3-3. complete時
- display_file_key を含めて登録

---

## 4. API変更（最小限）

- upload-url に type パラメータ追加（original / display）
- posts テーブルへ display_file_key, display_mime_type, participant_id を保存
- レスポンスに participant_id を含める（必要に応じて）

---

## 5. 表示ロジック

### 5-1. 画像表示
- display_file_key があればそれを使用
- 無ければ file_key を使用

### 5-2. viewUrl取得
- display_file_key を優先してまとめて取得
- 既存のキャッシュを活用

---

## 6. フィルタ実装（ギャラリー）

### 6-1. 状態
- currentFilter: 'all' | 'others' | 'unsaved' | 'others_unsaved'

### 6-2. 条件
- others: post.participant_id !== selfId
- unsaved: !savedPostIds.includes(post.id)
- 組み合わせ対応

### 6-3. UI
- フィルタボタン or セグメントコントロール

---

## 7. 例外処理

- HEIC読み込み失敗 → オリジナルのみ
- WebP生成失敗 → オリジナルのみ
- participant_id が無い既存データ → others扱いにする

---

## 8. 確認

### 8-1. 新規投稿
- display_file_key が保存される
- participant_id が保存される

### 8-2. 表示
- WebPが優先表示される
- 既存データも表示できる

### 8-3. フィルタ
- 自分以外が正しく除外される
- 未保存が正しく判定される

---

## 完了条件

- WebP表示が有効
- フォールバックが機能する
- participant_idが機能する
- フィルタが正しく動作する
- buildが通る
- 既存機能が壊れていない
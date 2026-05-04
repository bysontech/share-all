project: wedding-photo-app
cycle: 11
goal: 派生メディア（derivatives）モデル導入と表示ロジックの安定化（HEIC・動画対応の基盤構築）

## Scope（Must）

### 1. 派生メディアモデル導入
- display_file_key を posts から切り離す
- 新規テーブル media_derivatives を導入
- 表示用・サムネ・将来拡張を統一管理する

---

### 2. 表示ロジックの再設計
- original を直接表示しない
- 表示可能な派生（display_image）がある場合のみ表示
- 無い場合は「表示準備中」UIを出す

---

### 3. HEICフォールバック修正
- display が無い HEIC を壊れ画像として表示しない
- placeholder またはメッセージ表示に変更

---

### 4. 動画対応の基盤追加
- file_type = video を正式サポート
- ギャラリーに動画カードを表示
- 再生はしない（今回は対象外）

---

### 5. 新規投稿フロー修正
- display は posts に直接保存しない
- WebP生成成功時のみ derivatives に登録
- original は常に保存

---

## Scope（Should）

- display_status（pending / ready / failed）導入
- UIで状態に応じた表示切替
- フィルタと共存できる設計

---

## Scope（Could）

- サムネイル（thumbnail）用 type 追加
- 動画用 placeholder 改善
- 表示準備中の軽いローディング演出

---

## Out of Scope

- サーバー側画像変換
- HEIC完全対応
- Cloudflare Images導入（次サイクル）
- 動画再生
- 動画サムネ生成
- ZIPダウンロード

---

## 完了条件

- media_derivatives テーブルが導入されている
- 新規投稿で display が derivatives に登録される
- display が無い投稿でも画面が壊れない
- HEIC投稿が壊れ画像にならない
- 動画投稿がギャラリーで識別できる
- 既存機能が壊れていない
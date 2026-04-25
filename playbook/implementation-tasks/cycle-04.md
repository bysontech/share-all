# Cycle 04 Implementation Tasks — Wedding Theme / 参加者画面リッチ化

## Goal

管理者が設定したテーマ画像・メッセージを参加者画面に反映し、結婚式らしいリッチな体験にする。スライドショーは投稿写真を一面表示するシンプル構成を維持する。

---

## 0. 作業開始前

- main の最新を pull する
- 現在の差分を確認する
- build が通ることを確認する
- Cycle-01〜03の主要導線を壊さない前提で作業する

---

## 1. DBマイグレーション

### 1-1. theme_settings テーブル追加

以下のようなテーブルを追加する。

CREATE TABLE theme_settings (
  room_id TEXT PRIMARY KEY,
  title TEXT,
  message TEXT,
  main_visual_key TEXT,
  background_image_key TEXT,
  theme_color TEXT,
  animation_mode TEXT NOT NULL DEFAULT 'none',
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (room_id) REFERENCES rooms(id)
);

### 1-2. 初期値方針

- theme_settings が存在しない場合はAPI側で空設定として扱う
- 既存ルームに対して手動バックフィルは不要

---

## 2. API実装

### 2-1. テーマ取得API

GET /api/rooms/:roomId/theme

要件：
- roomId の存在確認
- expires_at の検証
- theme_settings がない場合は空設定を返す
- 参加者画面から利用できる

返却例：
- title
- message
- mainVisualKey の有無
- backgroundImageKey の有無
- themeColor
- animationMode

注意：
- R2の恒久URLは返さない
- 表示用URLは別APIで扱う

---

### 2-2. テーマ更新API

PUT /api/rooms/:roomId/theme

要件：
- X-Host-Token を検証
- title / message / themeColor / animationMode を保存
- mainVisualKey / backgroundImageKey も必要に応じて更新
- upsert で扱う
- updated_at を更新

バリデーション：
- animation_mode は none / fade / float のみ
- theme_color は未指定可
- 長すぎるtitle/messageは制限する

---

### 2-3. テーマ画像アップロードURL発行API

POST /api/rooms/:roomId/theme/upload-url

要件：
- X-Host-Token を検証
- 画像のみ許可
- image/jpeg, image/png, image/webp を許可
- 最大サイズは 10MB 程度
- purpose を受け取る
  - main_visual
  - background
- R2の署名付きPUT URLを返す
- fileKey を返す

保存先例：
- {roomId}/theme/main-visual.{ext}
- {roomId}/theme/background.{ext}

---

### 2-4. テーマ画像表示URL発行API

POST /api/rooms/:roomId/theme/view-urls

要件：
- room の有効期限を検証
- theme_settings の file_key をもとに署名付きGET URLを返す
- mainVisualUrl / backgroundImageUrl を返す
- 未設定の場合は null を返す

---

## 3. 管理画面実装

### 3-1. テーマ設定セクション追加

/admin/:roomId に追加する。

項目：
- タイトル入力
- メッセージ入力
- メインビジュアル画像選択
- 背景画像選択
- テーマカラー入力
- アニメーションモード選択
- 保存ボタン

---

### 3-2. テーマ画像アップロード処理

画像選択後または保存時に以下を実行する。

1. theme/upload-url を呼ぶ
2. R2へPUT
3. 取得した fileKey を theme 更新APIへ渡す
4. 保存完了を表示

注意：
- APIサーバーへ画像本体を送らない
- 失敗時はエラー表示する
- 既存の投稿アップロード処理と混同しない

---

### 3-3. 簡易プレビュー

管理画面内で現在の設定を簡易プレビューする。

- 背景画像
- メインビジュアル
- タイトル
- メッセージ
- テーマカラー

完璧な見た目再現は不要。

---

## 4. 参加者画面実装

### 4-1. テーマ取得

/room/:roomId 表示時に theme API を取得する。

- テーマ設定
- テーマ画像viewUrl

を取得して画面に反映する。

---

### 4-2. リッチUI反映

参加者画面を結婚式向けに改善する。

反映内容：
- 背景画像
- 背景オーバーレイ
- メインビジュアル
- タイトル
- メッセージ
- テーマカラー
- 投稿カードUI改善
- アップロードボタン改善

注意：
- 投稿導線を邪魔しない
- スマホで見やすくする
- テーマ未設定でも自然な見た目にする

---

### 4-3. アニメーションモード

animation_mode に応じて軽い表現を入れる。

- none: アニメーションなし
- fade: 初期表示時に軽くフェード
- float: メインビジュアルをゆっくり浮遊

注意：
- 過剰に動かさない
- パフォーマンスを優先する

---

## 5. スライドショー維持・微修正

### 5-1. 方針

スライドショーは投稿写真が主役。

以下はやらない：
- 背景画像表示
- メインビジュアル表示
- 装飾画像表示
- テーマによる過剰なUI追加

### 5-2. 必要なら微修正

- 投稿画像を画面いっぱいに表示
- object-fit: contain または cover の挙動を確認
- フェード切替を自然にする
- 画像0件時の空状態を壊さない

---

## 6. 回帰確認

以下を確認する。

- ルーム作成できる
- 参加者が入室できる
- 複数画像アップロードできる
- 投稿一覧が更新される
- スライドショーが動く
- 管理者ログインできる
- 投稿を非表示にできる
- 投稿を削除できる
- テーマ設定を保存できる
- テーマ画像が参加者画面に表示される
- build が通る

---

## 7. 完了条件

- theme_settings テーブルが追加されている
- 管理画面でテーマを保存できる
- 管理画面でテーマ画像をアップロードできる
- 参加者画面にテーマが反映される
- スライドショーはシンプルな一面表示のまま維持されている
- 既存機能が壊れていない
- build が通る

---

## 8. スコープ外

- 動画背景
- 複数テーマ管理
- ドラッグ&ドロップ配置
- 細かいフォント編集
- スライドショー装飾
- AI画像生成
- 高度なアニメーション
- ダウンロード機能

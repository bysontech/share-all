project: wedding-photo-app
cycle: 09
goal: file_keyの拡張子正規化とダウンロードファイル名の整形

## Scope（Must）

### 1. file_keyの拡張子正規化
- mime_type から拡張子を決定する
- file_key を正しい拡張子で生成する

例：
- image/jpeg → .jpg
- image/png → .png
- image/webp → .webp
- image/heic → .heic

---

### 2. ダウンロードファイル名の整形
- ダウンロード時のファイル名をユーザーに分かりやすい形式に変更

フォーマット：
wedding_{nickname}_{yyyyMMdd_HHmmss}_{postId短縮}.{ext}

---

### 3. nicknameのサニタイズ
- ファイル名に使える文字に制限する
- 空白・記号・絵文字を除去または置換

---

### 4. createdAtの利用
- 投稿日時からファイル名を生成する
- タイムゾーンを統一（ローカル or UTC）

---

### 5. 既存データの扱い
- 既存のfile_keyはそのままでOK
- 新規アップロード分のみ適用

---

## Scope（Should）

- 拡張子の小文字統一
- 不正mime_typeのフォールバック（.binなど）

---

## Scope（Could）

- room名をファイル名に含める
- 管理者向け命名ルール設定

---

## Out of Scope

- 画像変換（JPEG統一）
- HEIC変換
- ZIP生成
- 既存データのリネーム
- 動画対応

---

## 完了条件

- 新規アップロードのfile_keyが正しい拡張子になる
- ダウンロード時のファイル名が整形される
- nicknameが安全にファイル名へ反映される
- 既存機能が壊れていない
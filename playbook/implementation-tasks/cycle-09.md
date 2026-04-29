# Cycle-09 Implementation Tasks

## 1. 拡張子マッピング

### 1-1. MIME → 拡張子変換関数作成

例：

image/jpeg → jpg  
image/png → png  
image/webp → webp  
image/heic → heic  

---

### 1-2. upload-url生成処理修正

- file_key生成時に拡張子を使用
- postId + ext の形式にする

例：
{roomId}/images/{postId}.jpg

---

## 2. ダウンロードファイル名生成

### 2-1. フォーマット関数作成

wedding_{nickname}_{yyyyMMdd_HHmmss}_{postId8}.{ext}

---

### 2-2. nicknameサニタイズ

処理：
- 英数字 + 一部記号のみ許可
- その他は削除 or _
- 長さ制限（例：20文字）

---

### 2-3. 日時フォーマット

createdAt → yyyyMMdd_HHmmss

---

## 3. ダウンロード処理修正

### 3-1. anchorダウンロード

- download属性に整形ファイル名を設定

または

### 3-2. Content-Disposition利用

- attachment; filename="..." を設定

※ フロント実装でOK

---

## 4. ギャラリー画面修正

- ダウンロード時に新ファイル名を使用
- 保存後の状態管理はそのまま

---

## 5. 例外処理

- mime_type不明 → .bin
- nicknameなし → "guest"
- createdAtなし → 現在時刻

---

## 6. 確認

### 6-1. アップロード
- file_keyに正しい拡張子が付く

---

### 6-2. ダウンロード
- ファイル名が分かりやすい
- OSで正常に開ける

---

### 6-3. 回帰確認
- ギャラリー
- 管理画面
- アップロード
- viewUrl取得

---

## 完了条件

- file_keyが正しい拡張子になる
- ダウンロードファイル名が整形される
- ファイルが正常に開ける
- buildが通る
- 既存機能が壊れていない
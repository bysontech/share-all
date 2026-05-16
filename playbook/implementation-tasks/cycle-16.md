# Cycle-16 Implementation Tasks

## 1. 公開トップページ

### 1-1. / の役割変更

現在の管理者ログイン画面を / から分離する。

/ は以下を表示：

- サービス紹介
- 結婚式向け写真共有説明
- 招待URLから参加する旨
- シンプルなLP

管理者導線は表示しない。

---

### 1-2. UI

最低限でよい：

- Hero
- 説明
- 利用イメージ
- スマホ向け最適化

SEO対策は不要。

---

## 2. 管理者入口URL

### 2-1. route追加

追加例：

/internal/:token

token は path param。

---

### 2-2. token検証

環境変数：

- ADMIN_ENTRY_TOKEN_HASH
- ADMIN_ENTRY_SESSION_SECRET
- ADMIN_ENTRY_SESSION_MAX_AGE

token を hash 化し、
ADMIN_ENTRY_TOKEN_HASH と比較する。

---

### 2-3. token不一致

以下で統一：

- 404 を返す
- login存在を匂わせない

401/403より404優先。

---

### 2-4. token一致

処理：

1. admin entry cookie 発行
2. /admin/login へ redirect

---

## 3. admin entry cookie

### 3-1. Cookie仕様

- HttpOnly
- Secure
- SameSite=Lax
- Path=/
- Max-Age短め

推奨：
- 10〜30分

---

### 3-2. Cookie署名

ADMIN_ENTRY_SESSION_SECRET で署名する。

改ざん検知必須。

---

## 4. /admin/login 保護

### 4-1. guard追加

/admin/login 表示前に：

- admin entry cookie 確認
- 署名確認

失敗時：
- 404

成功時：
- login画面表示

---

### 4-2. login後

既存の admin session は維持。

つまり：

入口認証
+
password login

の二段階。

---

## 5. admin route hardening

### 5-1. 対象

最低限：

- /admin/login
- /admin
- 管理者トップ

で admin entry cookie を要求する。

---

### 5-2. 管理者sessionとの関係

entry cookie と admin session は別物として扱う。

entry：
- login入口

admin session：
- 実ログイン状態

---

## 6. robots.txt

### 6-1. 追加

以下を追加：

Disallow: /admin
Disallow: /internal

---

## 7. フロント側調整

### 7-1. login画面URL

現在 / にある場合：

/admin/login へ移動。

---

### 7-2. 未許可アクセス

/admin/login を直接開いた場合：

- 404画面
- または Not Found

---

## 8. 環境変数

追加：

- ADMIN_ENTRY_TOKEN_HASH
- ADMIN_ENTRY_SESSION_SECRET
- ADMIN_ENTRY_SESSION_MAX_AGE

---

## 9. token生成

READMEまたは運用メモに記載：

推奨生成：

openssl rand -hex 32

---

## 10. 動作確認

### 10-1. 公開トップ

- / が表示される
- 管理導線が見えない

---

### 10-2. token route

- 正常token → loginへ
- 異常token → 404

---

### 10-3. login guard

- cookie無し → 404
- cookie有り → login表示

---

### 10-4. admin login

- cycle-15 の認証が動く
- login/logout動作
- room管理動作

---

### 10-5. participant flow

- 招待URL参加
- upload
- gallery
- slideshow
- download

が壊れていない。

---

## 完了条件

- / が公開トップになる
- 管理導線が公開されていない
- token route 経由のみ login到達可能
- 404で秘匿される
- admin entry cookie が動く
- cycle-15認証が壊れていない
- participant導線が壊れていない
- build成功
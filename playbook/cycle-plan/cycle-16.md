project: wedding-photo-app
cycle: 16
goal: 管理者入口秘匿・admin route hardening・公開トップページ導入

## 背景

cycle-15で管理者ログイン・管理者トップ・ルーム管理機能を導入した。

しかし現状では：
- /admin/login が推測可能
- botやクローラーが管理画面へ到達できる可能性がある
- 公開トップページが存在しない
- 管理者入口と一般公開導線が混在している

そのため、管理者入口を秘匿し、
一般公開トップと管理者導線を分離する。

---

# 方針

- / は公開トップページにする
- 管理者ログイン画面は直接公開しない
- 特殊トークンURL経由のみ管理者ログインへ到達可能にする
- token通過後のみ admin login へアクセス可能
- tokenは長いランダム値にする
- 管理者ログイン自体はcycle-15のsessionを維持する

---

# Scope（Must）

## 1. 公開トップページ導入

https://share-photo.bysontech.jp/

を公開トップページにする。

内容：
- サービス説明
- 結婚式写真共有サービス説明
- 「招待URLから参加してください」
- シンプルなLP風UI

管理者ログイン導線は表示しない。

---

## 2. 管理者入口秘匿

管理者入口URLを追加する。

例：
/internal/<secret-token>

要件：
- token一致時のみ管理者入口sessionを発行
- token不一致時は404
- 成功時は /admin/login へ redirect

---

## 3. admin entry session

token通過済みsessionをCookieで保持する。

要件：
- HttpOnly
- Secure
- SameSite=Lax
- 短めのTTL
- 署名付き

---

## 4. /admin/login 保護

/admin/login へ直接アクセスした場合：

- admin entry session 無し → 404
- admin entry session 有り → ログイン画面表示

---

## 5. /admin route hardening

/admin/* 系ルートで、
最低限の入口session確認を追加する。

対象：
- /admin/login
- /admin
- 管理者トップ
- 将来的な admin routes

---

## 6. robots.txt

以下を追加する。

Disallow:
- /admin
- /internal

---

# Scope（Should）

## 1. token access logging

以下を記録する。

- token一致成功
- token失敗
- timestamp

過剰なログは不要。

---

## 2. token rate limiting 軽減

同一IPから大量失敗時に、
簡易抑制できる構造を持てるようにする。

本格rate limitは不要。

---

## 3. token rotationしやすい構造

環境変数変更だけでtoken更新可能にする。

---

# Scope（Could）

- Cloudflare Turnstile
- Cloudflare Access
- Zero Trust
- 国制限
- IP allowlist

---

# Out of Scope

- OAuth
- MFA
- WAF tuning
- 本格的なIDS
- 高度なbot対策
- performance optimization
- gallery optimization

---

# 完了条件

- / が公開トップページになる
- 管理者ログイン導線が公開されていない
- /internal/<token> 経由でのみ login 到達可能
- token不一致で404
- /admin/login 直アクセスで404
- token通過後のみ login画面表示
- cycle-15 の管理者認証が壊れていない
- 参加者URL導線が壊れていない
- build が通る
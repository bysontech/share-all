project: wedding-photo-app
cycle: 20
goal: 固定公開URL・secret path・本番ルームリダイレクト導入

## 背景

本番運用では、QRコードやスタッフ向けURLを先に印刷・共有したい。
ただし、room_id は将来差し替える可能性があるため、QRコードに直接 room_id を含めると運用リスクがある。

また、参加者用ページやスライドショーURLは、完全な認証までは不要だが、雑なクローラー・偶然アクセス・推測アクセスは避けたい。

そのため、固定URL + secret path + 404 conceal により、軽い保護を持つ本番導線を追加する。

---

# 方針

参加者用：
- /wedding/:token

会場スライドショー用：
- /wedding/live/:token

それぞれ token を検証し、一致した場合のみ本番roomへ redirect する。

不一致の場合は 404 を返す。

API認証やセッション発行は今回は行わない。

---

# Scope（Must）

## 1. 参加者用固定URL

以下のURLを追加する。

/wedding/:token

成功時：
- /room/:roomId へ redirect

失敗時：
- 404

---

## 2. スライドショー用固定URL

以下のURLを追加する。

/wedding/live/:token

成功時：
- /room/:roomId/slideshow へ redirect

失敗時：
- 404

---

## 3. 環境変数によるroom切替

本番room_idは環境変数で管理する。

例：
- PUBLIC_WEDDING_ROOM_ID

これにより、QRコードURLを変えずに redirect 先roomを差し替えられるようにする。

---

## 4. token hash検証

tokenは平文保存しない。

環境変数：
- PUBLIC_WEDDING_ENTRY_TOKEN_HASH
- PUBLIC_WEDDING_LIVE_TOKEN_HASH

処理：
- path token をhash化
- envのhashと比較
- 一致すればredirect
- 不一致なら404

---

## 5. 404 conceal

不正アクセス時は以下を守る。

- 401/403ではなく404
- 管理者用やroomの存在を匂わせない
- エラー詳細を返さない

---

# Scope（Should）

## 1. token生成メモ

運用メモまたはREADMEに token生成方法を記載する。

例：
openssl rand -hex 24

---

## 2. 本番確認手順

以下の確認手順を残す。

- /wedding/:validToken が roomへ飛ぶ
- /wedding/:invalidToken が404
- /wedding/live/:validToken が slideshowへ飛ぶ
- /wedding/live/:invalidToken が404

---

## 3. robots.txt

以下をDisallowする。

- /wedding
- /internal
- /admin

ただし、robots.txtはセキュリティ機能ではなく、補助扱い。

---

# Scope（Could）

- slug → room_id mappingをDB化
- 複数イベント対応
- token rotate UI
- 管理画面から固定URL確認
- QRコード生成UI

---

# Out of Scope

- API認証
- 参加者セッション発行
- ユーザー登録
- OAuth
- Cloudflare Access
- 本格rate limit
- QRコード生成UI
- 印刷用PDF生成

---

# 完了条件

- /wedding/:token で参加者roomへredirectできる
- /wedding/live/:token でslideshowへredirectできる
- token不一致時は404になる
- room_idを環境変数で差し替えできる
- tokenはhashで検証される
- 既存の /room/:roomId 導線が壊れていない
- 既存の /room/:roomId/slideshow が壊れていない
- build が通る

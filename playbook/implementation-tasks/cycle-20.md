# Cycle-20 Implementation Tasks

## 1. 環境変数追加

Worker側に以下を追加する。

- PUBLIC_WEDDING_ROOM_ID
- PUBLIC_WEDDING_ENTRY_TOKEN_HASH
- PUBLIC_WEDDING_LIVE_TOKEN_HASH

注意：
- token平文はコードに書かない
- hashのみ環境変数に置く
- 本番はwrangler secretまたは環境変数で設定
- ローカルは .dev.vars で管理

---

## 2. token hash関数

### 2-1. hash処理

path tokenをhash化し、envのhashと比較する。

推奨：
- SHA-256

---

### 2-2. 比較処理

可能なら timing-safe な比較を行う。
難しければ、最低限通常比較でよい。

---

## 3. 参加者固定URL route

### 3-1. route追加

追加：

GET /wedding/:token

処理：
1. token取得
2. token hash検証
3. PUBLIC_WEDDING_ENTRY_TOKEN_HASH と比較
4. 一致すれば /room/:roomId へ redirect
5. 不一致なら404

---

### 3-2. redirect先

redirect先：

/room/{PUBLIC_WEDDING_ROOM_ID}

absolute URLでもrelative URLでもよいが、本番ドメインで動作すること。

---

## 4. slideshow固定URL route

### 4-1. route追加

追加：

GET /wedding/live/:token

処理：
1. token取得
2. token hash検証
3. PUBLIC_WEDDING_LIVE_TOKEN_HASH と比較
4. 一致すれば /room/:roomId/slideshow へ redirect
5. 不一致なら404

---

### 4-2. redirect先

redirect先：

/room/{PUBLIC_WEDDING_ROOM_ID}/slideshow

---

## 5. 404 conceal

不一致時：
- 404
- Not Found
- 詳細メッセージなし

禁止：
- invalid token
- unauthorized
- forbidden
- admin
- wedding room exists

などの情報を返さない。

---

## 6. ルーティング順序

以下に注意する。

- /wedding/live/:token が /wedding/:token より先に評価されること
- /room/:roomId 既存routeを壊さないこと
- Pages側SPA fallbackとの競合に注意すること
- Worker routeが /wedding/* を処理できること

---

## 7. robots.txt

可能なら robots.txt を更新する。

Disallow:
- /wedding
- /internal
- /admin

---

## 8. 運用メモ

READMEまたはdocsに以下を記載する。

### token生成

openssl rand -hex 24

### hash生成

実装に合わせた方法を記載する。

### 本番設定

- PUBLIC_WEDDING_ROOM_ID
- PUBLIC_WEDDING_ENTRY_TOKEN_HASH
- PUBLIC_WEDDING_LIVE_TOKEN_HASH

---

## 9. 動作確認

### 9-1. 参加者URL

- valid token → /room/:roomId
- invalid token → 404

---

### 9-2. slideshow URL

- valid token → /room/:roomId/slideshow
- invalid token → 404

---

### 9-3. 既存導線

以下が壊れていないこと。

- /room/:roomId
- /room/:roomId/photos
- /room/:roomId/videos
- /room/:roomId/slideshow
- /admin
- /internal admin entry

---

## 10. 完了条件

- 固定参加者URLが動く
- 固定slideshow URLが動く
- 不正tokenは404
- room_id差し替え可能
- token平文がコードにない
- build成功

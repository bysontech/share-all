# Wedding URL Setup

固定公開URLを使ったQRコード運用のための設定手順。

## URL構成

| 用途 | URL | リダイレクト先 |
|------|-----|--------------|
| 参加者（QRコード・席札） | `/wedding/:token` | `/room/:roomId` |
| スライドショー（会場モニター） | `/wedding/live/:token` | `/room/:roomId/slideshow` |

tokenが一致しない場合は404を返します（存在自体を隠蔽）。

---

## トークン・ハッシュ生成手順

### 1. トークン生成

```bash
openssl rand -hex 24
```

出力例：`a3f8c2d1e9b74056f2a1c8d3e7f0b592a4d6e8f1c2b3a4d5`

参加者用・スライドショー用の2種類を生成してください。

### 2. ハッシュ生成（Node.js）

```js
const crypto = require('crypto');
const token = 'ここにトークンを貼り付ける';
const hash = crypto.createHash('sha256').update(token).digest('hex');
console.log(hash);
```

または1行で：

```bash
echo -n 'YOUR_TOKEN_HERE' | openssl dgst -sha256 -hex | awk '{print $2}'
```

---

## 環境変数設定

### wrangler.toml（非シークレット）

`PUBLIC_WEDDING_ROOM_ID` はシークレットでないため `[vars]` に直接書けます。

```toml
[vars]
PUBLIC_WEDDING_ROOM_ID = "your-room-id-here"
```

### wrangler secret（シークレット）

ハッシュ値は `wrangler secret put` で設定してください。

```bash
# 参加者URLのトークンハッシュ
wrangler secret put PUBLIC_WEDDING_ENTRY_TOKEN_HASH

# スライドショーURLのトークンハッシュ
wrangler secret put PUBLIC_WEDDING_LIVE_TOKEN_HASH
```

プロンプトにハッシュ値を貼り付けて Enter。

### ローカル開発（.dev.vars）

```
PUBLIC_WEDDING_ROOM_ID=your-room-id-here
PUBLIC_WEDDING_ENTRY_TOKEN_HASH=sha256hexhashhere
PUBLIC_WEDDING_LIVE_TOKEN_HASH=sha256hexhashhere
```

---

## QRコードURL例

本番ドメインが `https://share-photo-api.bysontech.jp` の場合：

- 参加者QR: `https://share-photo-api.bysontech.jp/wedding/<token>`
- モニター用: `https://share-photo-api.bysontech.jp/wedding/live/<token>`

---

## room_id変更時の対応

`PUBLIC_WEDDING_ROOM_ID` を新しいroom_idに変更するだけで、
QRコードURL（`/wedding/*`）を印刷し直す必要はありません。

---

## セキュリティ備考

- token平文はコードに記録しない
- token hashのみサーバーに保存
- 不一致・未設定時は常に404（情報漏洩なし）
- robots.txt で `/wedding` をDisallow（補助手段）
- 本格認証（Cloudflare Access等）は別途検討

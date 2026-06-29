Cycle 27: 大容量動画アップロード（Multipart Upload対応）

背景

現在の動画アップロードはDirect PUT方式を採用しており、最大900MBまで対応している。

しかし、高画質動画（1GB〜数GB）のアップロード需要が確認された。

既存の写真・通常動画アップロードは安定して稼働しているため、それらを変更せず、新たにMultipart Upload方式を追加する。

Cloudflare R2 Multipart Uploadを利用することで、大容量動画の安定したアップロードを実現する。

⸻

ゴール

既存アップロード機能へ影響を与えず、

* 大容量動画専用アップロード導線を追加
* Multipart Upload対応
* 最大5GBまで対応
* Part単位リトライ
* 進捗表示
* キャンセル対応

を実現する。

⸻

ユーザー価値

通常利用者

* 今まで通り利用可能

大容量動画利用者

* 1GB以上でも安定してアップロード可能
* 通信失敗時もPart単位でリトライ
* アップロード進捗が確認できる

⸻

スコープ

In Scope

* Multipart Upload API追加
* 大容量動画アップロードボタン追加
* Multipart Upload Hook追加
* Progress表示
* Cancel対応
* Retry対応

Out of Scope

* Resume Upload
* uploadId永続化
* Service Worker
* Background Upload
* 動画変換
* 動画圧縮
* ZIPダウンロード改善

⸻

UI方針

動画投稿画面に通常アップロードとは別に追加する。

例

通常動画

* 動画をアップロード

大容量動画

* 大容量動画をアップロード
* （推奨：高画質動画・通信が不安定な場合）

900MB以下でも利用可能とする。

これにより利用者は容量に関係なくMultipart Uploadを選択できる。

⸻

技術方針

既存アップロード

変更しない。

対象

* 写真
* 通常動画

従来のDirect PUTを維持する。

⸻

Multipart Upload

新規実装。

対象

* 大容量動画ボタン

専用Hookで処理する。

⸻

Worker

追加API

* multipart開始
* Part署名URL取得
* Multipart Complete
* Multipart Abort

既存upload-url APIは変更しない。

⸻

Frontend

新規

useMultipartUpload()

追加。

既存useUploadQueueとは分離する。

⸻

Multipart仕様

Partサイズ

100MB

並列数

4

Retry

Part単位

最大3回

Cancel

Abort Multipart Upload実行

⸻

サイズ制限

新規環境変数

MAX_LARGE_VIDEO_SIZE_MB

既定

5000MB

コードへ固定値を書かない。

⸻

Complete

Multipart Upload完了後は、

既存

POST /complete

を利用する。

DB登録

upload_status

サムネイル生成

既存フローを流用する。

⸻

ダウンロード

変更なし。

アップロード方法のみ変更する。

⸻

完了条件

* 写真アップロードに影響なし
* 通常動画アップロードに影響なし
* 大容量動画ボタン追加
* Multipart Upload成功
* Part Retry成功
* Cancel成功
* Complete成功
* 最大5GB対応
* Build成功
* TypeCheck成功

⸻

リスク

中

Multipart Upload API追加

対策

既存APIを変更せず新規追加。

⸻

中

大容量通信

対策

Part Retry

Progress表示

Abort対応

⸻

優先順位

1. Worker Multipart API
2. Frontend Hook
3. Progress
4. Retry
5. Cancel
6. UI調整
Cycle 27 実装タスク

Task 1

Multipart Upload API追加

Worker

追加

* Start Multipart
* Get Part Upload URL
* Complete Multipart
* Abort Multipart

完了条件

4API動作確認

⸻

Task 2

Multipart Upload Hook追加

新規

frontend/src/hooks/useMultipartUpload.ts

実装

* Upload開始
* Chunk分割
* 並列Upload
* Retry
* Complete

⸻

Task 3

Chunk Upload実装

Partサイズ

100MB

並列

4

Retry

3回

完了条件

Part Upload成功

⸻

Task 4

Progress表示

表示

* アップロード中
* 現在サイズ
* 総サイズ
* %
* 完了

完了条件

Progress更新確認

⸻

Task 5

Cancel実装

途中キャンセル

↓

Abort Multipart Upload

完了条件

途中終了確認

⸻

Task 6

UI追加

動画投稿画面

追加

通常

* 動画をアップロード

新規

* 大容量動画をアップロード

説明

高画質動画・大容量動画はこちら

900MB以下でも利用可能

⸻

Task 7

サイズ制限

環境変数追加

MAX_LARGE_VIDEO_SIZE_MB

既定

5000MB

完了条件

制限確認

⸻

Task 8

Complete連携

Multipart Upload完了後

既存

POST /complete

呼び出し

完了条件

DB登録

サムネイル生成

既存通り動作

⸻

Task 9

既存影響確認

写真

* Upload

通常動画

* Upload

管理画面

* 動作確認

スライドショー

* 動作確認

影響なし確認

⸻

Task 10

大容量動画確認

確認サイズ

* 900MB
* 1GB
* 2GB
* 5GB以内

通信途中切断

Retry確認

Cancel確認

Complete確認

⸻

Task 11

品質確認

実行

npm run build
npx tsc --noEmit

完了条件

Build成功

TypeCheck成功

⸻

非対象

今回は実施しない。

* Resume Upload
* uploadId永続化
* Background Upload
* 動画変換
* 動画圧縮
* ZIP改善
* Service Worker
* オフライン対応
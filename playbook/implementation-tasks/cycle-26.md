playbook/implementation-tasks/cycle-26.md

Cycle 26 実装タスク

Task 1: 端末判定ユーティリティ追加

目的

スマホとPCで保存UXを分岐する。

実装

新規作成

frontend/src/utils/device.ts

追加

isMobileDevice()
isDesktopDevice()

完了条件

* iPhone判定
* iPad判定
* Android判定
* Desktop判定

⸻

Task 2: スマホ複数保存UI無効化

対象

* PhotosPage
* GalleryPage

実装

スマホ時：

* 複数選択保存ボタン非表示
* 一括保存UI非表示

完了条件

スマホで複数保存導線が表示されない

⸻

Task 3: 写真保存導線改善

対象

* PhotosPage
* GalleryPage

実装

写真詳細表示時：

保存説明を追加

例：

写真を開いて共有または保存してください

可能であれば：

navigator.share()

利用

完了条件

写真保存方法がユーザーに伝わる

⸻

Task 4: 動画保存説明追加

対象

* VideosPage

実装

説明表示

例：

動画は端末によってファイル保存になる場合があります

完了条件

保存方法が明示される

⸻

Task 5: JSZip導入

実装

npm install jszip

完了条件

ビルド成功

⸻

Task 6: PC ZIP保存実装

対象

* PhotosPage
* GalleryPage

条件

10〜100枚

処理

1. view-url取得
2. fetch blob
3. ZIP追加
4. ZIP生成
5. download

完了条件

10枚以上でZIP保存される

⸻

Task 7: ZIP制限実装

条件

101枚以上

実装

エラー表示

例：

一度に保存できる写真は100枚までです

完了条件

制限が機能する

⸻

Task 8: 動作確認

PC

確認ケース

* 1枚
* 5枚
* 10枚
* 30枚
* 100枚

スマホ

確認ケース

* Safari
* Chrome iOS

完了条件

各ケースで期待動作

⸻

Task 9: 品質確認

実行

npm run build
npx tsc --noEmit

完了条件

エラーなし

⸻

非対象

今回は実施しない

* 動画ZIP
* 動画複数保存
* サーバーZIP生成
* 保存済み同期
* 保存履歴管理
* 管理者エクスポート
Cycle-25 Implementation Tasks

1. 現状分析

現在のスライドショー取得処理を確認する。

把握：

* 投稿取得方法
* 並び順
* キャッシュ方法

⸻

2. Fresh Pool作成

対象：

created_at >= now - 30min

⸻

3. Archive Pool作成

対象：

それ以前

⸻

4. 表示アルゴリズム

基本比率：

70% Fresh

30% Archive

⸻

例

表示候補生成：

Freshから抽選

↓

Archiveから抽選

↓

統合

⸻

5. 重複防止

保持：

recentlyDisplayedIds

例：

50件

⸻

表示済みは候補から除外。

⸻

6. 同一ユーザー抑制

保持：

recentParticipantIds

例：

直近3件

⸻

同一participant連続回避。

⸻

7. フォールバック

Fresh不足時：

Archiveで補完。

⸻

Archive不足時：

Freshで補完。

⸻

8. 状態保持

ブラウザメモリで管理。

DB不要。

⸻

9. 動作確認

ケース1

投稿10件

⸻

ケース2

投稿100件

⸻

ケース3

新規投稿直後

⸻

ケース4

同一ユーザー大量投稿

⸻

ケース5

Fresh Pool空

⸻

完了条件

* Fresh Pool実装
* 70/30表示
* 同一ユーザー抑制
* 重複抑制
* build成功
project: wedding-photo-app
cycle: 13
goal: メディア用途分離（display / slideshow / thumbnail）とアルバムUX改善

## 背景

現在は「表示用画像（display_image）」のみを扱っている。

しかし実際には用途が異なる：

- ギャラリー一覧
- スライドショー全画面表示
- 動画カード
- 保存用オリジナル

これらを同じ画像で兼用すると、
表示品質・読み込み速度・UX・変換戦略が衝突する。

そのため、media_derivatives を用途別に整理し、
アップロード・表示・保存体験を分離する。

---

# Scope（Must）

## 1. media_derivatives の用途整理

以下の derivative type を正式化する。

- display_image
  - ギャラリー表示用
  - 軽量表示向け

- slideshow_image
  - 全画面スライドショー向け
  - 高品質寄り
  - 表示最適化

- thumbnail
  - 一覧表示用
  - 動画カード用
  - 軽量優先

---

## 2. ギャラリー UX 改善

### 選択モード ON/OFF

選択モード OFF：
- 画像タップで1枚表示
- 左右スワイプ
- 保存ボタン

選択モード ON：
- 複数選択
- 全選択
- 未保存のみ
- 自分以外のみ
- 一括保存

---

## 3. スライドショー専用表示最適化

スライドショーは slideshow_image を使用する。

要件：
- 全画面表示
- display_image を使わない
- 画像のみ対象
- 動画は除外

---

## 4. アップロード完了 UX 改善

ユーザー体験を改善する。

方針：
- original 保存成功時点で投稿成功扱い
- derivative 生成は裏で継続
- 「表示準備中」UIを自然化

---

## 5. 動画対応の土台強化

動画投稿の扱いを正式化。

今回は：
- 動画カード表示
- thumbnail があれば表示
- 無ければ placeholder
- 保存は可能

動画再生は対象外。

---

# Scope（Should）

## 1. slideshow_image の生成

display_image より高品質な派生を生成。

例：
- width=2048
- quality高め

---

## 2. thumbnail の導入

画像：
- 小型 thumbnail を使用

動画：
- 将来サムネ対応前提の placeholder

---

## 3. アップロード状態表示

- アップロード中
- 表示準備中
- 完了

を分離。

---

# Scope（Could）

- スライドショー演出改善
- Ken Burns風演出
- フェード演出
- 動画サムネ生成（クライアント）
- preload最適化

---

# Out of Scope

- 動画再生
- 動画変換
- ffmpeg
- Cloudflare Stream
- ZIP生成
- AI画像解析
- 永続公開

---

# 完了条件

- media_derivatives の用途が整理される
- slideshow が slideshow_image を使う
- ギャラリーUXが改善される
- 選択モードON/OFFが動く
- preview表示ができる
- アップロード後のUXが改善される
- 動画カード表示が安定する
- buildが通る
- 既存機能が壊れていない
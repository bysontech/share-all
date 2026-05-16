project: wedding-photo-app
cycle: 17
goal: スライドショーを全画面視聴UIへ改善し、黒画面無しのクロスフェード表示へ変更

## 背景

現在のスライドショーページは：

- プレビュー画面寄りUI
- 操作UIが常時見えている
- 画像切替時に黒画面が発生する
- 次画像ロード待ちが見えてしまう

結婚式会場で大型モニター表示する用途では、
「操作画面」ではなく「映像表示体験」に寄せたい。

Netflix / YouTube のような、
全画面視聴型UIへ改善する。

---

# 方針

- スライドショーは「映像表示」を最優先
- UIは通常非表示
- マウス移動・タップ時のみ操作UI表示
- 黒画面を無くす
- 次画像は事前ロード
- クロスフェードで即時切替
- 動画は引き続き対象外

---

# Scope（Must）

## 1. 全画面表示UI

スライドショーを全画面表示前提UIにする。

要件：
- 背景は黒
- 画像を最大表示
- 余計なカードUIを削除
- 余白最小化
- object-fit は contain を初期採用
- フルスクリーンモード対応

---

## 2. 操作UIの自動表示/非表示

通常時：
- UI非表示

マウス移動 / タップ：
- UI表示

数秒無操作：
- UI自動非表示

表示対象：
- 戻る
- 前へ
- 次へ
- 再生/停止
- フルスクリーン
- 現在枚数

---

## 3. クロスフェード切替

画像切替時：
- 黒画面を出さない
- current image を残したまま next image を preload
- preload完了後フェード切替
- current/next を重ねて transition

---

## 4. preload改善

最低限：
- 現在画像
- 次画像

可能なら：
- 次の次画像

まで preload する。

---

## 5. 切替タイミング改善

切替中に：
- loading spinner
- 黒背景のみ

を見せない。

---

## 6. 空状態

画像0件時のみ：
- シンプルな待機表示

を出す。

---

# Scope（Should）

## 1. キーボード操作

- Space：再生/停止
- ArrowRight：次
- ArrowLeft：前
- Esc：fullscreen解除

---

## 2. タッチ操作

- タップでUI表示
- スワイプで前後移動

---

## 3. スムーズtransition

transition候補：
- cross dissolve
- opacity fade

duration：
- 300ms〜1000ms程度

---

# Scope（Could）

- Ken Burns効果
- 軽いzoom演出
- 表示速度設定
- contain/cover切替
- BGM

---

# Out of Scope

- 動画再生
- 動画スライドショー
- ffmpeg
- Stream
- コメント表示
- リアルタイムチャット
- 複雑アニメーション
- 3D演出

---

# 完了条件

- スライドショーが全画面UIになる
- UIが通常時非表示になる
- 操作時のみUI表示される
- 黒画面が発生しない
- 次画像をpreloadする
- クロスフェードで切替される
- slideshowが重くなりすぎない
- gallery/upload/download が壊れていない
- build が通る
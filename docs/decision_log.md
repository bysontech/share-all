# Decision Log (軽量ADR)

重要な技術選定や設計判断を記録する。後から「なぜそうしたか」を追跡できるようにする。

---

## テンプレート

新しい決定を記録する際は、以下のフォーマットを使用:

```markdown
## [YYYY-MM-DD] 決定タイトル

**Context:** なぜこの決定が必要になったか

**Decision:** 何を選んだか

**Options considered:**
- Option A: ...
- Option B: ...
- Option C: ...

**Rationale:** なぜその選択をしたか

**Consequences:**
- Positive: ...
- Negative: ...
- Follow-up: ...
```

---

## 記録

### [2025-XX-XX] テンプレC リポジトリの目的を「設計書リポ」に限定

**Context:** テンプレCをどのような形で管理するか決める必要があった。実装コードを含めるか、設計書のみにするか。

**Decision:** 実装コードは含めず、設計書・運用ガイドのみを管理する。

**Options considered:**
- Option A: 実装コード（Workers + D1）を含む完全なテンプレート
- Option B: 設計書のみ。技術選定はプロジェクトごとに行う

**Rationale:**
- テンプレCは「常用しない」位置づけ。昇格時にしか参照しない
- 技術選定（Supabase/Firebase/D1等）はプロジェクトの要件で変わる
- 実装コードをメンテし続けるコストを避けたい

**Consequences:**
- Positive: メンテコスト削減、技術選定の柔軟性確保
- Negative: 実装時の参照コードがない
- Follow-up: 必要なら別途、技術別のサンプルリポを作成

---

### [YYYY-MM-DD] 技術スタック選定（プロジェクト名: ____）

**Context:** B->C 昇格が決定し、技術スタックを選定する必要がある

**Decision:** (例: Supabase + Supabase Auth を採用)

**Options considered:**
- Option A: Cloudflare Workers + D1 + Lucia Auth
- Option B: Supabase (PostgreSQL + Auth)
- Option C: Firebase (Firestore + Firebase Auth)

**Rationale:**
- (選定理由を記載)

**Consequences:**
- Positive: ...
- Negative: ...
- Follow-up: ...

---

## 記録のガイドライン

### 記録すべき決定

- 技術スタックの選定（API、DB、認証、ホスティング）
- アーキテクチャの方針変更
- 差し替えポイント以外の拡張を行う場合
- セキュリティに関わる決定

### 記録しなくてよい決定

- ライブラリのバージョンアップ
- 軽微なリファクタリング
- バグ修正

### 書き方のコツ

- **Context** は「なぜ今この決定が必要か」を簡潔に
- **Options considered** は2-3個に絞る（検討しすぎない）
- **Rationale** は箇条書きで具体的に
- **Consequences** は正直に（デメリットも書く）

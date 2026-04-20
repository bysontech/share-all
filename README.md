# Template C: B->C 昇格ルート設計書

## 1. Purpose / Positioning

このリポジトリは **設計書リポ** であり、実装コードは含まない。

**テンプレCの位置づけ:**
- テンプレCは"常用しない"
- テンプレB（クライアント完結PWA）が成長し、サーバー機能が必要になったときの「昇格先の型」を文書で固定する
- 技術選定はここでは確定しない。あくまで「設計の型」と「移行手順」を定義する

**テンプレの階層:**
```
Template A: 静的サイト（HTML/CSS のみ）
Template B: クライアント完結 PWA（IndexedDB/Dexie、認証なし）
Template C: サーバー連携アプリ（API + DB + 認証）← このリポが対象
```

---

## 2. When to promote (B -> C)

昇格は **必要になるまで行わない**。以下のいずれかが発生したときのみ検討する。

### 昇格トリガー
| トリガー | 具体例 |
|---------|--------|
| データ共有 | 複数端末・複数ユーザーで同じデータを参照したい |
| サーバー処理 | 課金、外部API連携、重いバッチ処理 |
| 認証・権限 | ログインが必要、ユーザーごとに見える範囲を制限したい |
| データ永続性 | ブラウザストレージでは消失リスクが高い |

### 昇格しない例
- 「いつかマルチユーザーにするかも」→ Bのまま
- 「バックアップが欲しい」→ エクスポート機能で対応
- 「PWAが遅い」→ まずB側で最適化

詳細: [docs/promotion_criteria.md](docs/promotion_criteria.md)

---

## 3. Fixed replacement points

差し替えポイントは **2つだけ** に限定する。これ以上増やさない。

### 1) データ層
| B (現状) | C (昇格後) |
|----------|------------|
| IndexedDB / Dexie | API + サーバーDB |
| ローカル完結 | リモート同期 |

### 2) 認証
| B (現状) | C (昇格後) |
|----------|------------|
| なし / ローカル識別子 | ログイン + セッション管理 |
| 権限チェックなし | ロールベース権限 |

**UI層は変えない** — Repository interface を通じてデータ層を差し替えることで、画面コンポーネントはそのまま維持する。

---

## 4. B-side design rules

テンプレBで **最初から** 守るべき設計ルール。これにより、将来Cへの移行がスムーズになる。

### 必須: Repository interface
```typescript
// B側で最初から定義しておく
interface TaskRepository {
  getAll(): Promise<Task[]>;
  getById(id: string): Promise<Task | null>;
  create(task: CreateTaskInput): Promise<Task>;
  update(id: string, task: UpdateTaskInput): Promise<Task>;
  delete(id: string): Promise<void>;
}
```
- UIコンポーネントはこのインターフェース経由でデータにアクセスする
- 実装は `LocalTaskRepository`（Dexie）から始め、昇格時に `ApiTaskRepository` に差し替える

### 必須: Auth injection point
```typescript
// B側では空実装でOK
interface AuthContext {
  userId: string | null;
  isAuthenticated: boolean;
  permissions: string[];
}

// 画面側は AuthContext を受け取る形で書く
function TaskList({ auth }: { auth: AuthContext }) { ... }
```

### 必須: Data mapping layer
- ローカルスキーマとリモートスキーマの変換レイヤーを想定しておく
- IDの形式（UUID vs 連番）、日付の形式などを変換できる余地を残す

詳細: [docs/repository_contract.md](docs/repository_contract.md), [docs/auth_contract.md](docs/auth_contract.md)

---

## 5. C-side responsibilities

Cへ昇格すると、以下の責務が追加される。B側には存在しない。

| 責務 | 説明 |
|------|------|
| API設計 | REST or GraphQL。エンドポイント設計、エラーハンドリング |
| DB設計 | スキーマ、マイグレーション、インデックス |
| 認証・認可 | ログイン、セッション、権限チェック |
| Webhook/外部連携 | 課金システム、通知サービスとの連携 |
| 運用 | ログ、監視、バックアップ、スケーリング |

**注意:** これらはB側では実装しない。昇格が決まってから設計する。

---

## 6. Candidate stack (not fixed)

技術選定はこのリポでは **確定しない**。プロジェクトごとに選択する。

### API + DB 候補
| 候補 | 特徴 | 適したケース |
|------|------|-------------|
| Cloudflare Workers + D1 | 低コスト、エッジ | 軽量API、グローバル配信 |
| Supabase | PostgreSQL + Auth 統合 | 中規模、リアルタイム同期 |
| Firebase | NoSQL、モバイル親和性 | モバイル中心、素早い立ち上げ |
| 自前 (Node + PostgreSQL) | 柔軟性 | 大規模、特殊要件 |

### 認証候補
| 候補 | 特徴 |
|------|------|
| Supabase Auth | DB一体型 |
| Firebase Auth | ソーシャルログイン容易 |
| Auth0 / Clerk | エンタープライズ向け |
| 自前 (Lucia等) | 完全制御 |

**選定の記録は** [docs/decision_log.md](docs/decision_log.md) に残す。

---

## 7. Promotion checklist

B->C 昇格時のチェックリスト。

### 事前確認
- [ ] 本当に昇格が必要か？（トリガーを再確認）
- [ ] B側で Repository interface が実装済みか？
- [ ] B側で Auth injection point が準備済みか？

### 移行作業
- [ ] 技術スタックを選定し、decision_log.md に記録
- [ ] DBスキーマを設計
- [ ] APIエンドポイントを実装
- [ ] `ApiTaskRepository` を実装
- [ ] 認証を実装
- [ ] ローカルデータの移行スクリプトを作成（必要なら）
- [ ] E2Eテストを追加

### 完了確認
- [ ] UIが変わらず動作する
- [ ] 認証フローが動作する
- [ ] データの読み書きがサーバー経由で動作する

詳細: [docs/migration_b_to_c.md](docs/migration_b_to_c.md)

---

## 8. How to use this repo

このリポの使い方:

1. **昇格を検討するとき**: このREADMEと `docs/promotion_criteria.md` を読み、本当に必要か判断
2. **B側を設計するとき**: `docs/repository_contract.md`, `docs/auth_contract.md` を参照し、昇格可能な設計を維持
3. **昇格を実行するとき**: `docs/migration_b_to_c.md` の手順に従う
4. **技術選定したとき**: `docs/decision_log.md` に記録を残す

### ファイル構成
```
README.md                     # このファイル（全体概要）
docs/
  promotion_criteria.md       # 昇格基準の詳細
  migration_b_to_c.md         # B->C移行手順
  repository_contract.md      # Repository interface設計指針
  auth_contract.md            # 認証の設計指針
  decision_log.md             # 技術選定の記録
```

---

## License

(プロジェクトに応じて記載)

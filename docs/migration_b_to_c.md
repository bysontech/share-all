# B -> C 移行手順 (Migration Guide)

このドキュメントでは、テンプレBからテンプレCへの移行手順を説明する。差し替えポイントは **データ層** と **認証** の2つに限定する。

---

## 移行の原則

1. **UIは変えない** — Repository interface を通じた差し替えにより、画面コンポーネントは維持
2. **段階的に移行** — 一度にすべてを変えない。データ層→認証の順で進める
3. **ローカルとリモートの併用期間を設ける** — いきなり切り替えず、フォールバック可能にする

---

## Phase 1: 事前準備（B側）

### 1.1 Repository interface の確認

B側で以下が実装されていることを確認:

```typescript
// src/repositories/TaskRepository.ts
interface TaskRepository {
  getAll(): Promise<Task[]>;
  getById(id: string): Promise<Task | null>;
  create(task: CreateTaskInput): Promise<Task>;
  update(id: string, task: UpdateTaskInput): Promise<Task>;
  delete(id: string): Promise<void>;
}
```

**確認項目:**
- [ ] UIコンポーネントが直接 Dexie を呼んでいない
- [ ] すべてのデータ操作が Repository 経由

### 1.2 Auth injection point の確認

```typescript
// src/contexts/AuthContext.ts
interface AuthContext {
  userId: string | null;
  isAuthenticated: boolean;
  permissions: string[];
}
```

**確認項目:**
- [ ] 権限チェックが必要な箇所で AuthContext を参照している
- [ ] B側では常に `{ userId: 'local', isAuthenticated: false, permissions: [] }` を返す

### 1.3 エクスポート機能の確認

- [ ] ローカルデータを JSON でエクスポートできる
- [ ] 移行後のインポート用スクリプトが書ける形式

---

## Phase 2: サーバー側構築

### 2.1 技術スタック選定

`docs/decision_log.md` に記録しながら選定:

- API: (Workers / Supabase / Firebase / 自前)
- DB: (D1 / PostgreSQL / Firestore / 自前)
- 認証: (Supabase Auth / Firebase Auth / Auth0 / 自前)

### 2.2 DBスキーマ設計

**ローカルスキーマとの対応を明確にする:**

```sql
-- 例: tasks テーブル
CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  completed BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);
```

**注意点:**
- ローカルのIDとサーバーのIDのマッピング方法を決める
- `user_id` カラムを追加（Bにはなかった）

### 2.3 API エンドポイント設計

Repository interface に対応するエンドポイント:

| Method | Path | Repository method |
|--------|------|-------------------|
| GET | /api/tasks | getAll() |
| GET | /api/tasks/:id | getById(id) |
| POST | /api/tasks | create(input) |
| PUT | /api/tasks/:id | update(id, input) |
| DELETE | /api/tasks/:id | delete(id) |

---

## Phase 3: データ層の差し替え

### 3.1 ApiRepository の実装

```typescript
// src/repositories/ApiTaskRepository.ts
class ApiTaskRepository implements TaskRepository {
  constructor(private apiClient: ApiClient) {}

  async getAll(): Promise<Task[]> {
    const response = await this.apiClient.get('/api/tasks');
    return response.data.map(toLocalTask);
  }

  async getById(id: string): Promise<Task | null> {
    const response = await this.apiClient.get(`/api/tasks/${id}`);
    return response.data ? toLocalTask(response.data) : null;
  }

  // ... 他のメソッド
}
```

### 3.2 Repository の切り替え

```typescript
// src/di/container.ts
function createRepository(authContext: AuthContext): TaskRepository {
  if (authContext.isAuthenticated) {
    return new ApiTaskRepository(apiClient);
  }
  return new LocalTaskRepository(); // フォールバック
}
```

### 3.3 データマッピング

```typescript
// src/mappers/taskMapper.ts
function toLocalTask(serverTask: ServerTask): Task {
  return {
    id: serverTask.id,
    title: serverTask.title,
    completed: serverTask.completed,
    createdAt: new Date(serverTask.created_at),
  };
}

function toServerTask(localTask: Task): ServerTaskInput {
  return {
    title: localTask.title,
    completed: localTask.completed,
  };
}
```

---

## Phase 4: 認証の追加

### 4.1 認証プロバイダーの実装

```typescript
// src/auth/AuthProvider.tsx
function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    // 選定した認証サービスのセッション確認
    const session = await authService.getSession();
    setUser(session?.user ?? null);
  }, []);

  const authContext: AuthContext = {
    userId: user?.id ?? null,
    isAuthenticated: !!user,
    permissions: user?.permissions ?? [],
  };

  return (
    <AuthContextProvider value={authContext}>
      {children}
    </AuthContextProvider>
  );
}
```

### 4.2 ログイン/ログアウト UI

- [ ] ログインページを追加
- [ ] ログアウトボタンを追加
- [ ] 未認証時のリダイレクト

### 4.3 APIリクエストへの認証情報付与

```typescript
// src/api/apiClient.ts
const apiClient = {
  async get(path: string) {
    const token = await authService.getToken();
    return fetch(path, {
      headers: { Authorization: `Bearer ${token}` },
    });
  },
  // ...
};
```

---

## Phase 5: データ移行（オプション）

既存ユーザーのローカルデータをサーバーに移行する場合:

### 5.1 移行フロー

```
1. ユーザーがログイン
2. ローカルにデータがあるか確認
3. 「ローカルデータをアップロードしますか？」と確認
4. 同意したらAPIで一括アップロード
5. ローカルデータを削除（または保持）
```

### 5.2 コンフリクト解決

- サーバーに既にデータがある場合の方針を決める
  - マージ / ローカル優先 / サーバー優先 / ユーザー選択

---

## 移行チェックリスト

### Phase 1 完了
- [ ] Repository interface 確認済み
- [ ] Auth injection point 確認済み
- [ ] エクスポート機能動作確認

### Phase 2 完了
- [ ] 技術スタック選定・記録済み
- [ ] DBスキーマ設計済み
- [ ] APIエンドポイント実装済み

### Phase 3 完了
- [ ] ApiRepository 実装済み
- [ ] Repository 切り替えロジック実装済み
- [ ] データマッピング実装済み
- [ ] フォールバック動作確認

### Phase 4 完了
- [ ] 認証プロバイダー実装済み
- [ ] ログイン/ログアウト UI 実装済み
- [ ] API認証動作確認

### Phase 5 完了（該当する場合）
- [ ] 移行フロー実装済み
- [ ] コンフリクト解決方針決定・実装済み

### 最終確認
- [ ] UIが変わらず動作する
- [ ] 認証フローが正常に動作する
- [ ] データの読み書きがサーバー経由で動作する
- [ ] E2Eテストがパスする

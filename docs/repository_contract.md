# Repository Interface 設計指針

このドキュメントでは、B->C 昇格を見据えた Repository interface の設計指針を示す。B側で最初からこの設計に従うことで、昇格時のUI変更を最小化できる。

---

## 基本原則

### 1. UIコンポーネントはインターフェース経由でアクセスする

**NG:** 直接 Dexie を呼ぶ

```typescript
// NG: UIから直接Dexieを呼んでいる
function TaskList() {
  const tasks = useLiveQuery(() => db.tasks.toArray());
  // ...
}
```

**OK:** Repository 経由でアクセス

```typescript
// OK: Repository経由
function TaskList() {
  const { taskRepository } = useRepositories();
  const [tasks, setTasks] = useState<Task[]>([]);

  useEffect(() => {
    taskRepository.getAll().then(setTasks);
  }, []);
  // ...
}
```

### 2. インターフェースは Promise ベース

同期的なローカルアクセスでも、Promise を返す設計にする。これにより、非同期のAPI呼び出しに差し替え可能になる。

```typescript
interface TaskRepository {
  // NG: 同期的
  // getAllSync(): Task[];

  // OK: Promise ベース
  getAll(): Promise<Task[]>;
}
```

### 3. ドメインモデルを使う

Repository の入出力はドメインモデルを使い、ストレージ固有の型は内部に隠蔽する。

```typescript
// ドメインモデル（UI層で使う）
interface Task {
  id: string;
  title: string;
  completed: boolean;
  createdAt: Date;
}

// ストレージモデル（Repository内部でのみ使う）
interface DexieTask {
  id?: number;  // Dexie の auto-increment
  title: string;
  completed: boolean;
  createdAt: string;  // ISO文字列
}
```

---

## 標準インターフェース

### 基本 CRUD

```typescript
interface Repository<T, CreateInput, UpdateInput> {
  getAll(): Promise<T[]>;
  getById(id: string): Promise<T | null>;
  create(input: CreateInput): Promise<T>;
  update(id: string, input: UpdateInput): Promise<T>;
  delete(id: string): Promise<void>;
}
```

### 拡張メソッド

必要に応じて追加。ただし、あまり複雑にしない。

```typescript
interface TaskRepository extends Repository<Task, CreateTaskInput, UpdateTaskInput> {
  // フィルタリング
  getByStatus(completed: boolean): Promise<Task[]>;

  // 検索
  search(query: string): Promise<Task[]>;

  // バッチ操作（必要な場合のみ）
  createMany(inputs: CreateTaskInput[]): Promise<Task[]>;
  deleteMany(ids: string[]): Promise<void>;
}
```

---

## 実装パターン

### B側: LocalRepository

```typescript
class LocalTaskRepository implements TaskRepository {
  constructor(private db: DexieDatabase) {}

  async getAll(): Promise<Task[]> {
    const dexieTasks = await this.db.tasks.toArray();
    return dexieTasks.map(toDomainTask);
  }

  async getById(id: string): Promise<Task | null> {
    const dexieTask = await this.db.tasks.get(parseInt(id, 10));
    return dexieTask ? toDomainTask(dexieTask) : null;
  }

  async create(input: CreateTaskInput): Promise<Task> {
    const dexieTask: DexieTask = {
      title: input.title,
      completed: false,
      createdAt: new Date().toISOString(),
    };
    const id = await this.db.tasks.add(dexieTask);
    return toDomainTask({ ...dexieTask, id });
  }

  async update(id: string, input: UpdateTaskInput): Promise<Task> {
    await this.db.tasks.update(parseInt(id, 10), {
      ...input,
      updatedAt: new Date().toISOString(),
    });
    const updated = await this.getById(id);
    if (!updated) throw new Error('Task not found');
    return updated;
  }

  async delete(id: string): Promise<void> {
    await this.db.tasks.delete(parseInt(id, 10));
  }
}
```

### C側: ApiRepository

```typescript
class ApiTaskRepository implements TaskRepository {
  constructor(private apiClient: ApiClient) {}

  async getAll(): Promise<Task[]> {
    const response = await this.apiClient.get<ServerTask[]>('/api/tasks');
    return response.map(toDomainTask);
  }

  async getById(id: string): Promise<Task | null> {
    try {
      const response = await this.apiClient.get<ServerTask>(`/api/tasks/${id}`);
      return toDomainTask(response);
    } catch (e) {
      if (isNotFoundError(e)) return null;
      throw e;
    }
  }

  async create(input: CreateTaskInput): Promise<Task> {
    const response = await this.apiClient.post<ServerTask>('/api/tasks', input);
    return toDomainTask(response);
  }

  async update(id: string, input: UpdateTaskInput): Promise<Task> {
    const response = await this.apiClient.put<ServerTask>(`/api/tasks/${id}`, input);
    return toDomainTask(response);
  }

  async delete(id: string): Promise<void> {
    await this.apiClient.delete(`/api/tasks/${id}`);
  }
}
```

---

## DI（依存性注入）

### React Context を使う例

```typescript
// src/contexts/RepositoryContext.tsx
interface Repositories {
  taskRepository: TaskRepository;
  // 他のリポジトリ...
}

const RepositoryContext = createContext<Repositories | null>(null);

export function RepositoryProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();

  const repositories: Repositories = useMemo(() => {
    if (isAuthenticated) {
      return {
        taskRepository: new ApiTaskRepository(apiClient),
      };
    }
    return {
      taskRepository: new LocalTaskRepository(db),
    };
  }, [isAuthenticated]);

  return (
    <RepositoryContext.Provider value={repositories}>
      {children}
    </RepositoryContext.Provider>
  );
}

export function useRepositories(): Repositories {
  const ctx = useContext(RepositoryContext);
  if (!ctx) throw new Error('RepositoryProvider not found');
  return ctx;
}
```

### 使用側

```typescript
function TaskList() {
  const { taskRepository } = useRepositories();
  const [tasks, setTasks] = useState<Task[]>([]);

  useEffect(() => {
    taskRepository.getAll().then(setTasks);
  }, [taskRepository]);

  // ... UIは変わらない
}
```

---

## ID の扱い

### 問題

- B側: Dexie の auto-increment (number)
- C側: サーバーの UUID (string)

### 解決策

**ドメインモデルでは string を使う:**

```typescript
interface Task {
  id: string;  // 常に string
  // ...
}
```

**LocalRepository での変換:**

```typescript
function toDomainTask(dexieTask: DexieTask): Task {
  return {
    id: String(dexieTask.id),  // number -> string
    // ...
  };
}
```

---

## エラーハンドリング

### Repository 層で発生しうるエラー

```typescript
class RepositoryError extends Error {
  constructor(
    message: string,
    public code: 'NOT_FOUND' | 'CONFLICT' | 'NETWORK' | 'UNKNOWN'
  ) {
    super(message);
  }
}
```

### UI層での扱い

```typescript
async function handleDelete(id: string) {
  try {
    await taskRepository.delete(id);
    // 成功処理
  } catch (e) {
    if (e instanceof RepositoryError) {
      if (e.code === 'NOT_FOUND') {
        // 既に削除されていた
      } else if (e.code === 'NETWORK') {
        // オフライン？リトライ？
      }
    }
    // エラー表示
  }
}
```

---

## チェックリスト

B側で Repository interface を実装する際のチェックリスト:

- [ ] UIコンポーネントから直接 Dexie を呼んでいない
- [ ] すべてのメソッドが Promise を返す
- [ ] ドメインモデルを定義し、ストレージ固有の型は Repository 内部に隠蔽
- [ ] ID は string として扱っている
- [ ] DI（Context等）で Repository を注入している
- [ ] エラーハンドリングの方針を決めている

# 認証設計指針 (Auth Contract)

このドキュメントでは、B->C 昇格を見据えた認証の設計指針を示す。B側では認証は不要だが、「認証が入る場所」を準備しておくことで、昇格時のUI変更を最小化できる。

---

## 基本原則

### 1. AuthContext を注入可能にする

UIコンポーネントは AuthContext を受け取る形で設計し、認証の有無に関わらず動作するようにする。

```typescript
interface AuthContext {
  userId: string | null;
  isAuthenticated: boolean;
  permissions: string[];
}
```

### 2. B側では「常に未認証」を返す

B側では、固定値を返す AuthProvider を用意:

```typescript
// B側の実装
const defaultAuthContext: AuthContext = {
  userId: 'local-user',  // ローカル識別子
  isAuthenticated: false,
  permissions: [],
};
```

### 3. 権限チェックは境界で行う

権限チェックはUIコンポーネント内部ではなく、明確な境界（ルート、APIコール前）で行う。

---

## AuthContext の設計

### 基本インターフェース

```typescript
interface AuthContext {
  // 現在のユーザーID（未ログインなら null）
  userId: string | null;

  // ログイン済みか
  isAuthenticated: boolean;

  // 保持している権限のリスト
  permissions: string[];
}
```

### 拡張（必要に応じて）

```typescript
interface ExtendedAuthContext extends AuthContext {
  // ユーザー情報（表示用）
  user: {
    name: string;
    email: string;
    avatarUrl?: string;
  } | null;

  // 認証状態のローディング
  isLoading: boolean;

  // アクション
  login: () => Promise<void>;
  logout: () => Promise<void>;
}
```

---

## B側の実装

### AuthProvider（スタブ）

```typescript
// src/auth/AuthProvider.tsx
const AuthContext = createContext<AuthContext | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  // B側では固定値
  const authContext: AuthContext = {
    userId: 'local-user',
    isAuthenticated: false,
    permissions: [],
  };

  return (
    <AuthContext.Provider value={authContext}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContext {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('AuthProvider not found');
  return ctx;
}
```

### 使用側（UIコンポーネント）

```typescript
function TaskList() {
  const { userId, permissions } = useAuth();
  const { taskRepository } = useRepositories();

  // userId はローカルでも使える（フィルタリング等）
  // permissions は B側では空なので、権限チェックは常にパス

  return (
    <div>
      {/* UIは認証の有無に関わらず同じ */}
    </div>
  );
}
```

---

## C側の実装

### AuthProvider（実装）

```typescript
// src/auth/AuthProvider.tsx
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // 選定した認証サービスのセッションを確認
    authService.getSession()
      .then(session => setUser(session?.user ?? null))
      .finally(() => setIsLoading(false));

    // セッション変更を監視
    return authService.onAuthStateChange((user) => {
      setUser(user);
    });
  }, []);

  const authContext: AuthContext = {
    userId: user?.id ?? null,
    isAuthenticated: !!user,
    permissions: user?.permissions ?? [],
  };

  if (isLoading) {
    return <LoadingSpinner />;
  }

  return (
    <AuthContext.Provider value={authContext}>
      {children}
    </AuthContext.Provider>
  );
}
```

---

## 権限チェックのパターン

### パターン1: ルートレベル（推奨）

```typescript
// src/routes/ProtectedRoute.tsx
function ProtectedRoute({
  children,
  requiredPermission
}: {
  children: React.ReactNode;
  requiredPermission?: string;
}) {
  const { isAuthenticated, permissions } = useAuth();

  if (!isAuthenticated) {
    return <Navigate to="/login" />;
  }

  if (requiredPermission && !permissions.includes(requiredPermission)) {
    return <Navigate to="/unauthorized" />;
  }

  return <>{children}</>;
}

// 使用例
<Route
  path="/admin"
  element={
    <ProtectedRoute requiredPermission="admin">
      <AdminPage />
    </ProtectedRoute>
  }
/>
```

### パターン2: コンポーネントレベル（UI出し分け）

```typescript
function TaskActions({ task }: { task: Task }) {
  const { permissions } = useAuth();
  const canDelete = permissions.includes('task:delete');

  return (
    <div>
      <button>Edit</button>
      {canDelete && <button>Delete</button>}
    </div>
  );
}
```

### パターン3: APIコール前

```typescript
async function deleteTask(id: string) {
  const { isAuthenticated, permissions } = getAuth();

  // クライアント側でも一応チェック（UX向上）
  if (!isAuthenticated) {
    throw new AuthError('Login required');
  }
  if (!permissions.includes('task:delete')) {
    throw new AuthError('Permission denied');
  }

  // 実際の権限チェックはサーバー側で行う
  await apiClient.delete(`/api/tasks/${id}`);
}
```

---

## 権限の粒度

### シンプル（推奨）

最初はシンプルに:

```typescript
type Permission =
  | 'admin'      // 全権限
  | 'member';    // 基本操作
```

### 細かく分ける場合

必要になったら拡張:

```typescript
type Permission =
  | 'task:read'
  | 'task:create'
  | 'task:update'
  | 'task:delete'
  | 'user:manage'
  | 'settings:manage';
```

---

## ログイン/ログアウト UI

### 最小限のUI

```typescript
function AuthButtons() {
  const { isAuthenticated, logout } = useAuth();

  if (isAuthenticated) {
    return <button onClick={logout}>Logout</button>;
  }

  return <Link to="/login">Login</Link>;
}
```

### ログインページ

```typescript
function LoginPage() {
  const navigate = useNavigate();

  const handleLogin = async (provider: 'google' | 'email') => {
    await authService.login(provider);
    navigate('/');
  };

  return (
    <div>
      <h1>Login</h1>
      <button onClick={() => handleLogin('google')}>
        Login with Google
      </button>
      {/* 他のプロバイダー */}
    </div>
  );
}
```

---

## セキュリティ注意事項

### クライアント側の権限チェックは信頼しない

クライアント側のチェックは UX 向上のためだけ。**必ずサーバー側でも検証する**。

```typescript
// クライアント側: UX向上
if (!canDelete) {
  showError('権限がありません');
  return;
}

// サーバー側: 本当のチェック
app.delete('/api/tasks/:id', async (req, res) => {
  const user = await verifyToken(req.headers.authorization);
  if (!user.permissions.includes('task:delete')) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  // ...
});
```

### トークンの扱い

- アクセストークンは短命に（15分〜1時間）
- リフレッシュトークンは httpOnly Cookie で
- localStorage にトークンを保存しない（XSS対策）

---

## チェックリスト

B側で Auth injection point を準備する際のチェックリスト:

- [ ] AuthContext インターフェースが定義されている
- [ ] AuthProvider が存在し、固定値を返している
- [ ] useAuth フックが使える
- [ ] UIコンポーネントは useAuth 経由で認証情報を取得している
- [ ] 権限チェックの境界が明確（ルート or コンポーネント）
- [ ] 将来のログイン/ログアウト UI の場所が想定されている

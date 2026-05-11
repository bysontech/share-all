import { useState, useEffect, useCallback } from 'react';
import { adminApi, ApiError, type AdminRoomItem } from '../api/client';

// ── Login form ──

function LoginForm({ onLogin }: { onLogin: () => void }) {
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!password) return;
    setLoading(true);
    setError('');
    try {
      await adminApi.login(password);
      onLogin();
    } catch (err) {
      setError(err instanceof ApiError && err.status === 401 ? 'パスワードが間違っています' : 'エラーが発生しました');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 360, margin: '80px auto', padding: '0 16px' }}>
      <h1 style={{ marginBottom: 8 }}>Share All</h1>
      <h2 style={{ marginBottom: 24 }}>管理者ログイン</h2>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <label>
          パスワード
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{ display: 'block', width: '100%', marginTop: 4, padding: '8px', boxSizing: 'border-box' }}
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
          />
        </label>
        {error && <p style={{ color: 'red', margin: 0 }}>{error}</p>}
        <button
          type="submit"
          disabled={loading || !password}
          style={{ padding: '10px', cursor: 'pointer' }}
        >
          {loading ? 'ログイン中...' : 'ログイン'}
        </button>
      </form>
    </div>
  );
}

// ── Admin top ──

function AdminTop({ onLogout }: { onLogout: () => void }) {
  const [rooms, setRooms] = useState<AdminRoomItem[]>([]);
  const [loadingRooms, setLoadingRooms] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [passcode, setPasscode] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [createSuccess, setCreateSuccess] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadRooms = useCallback(async () => {
    setLoadingRooms(true);
    try {
      const res = await adminApi.getRooms();
      setRooms(res.rooms);
    } catch {
      // non-fatal
    } finally {
      setLoadingRooms(false);
    }
  }, []);

  useEffect(() => { loadRooms(); }, [loadRooms]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setCreateError('ルーム名を入力してください'); return; }
    setCreating(true);
    setCreateError('');
    setCreateSuccess('');
    try {
      await adminApi.createRoom({
        name: name.trim(),
        description: description.trim() || undefined,
        passcode: passcode.trim() || undefined,
      });
      setName('');
      setDescription('');
      setPasscode('');
      setCreateSuccess('ルームを作成しました');
      await loadRooms();
    } catch (err) {
      setCreateError(err instanceof ApiError ? err.message : 'エラーが発生しました');
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(roomId: string, roomName: string) {
    if (!confirm(`「${roomName}」を削除しますか？\n投稿・画像・動画もすべて削除されます。`)) return;
    setDeletingId(roomId);
    try {
      await adminApi.deleteRoom(roomId);
      setRooms((prev) => prev.filter((r) => r.roomId !== roomId));
    } catch (err) {
      alert(err instanceof ApiError ? err.message : '削除に失敗しました');
    } finally {
      setDeletingId(null);
    }
  }

  async function handleLogout() {
    try { await adminApi.logout(); } catch { /* ignore */ }
    onLogout();
  }

  const inputStyle: React.CSSProperties = {
    display: 'block', width: '100%', marginTop: 4, padding: '8px', boxSizing: 'border-box',
  };

  return (
    <div style={{ maxWidth: 900, margin: '40px auto', padding: '0 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ margin: 0 }}>Share All 管理</h1>
        <button onClick={handleLogout} style={{ padding: '6px 16px', cursor: 'pointer' }}>
          ログアウト
        </button>
      </div>

      <h2 style={{ marginTop: 32 }}>ルーム作成</h2>
      <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 480 }}>
        <label>
          ルーム名 *
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例: 田中・山田 結婚式"
            style={inputStyle}
          />
        </label>
        <label>
          説明（任意）
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            style={inputStyle}
          />
        </label>
        <label>
          パスコード（任意）
          <input
            type="text"
            value={passcode}
            onChange={(e) => setPasscode(e.target.value)}
            style={inputStyle}
          />
        </label>
        {createError && <p style={{ color: 'red', margin: 0 }}>{createError}</p>}
        {createSuccess && <p style={{ color: 'green', margin: 0 }}>{createSuccess}</p>}
        <div>
          <button type="submit" disabled={creating} style={{ padding: '10px 20px', cursor: 'pointer' }}>
            {creating ? '作成中...' : 'ルームを作成'}
          </button>
        </div>
      </form>

      <h2 style={{ marginTop: 40 }}>
        ルーム一覧
        {loadingRooms && <span style={{ fontSize: 14, fontWeight: 'normal', marginLeft: 8 }}>読み込み中...</span>}
      </h2>

      {!loadingRooms && rooms.length === 0 && <p>ルームがありません</p>}

      {rooms.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '2px solid #ccc' }}>
                <th style={{ padding: '8px 6px' }}>ルーム名</th>
                <th style={{ padding: '8px 6px' }}>作成日</th>
                <th style={{ padding: '8px 6px' }}>有効期限</th>
                <th style={{ padding: '8px 6px' }}>投稿数</th>
                <th style={{ padding: '8px 6px' }}>リンク</th>
                <th style={{ padding: '8px 6px' }}></th>
              </tr>
            </thead>
            <tbody>
              {rooms.map((room) => (
                <tr key={room.roomId} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: '8px 6px' }}>{room.name}</td>
                  <td style={{ padding: '8px 6px', whiteSpace: 'nowrap' }}>
                    {new Date(room.createdAt * 1000).toLocaleDateString('ja-JP')}
                  </td>
                  <td style={{ padding: '8px 6px', whiteSpace: 'nowrap' }}>
                    {new Date(room.expiresAt * 1000).toLocaleDateString('ja-JP')}
                  </td>
                  <td style={{ padding: '8px 6px', whiteSpace: 'nowrap' }}>
                    {room.postCount}件（画像{room.imageCount} / 動画{room.videoCount}）
                  </td>
                  <td style={{ padding: '8px 6px', whiteSpace: 'nowrap' }}>
                    <a href={room.participantUrl} target="_blank" rel="noreferrer" style={{ marginRight: 10 }}>
                      参加者
                    </a>
                    <a href={room.adminUrl} target="_blank" rel="noreferrer">
                      管理
                    </a>
                  </td>
                  <td style={{ padding: '8px 6px' }}>
                    <button
                      onClick={() => handleDelete(room.roomId, room.name)}
                      disabled={deletingId === room.roomId}
                      style={{
                        padding: '4px 12px',
                        cursor: 'pointer',
                        color: 'red',
                        background: 'none',
                        border: '1px solid red',
                        borderRadius: 4,
                      }}
                    >
                      {deletingId === room.roomId ? '削除中...' : '削除'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Root ──

export default function HomePage() {
  const [authState, setAuthState] = useState<'loading' | 'login' | 'admin'>('loading');

  useEffect(() => {
    adminApi
      .me()
      .then(() => setAuthState('admin'))
      .catch(() => setAuthState('login'));
  }, []);

  if (authState === 'loading') {
    return <div style={{ padding: 40 }}>読み込み中...</div>;
  }
  if (authState === 'login') {
    return <LoginForm onLogin={() => setAuthState('admin')} />;
  }
  return <AdminTop onLogout={() => setAuthState('login')} />;
}

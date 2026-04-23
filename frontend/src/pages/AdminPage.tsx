import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api, ApiError, type RoomInfo, type AdminPost, type SlideshowSettings } from '../api/client';

// ---- Sub-components ----

function PostRow({
  post,
  onToggle,
  onDelete,
}: {
  post: AdminPost;
  onToggle: (id: string, next: 'visible' | 'hidden') => void;
  onDelete: (id: string) => void;
}) {
  const date = new Date(post.created_at * 1000).toLocaleString('ja-JP');
  const isHidden = post.status === 'hidden';

  return (
    <tr style={{ background: isHidden ? '#fafafa' : '#fff', opacity: isHidden ? 0.6 : 1 }}>
      <td style={{ padding: '8px', borderBottom: '1px solid #eee', fontSize: 13 }}>{post.nickname}</td>
      <td style={{ padding: '8px', borderBottom: '1px solid #eee', fontSize: 12, color: '#888' }}>{date}</td>
      <td style={{ padding: '8px', borderBottom: '1px solid #eee', fontSize: 12 }}>
        {(post.file_size / 1024 / 1024).toFixed(1)} MB
      </td>
      <td style={{ padding: '8px', borderBottom: '1px solid #eee' }}>
        <span
          style={{
            fontSize: 11,
            padding: '2px 6px',
            borderRadius: 3,
            background: isHidden ? '#e2e3e5' : '#d4edda',
            color: isHidden ? '#555' : '#155724',
          }}
        >
          {isHidden ? '非表示' : '表示中'}
        </span>
      </td>
      <td style={{ padding: '8px', borderBottom: '1px solid #eee', whiteSpace: 'nowrap' }}>
        <button
          onClick={() => onToggle(post.id, isHidden ? 'visible' : 'hidden')}
          style={{ fontSize: 12, padding: '3px 10px', cursor: 'pointer', marginRight: 6 }}
        >
          {isHidden ? '表示する' : '非表示'}
        </button>
        <button
          onClick={() => onDelete(post.id)}
          style={{
            fontSize: 12,
            padding: '3px 10px',
            cursor: 'pointer',
            background: '#dc3545',
            color: '#fff',
            border: 'none',
            borderRadius: 3,
          }}
        >
          削除
        </button>
      </td>
    </tr>
  );
}

function SlideshowSettingsForm({
  initial,
  onSave,
  saving,
}: {
  initial: SlideshowSettings;
  onSave: (s: SlideshowSettings) => void;
  saving: boolean;
}) {
  const [intervalSeconds, setIntervalSeconds] = useState(initial.intervalSeconds);
  const [showNickname, setShowNickname] = useState(initial.showNickname);
  const [orderMode, setOrderMode] = useState(initial.orderMode);

  useEffect(() => {
    setIntervalSeconds(initial.intervalSeconds);
    setShowNickname(initial.showNickname);
    setOrderMode(initial.orderMode);
  }, [initial.intervalSeconds, initial.showNickname, initial.orderMode]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ width: 120, flexShrink: 0, fontSize: 14 }}>切替間隔（秒）</span>
        <input
          type="number"
          min={1}
          max={60}
          value={intervalSeconds}
          onChange={(e) => setIntervalSeconds(Number(e.target.value))}
          style={{ width: 80, padding: '5px 8px' }}
        />
      </label>
      <label style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ width: 120, flexShrink: 0, fontSize: 14 }}>ニックネーム表示</span>
        <input
          type="checkbox"
          checked={showNickname}
          onChange={(e) => setShowNickname(e.target.checked)}
          style={{ width: 18, height: 18 }}
        />
      </label>
      <label style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ width: 120, flexShrink: 0, fontSize: 14 }}>並び順</span>
        <select
          value={orderMode}
          onChange={(e) => setOrderMode(e.target.value)}
          style={{ padding: '5px 8px' }}
        >
          <option value="asc">古い順（asc）</option>
          <option value="desc">新しい順（desc）</option>
        </select>
      </label>
      <div>
        <button
          onClick={() => onSave({ intervalSeconds, showNickname, orderMode })}
          disabled={saving}
          style={{ padding: '8px 20px', cursor: 'pointer', fontWeight: 'bold' }}
        >
          {saving ? '保存中...' : '設定を保存'}
        </button>
      </div>
    </div>
  );
}

// ---- Main component ----

export default function AdminPage() {
  const { roomId } = useParams<{ roomId: string }>();

  const tokenKey = `hostToken:${roomId}`;
  const [hostToken, setHostToken] = useState(() => localStorage.getItem(tokenKey) ?? '');
  const [tokenInput, setTokenInput] = useState('');
  const [tokenError, setTokenError] = useState('');

  const [room, setRoom] = useState<RoomInfo | null>(null);
  const [roomError, setRoomError] = useState('');

  const [posts, setPosts] = useState<AdminPost[]>([]);
  const [postsError, setPostsError] = useState('');
  const [postsLoading, setPostsLoading] = useState(false);

  const [settings, setSettings] = useState<SlideshowSettings>({
    intervalSeconds: 5,
    showNickname: true,
    orderMode: 'asc',
  });
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsMsg, setSettingsMsg] = useState('');

  const participantUrl = roomId ? `${window.location.origin}/room/${roomId}` : '';

  // Load room info
  useEffect(() => {
    if (!roomId) return;
    api
      .getRoom(roomId)
      .then(setRoom)
      .catch((e) => setRoomError(e instanceof ApiError ? e.message : 'ルーム情報の取得に失敗しました'));
  }, [roomId]);

  // Load slideshow settings
  useEffect(() => {
    if (!roomId) return;
    api.getSlideshowSettings(roomId).then(setSettings).catch(() => {});
  }, [roomId]);

  const loadPosts = useCallback(async () => {
    if (!roomId || !hostToken) return;
    setPostsLoading(true);
    try {
      const res = await api.getAdminPosts(roomId, hostToken);
      setPosts(res.posts);
      setPostsError('');
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        setTokenError('ホストトークンが正しくありません');
        setHostToken('');
        localStorage.removeItem(tokenKey);
      } else {
        setPostsError(e instanceof ApiError ? e.message : '投稿の取得に失敗しました');
      }
    } finally {
      setPostsLoading(false);
    }
  }, [roomId, hostToken, tokenKey]);

  useEffect(() => {
    if (hostToken) loadPosts();
  }, [hostToken, loadPosts]);

  function handleTokenSubmit() {
    const t = tokenInput.trim();
    if (!t) return;
    localStorage.setItem(tokenKey, t);
    setHostToken(t);
    setTokenError('');
  }

  async function handleToggle(postId: string, next: 'visible' | 'hidden') {
    if (!roomId || !hostToken) return;
    try {
      await api.updatePostStatus(roomId, postId, hostToken, next);
      setPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, status: next } : p)));
    } catch (e) {
      alert(e instanceof ApiError ? e.message : '更新に失敗しました');
    }
  }

  async function handleDelete(postId: string) {
    if (!roomId || !hostToken) return;
    if (!window.confirm('この投稿を削除しますか？\nR2とDBから完全に削除されます。')) return;
    try {
      await api.deletePost(roomId, postId, hostToken);
      setPosts((prev) => prev.filter((p) => p.id !== postId));
    } catch (e) {
      alert(e instanceof ApiError ? e.message : '削除に失敗しました');
    }
  }

  async function handleSaveSettings(next: SlideshowSettings) {
    if (!roomId || !hostToken) return;
    setSettingsSaving(true);
    setSettingsMsg('');
    try {
      const updated = await api.updateSlideshowSettings(roomId, hostToken, next);
      setSettings(updated);
      setSettingsMsg('保存しました');
    } catch (e) {
      setSettingsMsg(e instanceof ApiError ? `エラー: ${e.message}` : '保存に失敗しました');
    } finally {
      setSettingsSaving(false);
    }
  }

  // ---- Render ----

  if (roomError) {
    return (
      <div style={{ maxWidth: 600, margin: '40px auto', padding: '0 16px' }}>
        <p style={{ color: 'red' }}>{roomError}</p>
      </div>
    );
  }

  if (!room) return <div style={{ padding: 24 }}>読み込み中...</div>;

  // Login form
  if (!hostToken) {
    return (
      <div style={{ maxWidth: 480, margin: '40px auto', padding: '0 16px' }}>
        <h2>{room.name} — 管理者ログイン</h2>
        <p style={{ fontSize: 14, color: '#555' }}>
          ルーム作成時に発行されたホストトークンを入力してください。
        </p>
        <input
          type="text"
          value={tokenInput}
          onChange={(e) => setTokenInput(e.target.value)}
          placeholder="host token (UUID)"
          onKeyDown={(e) => e.key === 'Enter' && handleTokenSubmit()}
          style={{ width: '100%', padding: '10px', boxSizing: 'border-box', marginBottom: 8, fontFamily: 'monospace' }}
        />
        {tokenError && <p style={{ color: 'red', margin: '0 0 8px' }}>{tokenError}</p>}
        <button onClick={handleTokenSubmit} style={{ padding: '8px 20px', cursor: 'pointer' }}>
          ログイン
        </button>
      </div>
    );
  }

  const expiresDate = new Date(room.expiresAt * 1000).toLocaleDateString('ja-JP');
  const visibleCount = posts.filter((p) => p.status === 'visible').length;
  const hiddenCount = posts.filter((p) => p.status === 'hidden').length;

  return (
    <div style={{ maxWidth: 800, margin: '24px auto', padding: '0 16px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <h2 style={{ margin: 0 }}>{room.name} — 管理</h2>
        <button
          onClick={() => {
            localStorage.removeItem(tokenKey);
            setHostToken('');
          }}
          style={{ fontSize: 12, padding: '4px 10px', cursor: 'pointer' }}
        >
          ログアウト
        </button>
      </div>
      <p style={{ fontSize: 13, color: '#888', margin: '0 0 20px' }}>有効期限: {expiresDate}</p>

      {/* Participant URL */}
      <section style={{ background: '#f5f5f5', borderRadius: 4, padding: 14, marginBottom: 24 }}>
        <p style={{ margin: '0 0 6px', fontWeight: 'bold', fontSize: 14 }}>参加者URL</p>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <code style={{ fontSize: 13, wordBreak: 'break-all', flex: 1 }}>{participantUrl}</code>
          <button
            onClick={() => navigator.clipboard.writeText(participantUrl)}
            style={{ padding: '4px 10px', cursor: 'pointer', whiteSpace: 'nowrap' }}
          >
            コピー
          </button>
          <Link
            to={`/room/${roomId}/slideshow`}
            target="_blank"
            style={{ padding: '4px 10px', background: '#1a1a1a', color: '#fff', borderRadius: 4, textDecoration: 'none', fontSize: 13, whiteSpace: 'nowrap' }}
          >
            スライドショー
          </Link>
        </div>
      </section>

      {/* Post list */}
      <section style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
          <h3 style={{ margin: 0 }}>投稿一覧</h3>
          <span style={{ fontSize: 13, color: '#555' }}>
            全{posts.length}件 / 表示中: {visibleCount} / 非表示: {hiddenCount}
          </span>
          <button
            onClick={loadPosts}
            disabled={postsLoading}
            style={{ marginLeft: 'auto', fontSize: 12, padding: '4px 10px', cursor: 'pointer' }}
          >
            {postsLoading ? '更新中...' : '更新'}
          </button>
        </div>
        {postsError && <p style={{ color: 'red', fontSize: 13 }}>{postsError}</p>}
        {posts.length === 0 && !postsLoading ? (
          <p style={{ color: '#888' }}>投稿はまだありません</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f0f0f0' }}>
                  <th style={{ padding: '8px', textAlign: 'left', fontWeight: 'normal' }}>投稿者</th>
                  <th style={{ padding: '8px', textAlign: 'left', fontWeight: 'normal' }}>日時</th>
                  <th style={{ padding: '8px', textAlign: 'left', fontWeight: 'normal' }}>サイズ</th>
                  <th style={{ padding: '8px', textAlign: 'left', fontWeight: 'normal' }}>状態</th>
                  <th style={{ padding: '8px', textAlign: 'left', fontWeight: 'normal' }}>操作</th>
                </tr>
              </thead>
              <tbody>
                {posts.map((post) => (
                  <PostRow
                    key={post.id}
                    post={post}
                    onToggle={handleToggle}
                    onDelete={handleDelete}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Slideshow settings */}
      <section>
        <h3 style={{ margin: '0 0 14px' }}>スライドショー設定</h3>
        <SlideshowSettingsForm initial={settings} onSave={handleSaveSettings} saving={settingsSaving} />
        {settingsMsg && (
          <p style={{ marginTop: 8, fontSize: 13, color: settingsMsg.startsWith('エラー') ? 'red' : 'green' }}>
            {settingsMsg}
          </p>
        )}
      </section>
    </div>
  );
}

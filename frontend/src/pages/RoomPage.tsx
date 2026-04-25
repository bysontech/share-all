import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api, ApiError, type RoomInfo, type ThemeSettings } from '../api/client';
import { useUploadQueue } from '../hooks/useUploadQueue';
import { usePostsPolling } from '../hooks/usePostsPolling';
import type { QueueItem } from '../hooks/useUploadQueue';

const EMPTY_THEME: ThemeSettings = {
  title: null, message: null, mainVisualKey: null,
  backgroundImageKey: null, themeColor: null, animationMode: 'none',
};

const STATUS_LABEL: Record<QueueItem['status'], string> = {
  pending: '待機中', uploading: 'アップロード中',
  completing: '登録中', done: '完了', error: 'エラー',
};

function useTheme(roomId: string | undefined) {
  const [theme, setTheme] = useState<ThemeSettings>(EMPTY_THEME);
  const [viewUrls, setViewUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!roomId) return;
    api.getTheme(roomId).then(t => {
      setTheme(t);
      if (t.mainVisualKey || t.backgroundImageKey) {
        api.getThemeViewUrls(roomId).then(r => setViewUrls(r.viewUrls)).catch(() => {});
      }
    }).catch(() => {});
  }, [roomId]);

  return { theme, viewUrls };
}

// Inline keyframe injection (once)
let injected = false;
function injectKeyframes() {
  if (injected || typeof document === 'undefined') return;
  injected = true;
  const style = document.createElement('style');
  style.textContent = `
    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
    @keyframes floatY { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }
    @keyframes roomFadeIn { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }
  `;
  document.head.appendChild(style);
}

export default function RoomPage() {
  const { roomId } = useParams<{ roomId: string }>();
  injectKeyframes();

  const [room, setRoom] = useState<RoomInfo | null>(null);
  const [roomError, setRoomError] = useState('');
  const { theme, viewUrls } = useTheme(roomId);

  const nicknameKey = `nickname:${roomId}`;
  const [nickname, setNickname] = useState(() => localStorage.getItem(nicknameKey) ?? '');
  const [nicknameInput, setNicknameInput] = useState('');
  const [passcodeInput, setPasscodeInput] = useState('');
  const [passcodeVerified, setPasscodeVerified] = useState(false);

  const { posts, error: pollError, addPost } = usePostsPolling(
    nickname && passcodeVerified ? roomId : undefined
  );

  const { items, addFiles, retryItem, clearDone, summary } = useUploadQueue({
    roomId: roomId ?? '',
    nickname,
    onPostComplete: addPost,
  });

  useEffect(() => {
    if (!roomId) return;
    api.getRoom(roomId)
      .then(r => {
        setRoom(r);
        if (!r.hasPasscode) setPasscodeVerified(true);
      })
      .catch(e => setRoomError(e instanceof ApiError ? e.message : 'ルーム情報の取得に失敗しました'));
  }, [roomId]);

  function handleNicknameSubmit() {
    const n = nicknameInput.trim();
    if (!n) return;
    localStorage.setItem(nicknameKey, n);
    setNickname(n);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files ?? []).filter(f =>
      ['image/jpeg', 'image/png', 'image/webp', 'image/heic'].includes(f.type)
    );
    if (selected.length) addFiles(selected);
    e.target.value = '';
  }

  const accentColor = theme.themeColor ?? '#b8860b';
  const bgUrl = viewUrls['background'];
  const mainVisualUrl = viewUrls['mainVisual'];

  const outerStyle: React.CSSProperties = {
    minHeight: '100vh',
    position: 'relative',
    fontFamily: 'Georgia, "Noto Serif JP", serif',
  };

  // Background layer
  const bgLayerStyle: React.CSSProperties = {
    position: 'fixed', inset: 0, zIndex: 0,
    backgroundImage: bgUrl ? `url(${bgUrl})` : 'linear-gradient(135deg, #f9f5ef 0%, #f0e8d5 100%)',
    backgroundSize: 'cover',
    backgroundPosition: 'center',
  };

  const overlayStyle: React.CSSProperties = {
    position: 'fixed', inset: 0, zIndex: 1,
    background: bgUrl ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.05)',
  };

  const contentStyle: React.CSSProperties = {
    position: 'relative', zIndex: 2,
    maxWidth: 560,
    margin: '0 auto',
    padding: '0 16px 40px',
    color: bgUrl ? '#fff' : '#333',
  };

  const cardStyle: React.CSSProperties = {
    background: bgUrl ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.85)',
    backdropFilter: 'blur(6px)',
    border: `1px solid ${bgUrl ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.08)'}`,
    borderRadius: 10,
    padding: 20,
    marginBottom: 20,
    color: bgUrl ? '#fff' : '#333',
    animation: theme.animationMode === 'fade' ? 'roomFadeIn 0.5s ease' : undefined,
  };

  const primaryBtnStyle: React.CSSProperties = {
    display: 'inline-block',
    padding: '10px 22px',
    background: accentColor,
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    cursor: 'pointer',
    fontSize: 14,
    fontWeight: 'bold',
    letterSpacing: 1,
  };

  const textColor = bgUrl ? 'rgba(255,255,255,0.8)' : '#666';

  // ---- Error ----
  if (roomError) {
    return (
      <div style={{ ...outerStyle, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={bgLayerStyle} /><div style={overlayStyle} />
        <p style={{ position: 'relative', zIndex: 2, color: '#c00' }}>{roomError}</p>
      </div>
    );
  }
  if (!room) return <div style={{ padding: 40, textAlign: 'center' }}>読み込み中...</div>;

  // ---- Passcode gate ----
  if (room.hasPasscode && !passcodeVerified) {
    return (
      <div style={outerStyle}>
        <div style={bgLayerStyle} /><div style={overlayStyle} />
        <div style={{ ...contentStyle, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
          <div style={{ ...cardStyle, width: '100%', maxWidth: 360 }}>
            <h2 style={{ margin: '0 0 16px', textAlign: 'center', color: accentColor }}>{room.name}</h2>
            <p style={{ margin: '0 0 12px', fontSize: 14 }}>パスコードを入力してください</p>
            <input
              type="text" value={passcodeInput}
              onChange={e => setPasscodeInput(e.target.value)}
              placeholder="パスコード"
              style={{ width: '100%', padding: '10px', boxSizing: 'border-box', marginBottom: 12, borderRadius: 6, border: '1px solid #ccc' }}
            />
            <button onClick={() => setPasscodeVerified(true)} style={{ ...primaryBtnStyle, width: '100%' }}>
              入室する
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ---- Nickname gate ----
  if (!nickname) {
    return (
      <div style={outerStyle}>
        <div style={bgLayerStyle} /><div style={overlayStyle} />
        <div style={{ ...contentStyle, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
          <div style={{ ...cardStyle, width: '100%', maxWidth: 360, textAlign: 'center' }}>
            {mainVisualUrl && (
              <img src={mainVisualUrl} alt="main visual"
                style={{
                  width: 120, height: 120, objectFit: 'cover', borderRadius: '50%',
                  border: `3px solid ${accentColor}`, marginBottom: 16,
                  animation: theme.animationMode === 'float' ? 'floatY 3s ease-in-out infinite' : undefined,
                }}
              />
            )}
            <h2 style={{ margin: '0 0 4px', color: accentColor, fontSize: 22 }}>
              {theme.title ?? room.name}
            </h2>
            {theme.message && (
              <p style={{ fontSize: 13, color: textColor, margin: '0 0 20px', lineHeight: 1.7 }}>{theme.message}</p>
            )}
            <p style={{ margin: '0 0 10px', fontSize: 14 }}>お名前（ニックネーム）</p>
            <input
              type="text" value={nicknameInput}
              onChange={e => setNicknameInput(e.target.value)}
              placeholder="例: 太郎"
              onKeyDown={e => e.key === 'Enter' && handleNicknameSubmit()}
              style={{ width: '100%', padding: '10px', boxSizing: 'border-box', marginBottom: 12, borderRadius: 6, border: '1px solid #ccc', textAlign: 'center', fontSize: 16 }}
            />
            <button onClick={handleNicknameSubmit} style={{ ...primaryBtnStyle, width: '100%' }}>
              参加する
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ---- Main room view ----
  return (
    <div style={outerStyle}>
      <div style={bgLayerStyle} />
      <div style={overlayStyle} />
      <div style={contentStyle}>
        {/* Header */}
        <div style={{ paddingTop: 32, paddingBottom: 20, textAlign: 'center' }}>
          {mainVisualUrl && (
            <img src={mainVisualUrl} alt="main visual"
              style={{
                width: 80, height: 80, objectFit: 'cover', borderRadius: '50%',
                border: `3px solid ${accentColor}`, marginBottom: 12,
                animation: theme.animationMode === 'float' ? 'floatY 3s ease-in-out infinite' : undefined,
              }}
            />
          )}
          <h1 style={{ margin: '0 0 4px', fontSize: 22, color: accentColor, fontWeight: 'normal' }}>
            {theme.title ?? room.name}
          </h1>
          {theme.message && (
            <p style={{ margin: '0 0 4px', fontSize: 13, color: textColor, lineHeight: 1.7 }}>{theme.message}</p>
          )}
          <p style={{ margin: 0, fontSize: 12, color: textColor }}>
            参加中: <strong style={{ color: accentColor }}>{nickname}</strong>
          </p>
        </div>

        {/* Upload card */}
        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 'bold' }}>写真をシェア</h3>
            <Link to={`/room/${roomId}/slideshow`}
              style={{ fontSize: 12, padding: '5px 12px', background: accentColor, color: '#fff', borderRadius: 20, textDecoration: 'none' }}>
              スライドショー
            </Link>
          </div>
          <label style={{ ...primaryBtnStyle, background: accentColor, display: 'inline-block', marginBottom: 12 }}>
            写真を選択
            <input type="file" accept="image/jpeg,image/png,image/webp,image/heic" multiple
              onChange={handleFileChange} style={{ display: 'none' }} />
          </label>

          {summary.total > 0 && (
            <div style={{ fontSize: 12, color: textColor, marginBottom: 8 }}>
              全{summary.total}件 | 処理中: {summary.active} | 完了: {summary.done} | エラー: {summary.error}
              {summary.done > 0 && (
                <button onClick={clearDone} style={{ marginLeft: 8, fontSize: 11, cursor: 'pointer', padding: '1px 6px', borderRadius: 3 }}>
                  完了を消す
                </button>
              )}
            </div>
          )}

          {items.length > 0 && (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {items.map(item => (
                <li key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: `1px solid ${bgUrl ? 'rgba(255,255,255,0.1)' : '#f0f0f0'}`, fontSize: 13 }}>
                  <span style={{
                    width: 56, flexShrink: 0, fontSize: 11, padding: '2px 4px', borderRadius: 3, textAlign: 'center',
                    background: item.status === 'done' ? '#d4edda' : item.status === 'error' ? '#f8d7da' : item.status === 'pending' ? '#e2e3e5' : '#fff3cd',
                    color: '#333',
                  }}>{STATUS_LABEL[item.status]}</span>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.file.name}</span>
                  <span style={{ flexShrink: 0, fontSize: 11, opacity: 0.7 }}>{(item.file.size / 1024 / 1024).toFixed(1)}MB</span>
                  {item.status === 'error' && (
                    <button onClick={() => retryItem(item.id)} style={{ fontSize: 11, padding: '2px 7px', cursor: 'pointer', flexShrink: 0 }}>再試行</button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Post list card */}
        <div style={cardStyle}>
          <h3 style={{ margin: '0 0 12px', fontSize: 15 }}>投稿一覧</h3>
          {pollError && <p style={{ fontSize: 12, opacity: 0.7, margin: '0 0 8px' }}>{pollError}</p>}
          {posts.length === 0 ? (
            <p style={{ fontSize: 13, opacity: 0.6, margin: 0 }}>まだ投稿はありません</p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {posts.map(p => (
                <li key={p.id} style={{ padding: '7px 0', borderBottom: `1px solid ${bgUrl ? 'rgba(255,255,255,0.1)' : '#f0f0f0'}`, fontSize: 13 }}>
                  <span style={{ fontWeight: 'bold', color: accentColor }}>{p.nickname}</span>
                  <span style={{ marginLeft: 8, fontSize: 11, opacity: 0.65 }}>
                    {new Date(p.created_at * 1000).toLocaleString('ja-JP')}
                  </span>
                  {p.nickname === nickname && (
                    <span style={{ marginLeft: 8, fontSize: 10, background: accentColor, color: '#fff', borderRadius: 10, padding: '1px 6px' }}>自分</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

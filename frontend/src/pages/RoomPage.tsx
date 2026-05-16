import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api, ApiError, resolvePublicMediaUrl, type RoomInfo, type ThemeSettings } from '../api/client';
import { useUploadQueue } from '../hooks/useUploadQueue';
import type { QueueItem } from '../hooks/useUploadQueue';
import { getOrCreateParticipantId } from '../utils/participantId';

const EMPTY_THEME: ThemeSettings = {
  title: null, message: null, mainVisualKey: null,
  backgroundImageKey: null, themeColor: null, animationMode: 'none',
};

const STATUS_LABEL: Record<QueueItem['status'], string> = {
  pending: '待機中', uploading: 'アップロード中',
  completing: '登録中', done: '完了', error: 'エラー',
};

const SLIDESHOW_MAX = 10;

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
    @keyframes floatY { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }
    @keyframes roomFadeIn { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }
  `;
  document.head.appendChild(style);
}

// ---- Upload queue card ----

interface UploadCardProps {
  title: string;
  desc: string;
  accept: string;
  items: QueueItem[];
  summary: { total: number; active: number; done: number; error: number };
  addFiles: (files: File[]) => void;
  retryItem: (id: string) => void;
  clearDone: () => void;
  bgUrl: string;
  primaryBtnStyle: React.CSSProperties;
  cardStyle: React.CSSProperties;
  textColor: string;
  badge?: React.ReactNode;
  doneHint?: string;
}

function UploadCard({
  title, desc, accept, items, summary, addFiles, retryItem, clearDone,
  bgUrl, primaryBtnStyle, cardStyle, textColor, badge, doneHint,
}: UploadCardProps) {
  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files ?? []).filter(f =>
      accept.split(',').some(a => f.type === a.trim())
    );
    if (selected.length) addFiles(selected);
    e.target.value = '';
  }

  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 'bold' }}>{title}</h3>
        {badge}
      </div>
      <p style={{ margin: '0 0 12px', fontSize: 12, color: textColor, lineHeight: 1.5 }}>{desc}</p>

      <label style={{ ...primaryBtnStyle, display: 'inline-block', marginBottom: 12, cursor: 'pointer' }}>
        ファイルを選択
        <input type="file" accept={accept} multiple onChange={handleFileChange} style={{ display: 'none' }} />
      </label>

      {summary.total > 0 && (
        <div style={{ fontSize: 12, color: textColor, marginBottom: 8, display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
          <span>全{summary.total}件</span>
          {summary.active > 0 && <span>処理中: {summary.active}</span>}
          {summary.done > 0 && <span>完了: {summary.done}</span>}
          {summary.error > 0 && <span style={{ color: '#f88' }}>エラー: {summary.error}</span>}
          {summary.done > 0 && (
            <button onClick={clearDone} style={{ fontSize: 11, cursor: 'pointer', padding: '4px 8px', borderRadius: 3, minHeight: 28 }}>
              完了を消す
            </button>
          )}
        </div>
      )}

      {items.length > 0 && (
        <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 8px' }}>
          {items.map(item => (
            <li key={item.id} style={{ padding: '6px 0', borderBottom: `1px solid ${bgUrl ? 'rgba(255,255,255,0.1)' : '#f0f0f0'}`, fontSize: 13 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{
                  width: 56, flexShrink: 0, fontSize: 11, padding: '4px', borderRadius: 3, textAlign: 'center',
                  background: item.status === 'done' ? '#d4edda' : item.status === 'error' ? '#f8d7da' : item.status === 'pending' ? '#e2e3e5' : '#fff3cd',
                  color: '#333',
                }}>{STATUS_LABEL[item.status]}</span>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.file.name}</span>
                <span style={{ flexShrink: 0, fontSize: 11, opacity: 0.7 }}>{(item.file.size / 1024 / 1024).toFixed(1)}MB</span>
                {item.status === 'error' && (
                  <button onClick={() => retryItem(item.id)} style={{ fontSize: 11, padding: '6px 10px', cursor: 'pointer', flexShrink: 0, minHeight: 32 }}>再試行</button>
                )}
              </div>
              {item.status === 'error' && item.error && (
                <p style={{ margin: '2px 0 0 64px', fontSize: 11, color: '#c00' }}>{item.error}</p>
              )}
            </li>
          ))}
        </ul>
      )}

      {summary.done > 0 && summary.active === 0 && doneHint && (
        <p style={{ margin: '10px 0 0', fontSize: 12, color: textColor, opacity: 0.85 }}>{doneHint}</p>
      )}
    </div>
  );
}

// ---- Main page ----

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

  const [participantId] = useState(() => roomId ? getOrCreateParticipantId(roomId) : '');

  // Slideshow count
  const [slideshowCount, setSlideshowCount] = useState<number | null>(null);

  const handleSlideshowComplete = useCallback(() => {
    setSlideshowCount(prev => prev !== null ? Math.min(prev + 1, SLIDESHOW_MAX) : null);
  }, []);

  const slideshowQueue = useUploadQueue({
    roomId: roomId ?? '',
    nickname,
    participantId,
    postPurpose: 'slideshow',
    onPostComplete: handleSlideshowComplete,
  });

  const albumQueue = useUploadQueue({
    roomId: roomId ?? '',
    nickname,
    participantId,
    postPurpose: 'album',
  });

  const videoQueue = useUploadQueue({
    roomId: roomId ?? '',
    nickname,
    participantId,
    postPurpose: 'video',
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

  useEffect(() => {
    if (!roomId || !participantId || !nickname) return;
    api.getSlideshowCount(roomId, participantId)
      .then(r => setSlideshowCount(r.count))
      .catch(() => {});
  }, [roomId, participantId, nickname]);

  function handleNicknameSubmit() {
    const n = nicknameInput.trim();
    if (!n) return;
    localStorage.setItem(nicknameKey, n);
    setNickname(n);
  }

  const accentColor = theme.themeColor ?? '#b8860b';
  const bgUrl = resolvePublicMediaUrl(viewUrls['background']);
  const mainVisualUrl = resolvePublicMediaUrl(viewUrls['mainVisual']);

  const outerStyle: React.CSSProperties = {
    minHeight: '100vh',
    position: 'relative',
    fontFamily: 'Georgia, "Noto Serif JP", serif',
    overflowX: 'hidden',
  };

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
    padding: '12px 22px',
    background: accentColor,
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    cursor: 'pointer',
    fontSize: 14,
    fontWeight: 'bold',
    letterSpacing: 1,
    minHeight: 44,
    boxSizing: 'border-box',
    WebkitTapHighlightColor: 'transparent',
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
              onKeyDown={e => e.key === 'Enter' && setPasscodeVerified(true)}
              placeholder="パスコード"
              style={{ width: '100%', padding: '12px', boxSizing: 'border-box', marginBottom: 12, borderRadius: 6, border: '1px solid #ccc', fontSize: 16 }}
            />
            <button onClick={() => setPasscodeVerified(true)} style={{ ...primaryBtnStyle, width: '100%', display: 'block' }}>
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
              style={{ width: '100%', padding: '12px', boxSizing: 'border-box', marginBottom: 12, borderRadius: 6, border: '1px solid #ccc', textAlign: 'center', fontSize: 16 }}
            />
            <button onClick={handleNicknameSubmit} style={{ ...primaryBtnStyle, width: '100%', display: 'block' }}>
              参加する
            </button>
          </div>
        </div>
      </div>
    );
  }

  const IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp,image/heic';
  const VIDEO_ACCEPT = 'video/mp4,video/quicktime';

  const displayedSlideshowCount = slideshowCount ?? 0;
  const slideshowAtLimit = displayedSlideshowCount >= SLIDESHOW_MAX;

  const slideshowCountBadge = (
    <span style={{
      fontSize: 12,
      color: slideshowAtLimit ? '#f88' : textColor,
      fontWeight: slideshowAtLimit ? 'bold' : 'normal',
    }}>
      {slideshowCount !== null ? `${displayedSlideshowCount}/${SLIDESHOW_MAX}枚` : ''}
    </span>
  );

  // ---- Main room view ----
  return (
    <div style={outerStyle}>
      <div style={bgLayerStyle} />
      <div style={overlayStyle} />
      <div style={contentStyle}>
        {/* Header */}
        <div style={{ paddingTop: 32, paddingBottom: 24, textAlign: 'center' }}>
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

        {/* Slideshow upload */}
        {slideshowAtLimit ? (
          <div style={{ ...cardStyle, opacity: 0.75 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 'bold' }}>スライドショー用写真</h3>
              {slideshowCountBadge}
            </div>
            <p style={{ margin: 0, fontSize: 12, color: '#f88' }}>
              スライドショー写真は最大{SLIDESHOW_MAX}枚まで投稿できます。上限に達しました。
            </p>
          </div>
        ) : (
          <UploadCard
            title="スライドショー用写真"
            desc={`会場のスクリーンに映す写真を選んでください。最大${SLIDESHOW_MAX}枚まで投稿できます。`}
            accept={IMAGE_ACCEPT}
            items={slideshowQueue.items}
            summary={slideshowQueue.summary}
            addFiles={slideshowQueue.addFiles}
            retryItem={slideshowQueue.retryItem}
            clearDone={slideshowQueue.clearDone}
            bgUrl={bgUrl}
            primaryBtnStyle={primaryBtnStyle}
            cardStyle={cardStyle}
            textColor={textColor}
            badge={slideshowCountBadge}
            doneHint="スライドショーに追加されました。"
          />
        )}

        {/* Album upload */}
        <UploadCard
          title="共有アルバム用写真"
          desc="みんなで保存・共有する写真を投稿してください。"
          accept={IMAGE_ACCEPT}
          items={albumQueue.items}
          summary={albumQueue.summary}
          addFiles={albumQueue.addFiles}
          retryItem={albumQueue.retryItem}
          clearDone={albumQueue.clearDone}
          bgUrl={bgUrl}
          primaryBtnStyle={primaryBtnStyle}
          cardStyle={cardStyle}
          textColor={textColor}
          doneHint="アルバムに追加されました。"
        />

        {/* Video upload */}
        <UploadCard
          title="動画"
          desc="思い出の動画を共有してください（MP4・MOV）。"
          accept={VIDEO_ACCEPT}
          items={videoQueue.items}
          summary={videoQueue.summary}
          addFiles={videoQueue.addFiles}
          retryItem={videoQueue.retryItem}
          clearDone={videoQueue.clearDone}
          bgUrl={bgUrl}
          primaryBtnStyle={primaryBtnStyle}
          cardStyle={cardStyle}
          textColor={textColor}
          doneHint="動画が共有されました。"
        />

        {/* Navigation links */}
        <div style={{ ...cardStyle, textAlign: 'center', marginBottom: 0 }}>
          <p style={{ margin: '0 0 14px', fontSize: 13, color: textColor }}>
            みんなの投稿を確認する
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link
              to={`/room/${roomId}/photos`}
              style={{
                ...primaryBtnStyle,
                textDecoration: 'none',
                fontSize: 14,
                padding: '12px 24px',
              }}
            >
              写真アルバム
            </Link>
            <Link
              to={`/room/${roomId}/videos`}
              style={{
                ...primaryBtnStyle,
                background: '#555',
                textDecoration: 'none',
                fontSize: 14,
                padding: '12px 24px',
              }}
            >
              動画一覧
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

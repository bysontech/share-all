import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api, ApiError, resolvePublicMediaUrl, type RoomInfo, type BootstrapTheme } from '../api/client';
import { useUploadQueue, MAX_RETRIES } from '../hooks/useUploadQueue';
import type { QueueItem } from '../hooks/useUploadQueue';
import { getOrCreateParticipantId } from '../utils/participantId';

const STATUS_LABEL: Record<QueueItem['status'], string> = {
  pending: '待機中', uploading: 'アップロード中',
  completing: '登録中', done: '完了', error: 'エラー',
};

const SLIDESHOW_MAX = 10;

function useBootstrap(roomId: string | undefined) {
  const [room, setRoom] = useState<RoomInfo | null>(null);
  const [theme, setTheme] = useState<BootstrapTheme>({
    title: null, message: null, themeColor: null, animationMode: 'none',
    mainVisualUrl: null, backgroundDisplayUrl: null,
  });
  const [error, setError] = useState('');

  useEffect(() => {
    if (!roomId) return;
    api.getBootstrap(roomId)
      .then(b => { setRoom(b.room); setTheme(b.theme); })
      .catch(e => setError(e instanceof ApiError ? e.message : 'ルーム情報の取得に失敗しました'));
  }, [roomId]);

  return { room, theme, error };
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
  summary: { total: number; active: number; done: number; error: number; uploadedBytes: number; totalBytes: number };
  addFiles: (files: File[]) => void;
  retryItem: (id: string) => void;
  clearDone: () => void;
  hasBg: boolean;
  primaryBtnStyle: React.CSSProperties;
  cardStyle: React.CSSProperties;
  textColor: string;
  accentColor: string;
  badge?: React.ReactNode;
  doneHint?: string;
  isVideoCard?: boolean;
}

function UploadCard({
  title, desc, accept, items, summary, addFiles, retryItem, clearDone,
  hasBg, primaryBtnStyle, cardStyle, textColor, accentColor, badge, doneHint, isVideoCard,
}: UploadCardProps) {
  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files ?? []).filter(f =>
      accept.split(',').some(a => f.type === a.trim())
    );
    if (selected.length) addFiles(selected);
    e.target.value = '';
  }

  const overallPercent = summary.totalBytes > 0
    ? Math.min(100, Math.round(summary.uploadedBytes / summary.totalBytes * 100))
    : 0;

  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 'bold' }}>{title}</h3>
        {badge}
      </div>
      <p style={{ margin: '0 0 12px', fontSize: 12, color: textColor, lineHeight: 1.5 }}>{desc}</p>

      {/* Video upload warning */}
      {isVideoCard && summary.active > 0 && (
        <div style={{
          background: hasBg ? 'rgba(0,0,0,0.25)' : '#fff8e1',
          border: `1px solid ${hasBg ? 'rgba(255,255,255,0.2)' : '#ffe082'}`,
          borderRadius: 6,
          padding: '10px 12px',
          marginBottom: 12,
          fontSize: 12,
          lineHeight: 1.7,
          color: hasBg ? 'rgba(255,255,255,0.9)' : '#5d4037',
        }}>
          動画は容量が大きいためアップロードに時間がかかります。<br />
          Wi-Fi環境でのアップロードを推奨します。<br />
          完了まで画面を閉じずにお待ちください。
        </div>
      )}

      <label style={{ ...primaryBtnStyle, display: 'inline-block', marginBottom: 12, cursor: 'pointer' }}>
        ファイルを選択
        <input type="file" accept={accept} multiple onChange={handleFileChange} style={{ display: 'none' }} />
      </label>

      {/* Overall progress + summary */}
      {summary.total > 0 && (
        <div style={{ fontSize: 12, color: textColor, marginBottom: 8 }}>
          {summary.active > 0 && summary.totalBytes > 0 && (
            <div style={{ marginBottom: 6 }}>
              <div style={{ height: 3, background: 'rgba(128,128,128,0.3)', borderRadius: 2, overflow: 'hidden', marginBottom: 4 }}>
                <div style={{
                  height: '100%',
                  width: `${overallPercent}%`,
                  background: accentColor,
                  transition: 'width 0.3s ease',
                  borderRadius: 2,
                }} />
              </div>
              <div style={{ fontSize: 11, opacity: 0.8, marginBottom: 4 }}>
                全体: {overallPercent}%（{(summary.uploadedBytes / 1024 / 1024).toFixed(1)} / {(summary.totalBytes / 1024 / 1024).toFixed(1)} MB）
              </div>
            </div>
          )}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
            <span>全{summary.total}件</span>
            {summary.active > 0 && <span>処理中: {summary.active}</span>}
            {summary.done > 0 && <span>完了: {summary.done}</span>}
            {summary.error > 0 && <span style={{ color: '#f88' }}>エラー: {summary.error}</span>}
            {summary.done > 0 && (
              <button
                onClick={clearDone}
                style={{
                  fontSize: 11,
                  cursor: 'pointer',
                  padding: '4px 8px',
                  borderRadius: 3,
                  minHeight: 28,
                  border: hasBg ? '1px solid rgba(255,255,255,0.24)' : undefined,
                  background: hasBg ? 'rgba(255,255,255,0.14)' : undefined,
                  color: hasBg ? '#fff' : undefined,
                }}
              >
                完了を消す
              </button>
            )}
          </div>
        </div>
      )}

      {items.length > 0 && (
        <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 8px' }}>
          {items.map(item => (
            <li key={item.id} style={{ padding: '6px 0', borderBottom: `1px solid ${hasBg ? 'rgba(255,255,255,0.1)' : '#f0f0f0'}`, fontSize: 13 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{
                  width: 56, flexShrink: 0, fontSize: 11, padding: '4px', borderRadius: 3, textAlign: 'center',
                  background: hasBg
                    ? item.status === 'done' ? 'rgba(46, 125, 50, 0.42)'
                      : item.status === 'error' ? 'rgba(183, 28, 28, 0.42)'
                        : item.status === 'pending' ? 'rgba(255,255,255,0.18)'
                          : 'rgba(245, 166, 35, 0.38)'
                    : item.status === 'done' ? '#d4edda'
                      : item.status === 'error' ? '#f8d7da'
                        : item.status === 'pending' ? '#e2e3e5'
                          : '#fff3cd',
                  color: hasBg ? '#fff' : '#333',
                }}>{STATUS_LABEL[item.status]}</span>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.file.name}</span>
                <span style={{ flexShrink: 0, fontSize: 11, opacity: 0.7 }}>{(item.file.size / 1024 / 1024).toFixed(1)}MB</span>
                {item.status === 'error' && item.retryCount < MAX_RETRIES && (
                  <button
                    onClick={() => retryItem(item.id)}
                    style={{
                      fontSize: 11,
                      padding: '6px 10px',
                      cursor: 'pointer',
                      flexShrink: 0,
                      minHeight: 32,
                      borderRadius: 4,
                      border: hasBg ? '1px solid rgba(255,255,255,0.25)' : undefined,
                      background: hasBg ? 'rgba(255,255,255,0.14)' : undefined,
                      color: hasBg ? '#fff' : undefined,
                    }}
                  >再試行</button>
                )}
              </div>

              {/* Per-file progress bar */}
              {item.status === 'uploading' && item.totalBytes > 0 && (
                <div style={{ marginTop: 5, paddingLeft: 64 }}>
                  <div style={{ height: 4, background: 'rgba(128,128,128,0.25)', borderRadius: 2, overflow: 'hidden', marginBottom: 3 }}>
                    <div style={{
                      height: '100%',
                      width: `${Math.min(100, Math.round(item.uploadedBytes / item.totalBytes * 100))}%`,
                      background: accentColor,
                      transition: 'width 0.25s linear',
                      borderRadius: 2,
                    }} />
                  </div>
                  <div style={{ fontSize: 11, color: textColor, display: 'flex', gap: 8, opacity: 0.85 }}>
                    <span>{Math.min(100, Math.round(item.uploadedBytes / item.totalBytes * 100))}%</span>
                    <span>
                      {(item.uploadedBytes / 1024 / 1024).toFixed(1)} / {(item.totalBytes / 1024 / 1024).toFixed(1)} MB
                    </span>
                  </div>
                </div>
              )}

              {item.status === 'error' && (
                <p style={{ margin: '2px 0 0 64px', fontSize: 11, color: '#c00' }}>
                  {item.error}
                  {item.retryCount >= MAX_RETRIES && ' (再試行上限に達しました)'}
                </p>
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

// ---- Shared background layers ----

function BgLayers({
  displayUrl, loaded,
}: { displayUrl: string; loaded: boolean }) {
  return (
    <>
      <div style={{
        position: 'fixed', inset: 0, zIndex: 0,
        background: 'linear-gradient(135deg, #f9f5ef 0%, #f0e8d5 100%)',
        pointerEvents: 'none',
      }} />
      {displayUrl && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 0,
          backgroundImage: `url(${displayUrl})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          opacity: loaded ? 1 : 0,
          transition: loaded ? 'opacity 180ms ease-out' : 'none',
          pointerEvents: 'none',
        }} />
      )}
    </>
  );
}

function MainVisualImage({
  src,
  size,
  accentColor,
  float,
}: {
  src: string;
  size: number;
  accentColor: string;
  float: boolean;
}) {
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setLoaded(false);
  }, [src]);

  return (
    <div style={{
      width: size,
      height: size,
      borderRadius: '50%',
      border: `3px solid ${accentColor}`,
      margin: '0 auto 16px',
      overflow: 'hidden',
      background: 'rgba(255,255,255,0.18)',
      boxSizing: 'border-box',
      animation: float ? 'floatY 3s ease-in-out infinite' : undefined,
      flexShrink: 0,
    }}>
      {src && (
        <img
          src={src}
          alt="main visual"
          onLoad={() => setLoaded(true)}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            display: 'block',
            opacity: loaded ? 1 : 0,
            transition: loaded ? 'opacity 160ms ease-out' : 'none',
          }}
        />
      )}
    </div>
  );
}

// ---- Main page ----

export default function RoomPage() {
  const { roomId } = useParams<{ roomId: string }>();
  injectKeyframes();

  const { room, theme, error: roomError } = useBootstrap(roomId);

  // Background: pre-generated display image — no fallback to original
  const bgDisplayUrl = resolvePublicMediaUrl(theme.backgroundDisplayUrl ?? '');
  const [bgLoaded, setBgLoaded] = useState(false);

  useEffect(() => {
    if (!bgDisplayUrl) { setBgLoaded(false); return; }
    setBgLoaded(false);
    const img = new Image();
    img.onload = () => setBgLoaded(true);
    img.onerror = () => {};
    img.src = bgDisplayUrl;
  }, [bgDisplayUrl]);

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
    if (room && !room.hasPasscode) setPasscodeVerified(true);
  }, [room]);

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
  const mainVisualUrl = resolvePublicMediaUrl(theme.mainVisualUrl ?? '');

  const hasBg = !!bgDisplayUrl;
  const overlayBg = hasBg
    ? 'linear-gradient(180deg, rgba(0,0,0,0.22) 0%, rgba(0,0,0,0.34) 100%)'
    : 'rgba(0,0,0,0)';
  const contentColor = hasBg ? '#fff' : '#333';
  const textColor = hasBg ? 'rgba(255,255,255,0.84)' : '#666';

  const outerStyle: React.CSSProperties = {
    minHeight: '100vh',
    position: 'relative',
    fontFamily: 'Georgia, "Noto Serif JP", serif',
    overflowX: 'hidden',
  };

  const overlayStyle: React.CSSProperties = {
    position: 'fixed', inset: 0, zIndex: 1,
    background: overlayBg,
    pointerEvents: 'none',
  };

  const contentStyle: React.CSSProperties = {
    position: 'relative', zIndex: 2,
    maxWidth: 560,
    margin: '0 auto',
    padding: '0 16px 40px',
    color: contentColor,
  };

  const cardStyle: React.CSSProperties = {
    background: hasBg ? 'rgba(20, 18, 16, 0.34)' : 'rgba(255,255,255,0.85)',
    backdropFilter: 'blur(12px) saturate(1.05)',
    WebkitBackdropFilter: 'blur(12px) saturate(1.05)',
    border: hasBg ? '1px solid rgba(255,255,255,0.22)' : '1px solid rgba(0,0,0,0.08)',
    borderRadius: 10,
    padding: 20,
    marginBottom: 20,
    color: contentColor,
    boxShadow: hasBg ? '0 12px 32px rgba(0,0,0,0.18)' : undefined,
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

  // ---- Error ----
  if (roomError) {
    return (
      <div style={outerStyle}>
        <BgLayers displayUrl={bgDisplayUrl} loaded={bgLoaded} />
        <div style={overlayStyle} />
        <div style={{ ...contentStyle, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
          <p style={{ color: '#c00', background: 'rgba(255,255,255,0.9)', padding: '12px 20px', borderRadius: 8 }}>{roomError}</p>
        </div>
      </div>
    );
  }

  // ---- Passcode gate (only after room has loaded) ----
  if (room !== null && room.hasPasscode && !passcodeVerified) {
    return (
      <div style={outerStyle}>
        <BgLayers displayUrl={bgDisplayUrl} loaded={bgLoaded} />
        <div style={overlayStyle} />
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

  // ---- Loading (room/theme bootstrap not yet loaded) ----
  if (!room) {
    return (
      <div style={outerStyle}>
        <BgLayers displayUrl={bgDisplayUrl} loaded={bgLoaded} />
        <div style={overlayStyle} />
        <div style={{ ...contentStyle, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
          <p style={{ fontSize: 14, color: textColor }}>読み込み中...</p>
        </div>
      </div>
    );
  }

  // ---- Nickname gate ----
  if (!nickname) {
    return (
      <div style={outerStyle}>
        <BgLayers displayUrl={bgDisplayUrl} loaded={bgLoaded} />
        <div style={overlayStyle} />
        <div style={{ ...contentStyle, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
          <div style={{ ...cardStyle, width: '100%', maxWidth: 360, textAlign: 'center' }}>
            <MainVisualImage
              src={mainVisualUrl}
              size={120}
              accentColor={accentColor}
              float={theme.animationMode === 'float'}
            />
            <h2 style={{ margin: '0 0 4px', color: accentColor, fontSize: 22 }}>
              {theme.title ?? room?.name ?? ''}
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
      <BgLayers displayUrl={bgDisplayUrl} loaded={bgLoaded} />
      <div style={overlayStyle} />
      <div style={contentStyle}>
        {/* Header */}
        <div style={{ paddingTop: 32 }}>
          <div style={{ ...cardStyle, textAlign: 'center', marginBottom: 20 }}>
            <MainVisualImage
              src={mainVisualUrl}
              size={80}
              accentColor={accentColor}
              float={theme.animationMode === 'float'}
            />
            <h1 style={{ margin: '0 0 4px', fontSize: 22, color: accentColor, fontWeight: 'normal' }}>
              {theme.title ?? room?.name ?? roomId}
            </h1>
            {theme.message && (
              <p style={{ margin: '0 0 4px', fontSize: 13, color: textColor, lineHeight: 1.7 }}>{theme.message}</p>
            )}
            <p style={{ margin: 0, fontSize: 12, color: textColor }}>
              参加中: <strong style={{ color: accentColor }}>{nickname}</strong>
            </p>
          </div>
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
            hasBg={hasBg}
            primaryBtnStyle={primaryBtnStyle}
            cardStyle={cardStyle}
            textColor={textColor}
            accentColor={accentColor}
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
          hasBg={hasBg}
          primaryBtnStyle={primaryBtnStyle}
          cardStyle={cardStyle}
          textColor={textColor}
          accentColor={accentColor}
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
          hasBg={hasBg}
          primaryBtnStyle={primaryBtnStyle}
          cardStyle={cardStyle}
          textColor={textColor}
          accentColor={accentColor}
          doneHint="動画が共有されました。"
          isVideoCard
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

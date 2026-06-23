import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api, ApiError, resolvePublicMediaUrl, type RoomInfo, type BootstrapTheme, type EventMode } from '../api/client';
import { useUploadQueue } from '../hooks/useUploadQueue';
import { getOrCreateParticipantId } from '../utils/participantId';

const SLIDESHOW_MAX = 10;
const VIDEO_SELECTION_MAX_BYTES = 900 * 1024 * 1024;

function useBootstrap(roomId: string | undefined) {
  const [room, setRoom] = useState<RoomInfo | null>(null);
  const [theme, setTheme] = useState<BootstrapTheme>({
    title: null, message: null, themeColor: null, animationMode: 'none',
    mainVisualUrl: null, backgroundDisplayUrl: null,
  });
  const [eventMode, setEventMode] = useState<EventMode>('event_live');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!roomId) return;
    api.getBootstrap(roomId)
      .then(b => {
        setRoom(b.room);
        setTheme(b.theme);
        setEventMode(b.eventMode ?? 'event_live');
      })
      .catch(e => setError(e instanceof ApiError ? e.message : 'ルーム情報の取得に失敗しました'));
  }, [roomId]);

  return { room, theme, eventMode, error };
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
  summary: { total: number; pending: number; active: number; done: number; error: number; uploadedBytes: number; totalBytes: number };
  addFiles: (files: File[]) => void;
  cancelPending: () => void;
  hasBg: boolean;
  primaryBtnStyle: React.CSSProperties;
  cardStyle: React.CSSProperties;
  textColor: string;
  accentColor: string;
  badge?: React.ReactNode;
  doneHint?: string;
  isVideoCard?: boolean;
  maxFilesPerSelection?: number;
  maxBytesPerSelection?: number;
  disabled?: boolean;
  disabledReason?: string;
}

function UploadCard({
  title, desc, accept, summary, addFiles, cancelPending,
  hasBg, primaryBtnStyle, cardStyle, textColor, accentColor, badge, doneHint, isVideoCard,
  maxFilesPerSelection, maxBytesPerSelection, disabled = false, disabledReason,
}: UploadCardProps) {
  const [selectionError, setSelectionError] = useState('');

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (disabled) {
      e.target.value = '';
      return;
    }
    const selected = Array.from(e.target.files ?? []).filter(f =>
      accept.split(',').some(a => f.type === a.trim())
    );
    let limited =
      maxFilesPerSelection && selected.length > maxFilesPerSelection
        ? selected.slice(0, maxFilesPerSelection)
        : selected;

    if (maxBytesPerSelection) {
      let total = 0;
      limited = limited.filter((file) => {
        if (file.size > maxBytesPerSelection) return false;
        if (total + file.size > maxBytesPerSelection) return false;
        total += file.size;
        return true;
      });
    }

    if (selected.length > limited.length) {
      if (maxBytesPerSelection) {
        setSelectionError(`動画は一度に合計${Math.round(maxBytesPerSelection / 1024 / 1024)}MBまでです。残りは分けてアップロードしてください。`);
      } else {
        setSelectionError(`一度に選択できる写真は${maxFilesPerSelection}枚までです。残りは分けてアップロードしてください。`);
      }
    } else {
      setSelectionError('');
    }

    if (limited.length) addFiles(limited);
    e.target.value = '';
  }

  const overallPercent = summary.totalBytes > 0
    ? Math.min(100, Math.round(summary.uploadedBytes / summary.totalBytes * 100))
    : 0;

  return (
    <div style={{ ...cardStyle, opacity: disabled ? 0.72 : cardStyle.opacity }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 'bold' }}>{title}</h3>
        {badge}
      </div>
      <p style={{ margin: '0 0 12px', fontSize: 12, color: textColor, lineHeight: 1.5 }}>{desc}</p>
      {selectionError && (
        <p style={{ margin: '0 0 12px', fontSize: 12, color: hasBg ? '#ffd6a0' : '#b85c00', lineHeight: 1.6 }}>
          {selectionError}
        </p>
      )}
      {disabled && disabledReason && (
        <p style={{
          margin: '0 0 12px',
          fontSize: 12,
          lineHeight: 1.6,
          color: hasBg ? 'rgba(255,255,255,0.78)' : '#777',
        }}>
          {disabledReason}
        </p>
      )}

      {/* Video upload warning */}
      {isVideoCard && !disabled && summary.active > 0 && (
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
          動画は最大900MBまでアップロードできます。<br />
          Wi-Fi環境でのアップロードを推奨します。<br />
          完了まで画面を閉じずにお待ちください。
        </div>
      )}

      {!isVideoCard && !disabled && summary.active > 0 && (
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
          写真をアップロード中です。<br />
          Wi-Fi環境でのアップロードを推奨します。<br />
          完了まで画面を閉じずにお待ちください。
        </div>
      )}

      <label style={{
        ...primaryBtnStyle,
        display: 'inline-block',
        marginBottom: 12,
        cursor: disabled ? 'not-allowed' : 'pointer',
        filter: disabled ? 'grayscale(0.35)' : undefined,
        opacity: disabled ? 0.55 : primaryBtnStyle.opacity,
      }}>
        ファイルを選択
        <input type="file" accept={accept} multiple disabled={disabled} onChange={handleFileChange} style={{ display: 'none' }} />
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
            {summary.pending > 0 && <span>待機中: {summary.pending}</span>}
            {summary.active > 0 && <span>処理中: {summary.active}</span>}
            {summary.done > 0 && <span>完了: {summary.done}</span>}
            {summary.error > 0 && <span style={{ color: '#f88' }}>エラー: {summary.error}</span>}
            {summary.pending > 0 && (
              <button
                type="button"
                onClick={cancelPending}
                style={{
                  fontSize: 11,
                  cursor: 'pointer',
                  padding: '4px 8px',
                  borderRadius: 3,
                  minHeight: 28,
                  border: hasBg ? '1px solid rgba(255,255,255,0.24)' : '1px solid #d8cdb8',
                  background: hasBg ? 'rgba(255,255,255,0.14)' : '#f3eadb',
                  color: hasBg ? '#fff' : '#6a5530',
                }}
              >
                待機中を中止
              </button>
            )}
          </div>
        </div>
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

  const { room, theme, eventMode, error: roomError } = useBootstrap(roomId);

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

  const categoryIntroStyle: React.CSSProperties = {
    ...cardStyle,
    padding: '14px 16px',
    marginBottom: 10,
  };

  const categoryTitleStyle: React.CSSProperties = {
    margin: '0 0 6px',
    fontSize: 16,
    fontWeight: 'bold',
    color: accentColor,
  };

  const categoryBodyStyle: React.CSSProperties = {
    margin: 0,
    fontSize: 13,
    color: textColor,
    lineHeight: 1.7,
  };

  const categoryContentStyle: React.CSSProperties = {
    marginTop: 14,
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  };

  const nestedCardStyle: React.CSSProperties = {
    ...cardStyle,
    marginBottom: 0,
    background: hasBg ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.64)',
    boxShadow: undefined,
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

        {/* ---- draft: 準備中 ---- */}
        {eventMode === 'draft' && (
          <div style={{ ...cardStyle, textAlign: 'center' }}>
            <p style={{ margin: '0 0 8px', fontSize: 20, fontWeight: 'bold', color: accentColor }}>準備中</p>
            <p style={{ margin: 0, fontSize: 14, color: textColor, lineHeight: 1.8 }}>
              まもなく開始します。<br />しばらくお待ちください。
            </p>
          </div>
        )}

        {/* ---- event_live: スライドショーのみ ---- */}
        {eventMode === 'event_live' && (
          <>
            <div style={categoryIntroStyle}>
              <h2 style={categoryTitleStyle}>スライドショー用の写真</h2>
              <p style={categoryBodyStyle}>
                披露宴中は、会場スクリーンに流す写真を投稿できます。お気に入りの写真を選んでください。
              </p>
              <div style={categoryContentStyle}>
                {slideshowAtLimit ? (
                  <div style={{ ...nestedCardStyle, opacity: 0.75 }}>
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
                    title="写真"
                    desc={`会場のスクリーンに映す写真を選んでください。最大${SLIDESHOW_MAX}枚まで投稿できます。`}
                    accept={IMAGE_ACCEPT}
                    summary={slideshowQueue.summary}
                    addFiles={slideshowQueue.addFiles}
                    cancelPending={slideshowQueue.cancelPending}
                    hasBg={hasBg}
                    primaryBtnStyle={primaryBtnStyle}
                    cardStyle={nestedCardStyle}
                    textColor={textColor}
                    accentColor={accentColor}
                    badge={slideshowCountBadge}
                    doneHint="スライドショーに追加されました。"
                    maxFilesPerSelection={100}
                  />
                )}
              </div>
            </div>
            <div style={categoryIntroStyle}>
              <h2 style={categoryTitleStyle}>共有用の写真・動画</h2>
              <p style={categoryBodyStyle}>
              披露宴終了後から、みんなで保存・共有する写真や動画を投稿できます。
              </p>
              <div style={categoryContentStyle}>
                <UploadCard
                  title="写真"
                  desc="思い出の写真を共有してください。"
                  accept={IMAGE_ACCEPT}
                  summary={albumQueue.summary}
                  addFiles={albumQueue.addFiles}
                  cancelPending={albumQueue.cancelPending}
                  hasBg={hasBg}
                  primaryBtnStyle={primaryBtnStyle}
                  cardStyle={nestedCardStyle}
                  textColor={textColor}
                  accentColor={accentColor}
                  doneHint="アルバムに追加されました。"
                  maxFilesPerSelection={100}
                  disabled
                  disabledReason="披露宴中はまだ投稿できません。スライドショーをお楽しみください。"
                />
                <UploadCard
                  title="動画"
                  desc="思い出の動画を共有してください（MP4・MOV）。"
                  accept={VIDEO_ACCEPT}
                  summary={videoQueue.summary}
                  addFiles={videoQueue.addFiles}
                  cancelPending={videoQueue.cancelPending}
                  hasBg={hasBg}
                  primaryBtnStyle={primaryBtnStyle}
                  cardStyle={nestedCardStyle}
                  textColor={textColor}
                  accentColor={accentColor}
                  doneHint="動画が共有されました。"
                  isVideoCard
                  maxBytesPerSelection={VIDEO_SELECTION_MAX_BYTES}
                  disabled
                  disabledReason="披露宴中はまだ投稿できません。スライドショーをお楽しみください。"
                />
              </div>
            </div>
          </>
        )}

        {/* ---- archive: 写真・動画共有 ---- */}
        {eventMode === 'archive' && (
          <>
            <div style={categoryIntroStyle}>
              <h2 style={categoryTitleStyle}>共有用の写真・動画</h2>
              <p style={categoryBodyStyle}>
                披露宴後は、写真や動画を共有できます。<br />
              ※Wi-Fi環境でのアップロード推奨
              </p>
            </div>
            <UploadCard
              title="写真"
              desc="思い出の写真を共有してください。"
              accept={IMAGE_ACCEPT}
              summary={albumQueue.summary}
              addFiles={albumQueue.addFiles}
              cancelPending={albumQueue.cancelPending}
              hasBg={hasBg}
              primaryBtnStyle={primaryBtnStyle}
              cardStyle={cardStyle}
              textColor={textColor}
              accentColor={accentColor}
              doneHint="写真が共有されました。"
              maxFilesPerSelection={100}
            />
            <UploadCard
              title="動画"
              desc="思い出の動画を共有してください（MP4・MOV）。"
              accept={VIDEO_ACCEPT}
              summary={videoQueue.summary}
              addFiles={videoQueue.addFiles}
              cancelPending={videoQueue.cancelPending}
              hasBg={hasBg}
              primaryBtnStyle={primaryBtnStyle}
              cardStyle={cardStyle}
              textColor={textColor}
              accentColor={accentColor}
              doneHint="動画が共有されました。"
              isVideoCard
              maxBytesPerSelection={VIDEO_SELECTION_MAX_BYTES}
            />
            <div style={{ ...cardStyle, textAlign: 'center', marginBottom: 0 }}>
              <p style={{ margin: '0 0 14px', fontSize: 13, color: textColor }}>
                みんなの投稿を確認する
              </p>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
                <Link
                  to={`/room/${roomId}/photos`}
                  style={{ ...primaryBtnStyle, textDecoration: 'none', fontSize: 14, padding: '12px 24px' }}
                >
                  写真一覧
                </Link>
                <Link
                  to={`/room/${roomId}/videos`}
                  style={{ ...primaryBtnStyle, background: '#555', textDecoration: 'none', fontSize: 14, padding: '12px 24px' }}
                >
                  動画一覧
                </Link>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

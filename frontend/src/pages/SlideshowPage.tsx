import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api, ApiError, resolvePublicMediaUrl, type Post, type SlideshowSettings } from '../api/client';
import { usePostsPolling } from '../hooks/usePostsPolling';
import { createDisplayHistory, drawNextPost, recordDisplayed, type DisplayHistory } from '../utils/slideshowPool';

const FADE_MS = 600;
const CONTROLS_HIDE_MS = 3000;
const VIEW_URL_REFRESH_BEFORE_EXPIRY = 120;

// ── Helpers ──

/** Preloads an image URL (including decode if available). Never rejects. */
function preloadImage(url: string): Promise<void> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => (img.decode ? img.decode().then(resolve).catch(resolve) : resolve());
    img.onerror = () => resolve();
    img.src = url;
  });
}

/** Waits two animation frames to ensure React has committed a render. */
function raf2(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Types ──

interface DisplayLayer {
  postId: string;
  url: string;
  post: Post;
}

// ── Sub-components ──

function CtrlBtn({
  children,
  onClick,
  disabled,
  title,
  size,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
  size?: number;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        background: 'rgba(255,255,255,0.15)',
        border: 'none',
        color: disabled ? '#555' : '#fff',
        fontSize: size ?? 28,
        padding: '10px 16px',
        cursor: disabled ? 'default' : 'pointer',
        borderRadius: 8,
        lineHeight: 1,
        minWidth: 48,
      }}
    >
      {children}
    </button>
  );
}

function SideNav({ side, onClick }: { side: 'left' | 'right'; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        position: 'absolute',
        top: '50%',
        [side]: 12,
        transform: 'translateY(-50%)',
        background: 'rgba(255,255,255,0.08)',
        border: 'none',
        color: '#fff',
        fontSize: 40,
        padding: '24px 14px',
        cursor: 'pointer',
        borderRadius: 6,
        lineHeight: 1,
        userSelect: 'none',
      }}
    >
      {side === 'left' ? '‹' : '›'}
    </button>
  );
}

// ── Main component ──

export default function SlideshowPage() {
  const { roomId } = useParams<{ roomId: string }>();

  // Room settings
  const [roomError, setRoomError] = useState('');
  const [settings, setSettings] = useState<SlideshowSettings>({
    intervalSeconds: 5,
    showNickname: true,
    orderMode: 'asc',
  });

  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  // Posts polling — only slideshow-purpose posts
  const { posts, error: pollError } = usePostsPolling(roomId, 'slideshow');

  // Display order (asc/desc by created_at) is now only a tie-breaker within
  // the Fresh/Archive draw (see playQueueRef below); no upfront sort needed.
  const imagePosts = posts.filter((p) => p.file_type === 'image');

  // View URL cache
  const [viewUrlCache, setViewUrlCache] = useState<{ urls: Record<string, string>; expiresAt: number }>({
    urls: {},
    expiresAt: 0,
  });
  const viewUrlCacheRef = useRef(viewUrlCache);
  viewUrlCacheRef.current = viewUrlCache;
  const imagePostsRef = useRef<Post[]>([]);
  imagePostsRef.current = imagePosts;

  // Only posts that have a slideshow URL
  const displayablePosts =
    viewUrlCache.expiresAt > 0
      ? imagePosts.filter((p) => viewUrlCache.urls[p.id])
      : imagePosts;
  const displayablePostsRef = useRef<Post[]>([]);
  displayablePostsRef.current = displayablePosts;

  // ── Fresh/Archive playback queue ──
  // playQueueRef holds the generated display order (grows forward only, never
  // wraps); historyRef tracks recently-shown posts/participants to keep the
  // Fresh-priority draw from repeating photos or the same participant back-to-back.
  // Both live only in memory for the duration of this page (no persistence).
  const playQueueRef = useRef<Post[]>([]);
  const historyRef = useRef<DisplayHistory>(createDisplayHistory());

  const ensureQueueAt = useCallback((idx: number) => {
    const candidates = displayablePostsRef.current;
    if (candidates.length === 0) return;
    while (playQueueRef.current.length <= idx) {
      const next = drawNextPost(candidates, settingsRef.current.orderMode, historyRef.current);
      if (!next) break;
      playQueueRef.current = [...playQueueRef.current, next];
      historyRef.current = recordDisplayed(historyRef.current, next);
    }
  }, []);

  // Current index (tracks where we are in playQueueRef)
  const [currentIndex, setCurrentIndex] = useState(0);
  const currentIndexRef = useRef(0);
  currentIndexRef.current = currentIndex;

  // ── Room init ──
  useEffect(() => {
    if (!roomId) return;
    Promise.all([api.getRoom(roomId), api.getSlideshowSettings(roomId)])
      .then(([, s]) => setSettings(s))
      .catch((e) =>
        setRoomError(e instanceof ApiError ? e.message : 'ルーム情報の取得に失敗しました')
      );
  }, [roomId]);

  // ── View URL fetching ──
  const fetchingViewUrlsRef = useRef(false);
  const fetchViewUrls = useCallback(async () => {
    if (!roomId || fetchingViewUrlsRef.current) return;
    const imgPosts = imagePostsRef.current;
    if (imgPosts.length === 0) return;

    const now = Math.floor(Date.now() / 1000);
    const cache = viewUrlCacheRef.current;
    const ttlExpired = cache.expiresAt - now < VIEW_URL_REFRESH_BEFORE_EXPIRY;

    // Only fetch missing IDs when TTL is still valid; full refresh on expiry
    const idsToFetch = ttlExpired
      ? imgPosts.map((p) => p.id)
      : imgPosts.filter((p) => !(p.id in cache.urls)).map((p) => p.id);
    if (idsToFetch.length === 0) return;

    fetchingViewUrlsRef.current = true;
    try {
      const res = await api.getViewUrls(roomId, idsToFetch, undefined, 'slideshow');
      if (!mountedRef.current) return;
      if (ttlExpired) {
        setViewUrlCache({ urls: res.viewUrls, expiresAt: res.expiresAt });
      } else {
        // Merge new URLs into existing cache, keep original TTL
        setViewUrlCache((prev) => ({
          urls: { ...prev.urls, ...res.viewUrls },
          expiresAt: prev.expiresAt,
        }));
      }
    } catch {
      /* non-fatal */
    } finally {
      fetchingViewUrlsRef.current = false;
    }
  }, [roomId]);

  useEffect(() => {
    fetchViewUrls();
  }, [imagePosts.length, fetchViewUrls]);
  useEffect(() => {
    const t = setInterval(fetchViewUrls, 60_000);
    return () => clearInterval(t);
  }, [fetchViewUrls]);

  // ── Crossfade layer state ──
  //   curLayer: the image always visible
  //   nxtLayer: the image being faded in (only present during a transition)
  //   nxtShown: when true, CSS transitions opacity (cur→0, nxt→1)
  const [curLayer, setCurLayer] = useState<DisplayLayer | null>(null);
  const [nxtLayer, setNxtLayer] = useState<DisplayLayer | null>(null);
  const [nxtShown, setNxtShown] = useState(false);
  const curLayerRef = useRef<DisplayLayer | null>(null);
  curLayerRef.current = curLayer;

  const transitioningRef = useRef(false);
  const mountedRef = useRef(true);
  useEffect(
    () => () => {
      mountedRef.current = false;
    },
    []
  );

  // ── Core: transition to a specific index in the generated play queue ──
  const transitionTo = useCallback(async (idx: number) => {
    if (transitioningRef.current) return;
    if (displayablePostsRef.current.length === 0) return;
    const safeIdx = Math.max(0, idx);

    ensureQueueAt(safeIdx);
    const post = playQueueRef.current[safeIdx];
    if (!post) return;
    const rawUrl = viewUrlCacheRef.current.urls[post.id];

    // If no URL, advance index silently
    if (!rawUrl) {
      setCurrentIndex(safeIdx);
      return;
    }
    const url = resolvePublicMediaUrl(rawUrl);

    // Skip if already showing this image (e.g. only one candidate left)
    if (curLayerRef.current?.postId === post.id) {
      setCurrentIndex(safeIdx);
      return;
    }

    transitioningRef.current = true;

    // Stage the next layer at opacity 0
    setNxtLayer({ postId: post.id, url, post });
    setNxtShown(false);

    // Preload the image before starting the fade
    await preloadImage(url);
    if (!mountedRef.current) {
      transitioningRef.current = false;
      return;
    }

    // Wait for React to render nxt at opacity:0 before starting transition
    await raf2();
    if (!mountedRef.current) {
      transitioningRef.current = false;
      return;
    }

    // Trigger crossfade
    setNxtShown(true);

    await sleep(FADE_MS);
    if (!mountedRef.current) {
      transitioningRef.current = false;
      return;
    }

    // Swap: nxt becomes cur, clear nxt
    setCurLayer({ postId: post.id, url, post });
    setNxtLayer(null);
    setNxtShown(false);
    setCurrentIndex(safeIdx);
    transitioningRef.current = false;
  }, [ensureQueueAt]);

  // ── Initial display: show first queue entry without animation ──
  const initializedRef = useRef(false);
  useEffect(() => {
    if (initializedRef.current) return;
    if (displayablePostsRef.current.length === 0 || viewUrlCacheRef.current.expiresAt === 0) return;
    ensureQueueAt(0);
    const post = playQueueRef.current[0];
    if (!post) return;
    const rawUrl = viewUrlCacheRef.current.urls[post.id];
    if (!rawUrl) return;
    initializedRef.current = true;
    setCurLayer({ postId: post.id, url: resolvePublicMediaUrl(rawUrl), post });
    setCurrentIndex(0);
  }, [displayablePosts.length, viewUrlCache.expiresAt, ensureQueueAt]); // reads from refs inside

  // Pool went fully empty (e.g. all posts hidden/deleted) — reset to empty state
  // so playback can re-initialize cleanly once posts reappear.
  useEffect(() => {
    if (displayablePosts.length === 0 && curLayerRef.current) {
      playQueueRef.current = [];
      historyRef.current = createDisplayHistory();
      initializedRef.current = false;
      setCurLayer(null);
      setNxtLayer(null);
      setNxtShown(false);
      setCurrentIndex(0);
    }
  }, [displayablePosts.length]);

  // ── Preload next 2 queue entries in background (limit to avoid memory pressure) ──
  useEffect(() => {
    if (displayablePostsRef.current.length === 0) return;
    ensureQueueAt(currentIndexRef.current + 2);
    const cache = viewUrlCacheRef.current;
    for (let i = 1; i <= 2; i++) {
      const p = playQueueRef.current[currentIndexRef.current + i];
      if (!p) continue;
      const rawUrl = cache.urls[p.id];
      if (!rawUrl) continue;
      preloadImage(resolvePublicMediaUrl(rawUrl)).catch(() => {});
    }
  }, [currentIndex, viewUrlCache.expiresAt, ensureQueueAt]);

  // ── Playback ──
  const [isPlaying, setIsPlaying] = useState(true);
  const isPlayingRef = useRef(true);
  isPlayingRef.current = isPlaying;

  useEffect(() => {
    if (!isPlaying || displayablePosts.length === 0) return;
    const t = setInterval(() => {
      // Skip advance when tab is hidden to avoid transitions nobody sees
      if (!isPlayingRef.current || document.hidden) return;
      transitionTo(currentIndexRef.current + 1);
    }, settings.intervalSeconds * 1000);
    return () => clearInterval(t);
  }, [isPlaying, settings.intervalSeconds, displayablePosts.length, transitionTo]);

  // ── Controls auto-hide ──
  const [showControls, setShowControls] = useState(true);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetHideTimer = useCallback(() => {
    setShowControls(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => setShowControls(false), CONTROLS_HIDE_MS);
  }, []);

  useEffect(() => {
    resetHideTimer();
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, [resetHideTimer]);

  // ── Navigation ──
  const goNext = useCallback(() => {
    if (displayablePostsRef.current.length === 0) return;
    transitionTo(currentIndexRef.current + 1);
    resetHideTimer();
  }, [transitionTo, resetHideTimer]);

  const goPrev = useCallback(() => {
    if (displayablePostsRef.current.length === 0) return;
    transitionTo(Math.max(0, currentIndexRef.current - 1));
    resetHideTimer();
  }, [transitionTo, resetHideTimer]);

  const togglePlay = useCallback(() => {
    setIsPlaying((p) => !p);
    resetHideTimer();
  }, [resetHideTimer]);

  // ── Fullscreen ──
  const containerRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const h = () =>
      setIsFullscreen(!!(document.fullscreenElement ?? (document as any).webkitFullscreenElement));
    document.addEventListener('fullscreenchange', h);
    document.addEventListener('webkitfullscreenchange', h);
    return () => {
      document.removeEventListener('fullscreenchange', h);
      document.removeEventListener('webkitfullscreenchange', h);
    };
  }, []);

  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const fsEl = document.fullscreenElement ?? (document as any).webkitFullscreenElement;
    if (fsEl) {
      (document.exitFullscreen?.() ?? (document as any).webkitExitFullscreen?.())?.catch?.(() => {});
    } else {
      (el.requestFullscreen?.() ?? (el as any).webkitRequestFullscreen?.())?.catch?.(() => {});
    }
    resetHideTimer();
  }, [resetHideTimer]);

  // ── Keyboard shortcuts ──
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') {
        goNext();
        e.preventDefault();
      } else if (e.key === 'ArrowLeft') {
        goPrev();
        e.preventDefault();
      } else if (e.key === ' ') {
        togglePlay();
        e.preventDefault();
      } else {
        resetHideTimer();
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [goNext, goPrev, togglePlay, resetHideTimer]);

  // ── Touch swipe ──
  const touchStartXRef = useRef<number | null>(null);

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      touchStartXRef.current = e.touches[0].clientX;
      resetHideTimer();
    },
    [resetHideTimer]
  );

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (touchStartXRef.current === null) return;
      const dx = e.changedTouches[0].clientX - touchStartXRef.current;
      touchStartXRef.current = null;
      if (Math.abs(dx) > 50) {
        dx < 0 ? goNext() : goPrev();
        e.preventDefault();
      }
    },
    [goNext, goPrev]
  );

  // ── Error state ──
  if (roomError) {
    return (
      <div
        style={{
          width: '100vw',
          height: '100vh',
          background: '#000',
          color: '#fff',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 16,
          fontFamily: 'sans-serif',
        }}
      >
        <p style={{ color: '#f88' }}>{roomError}</p>
        <Link to={`/room/${roomId}`} style={{ color: '#aaf' }}>
          ← 戻る
        </Link>
      </div>
    );
  }

  // ── Derived render values ──
  // cur fades out when nxt is fading in; transition only active when nxtLayer present
  const curOpacity = nxtShown ? 0 : 1;
  const nxtOpacity = nxtShown ? 1 : 0;
  const activePost = curLayer?.post ?? playQueueRef.current[currentIndex] ?? null;

  // ── Render ──
  return (
    <div
      ref={containerRef}
      style={{
        position: 'fixed',
        inset: 0,
        background: '#000',
        overflow: 'hidden',
        cursor: showControls ? 'default' : 'none',
        userSelect: 'none',
      }}
      onMouseMove={resetHideTimer}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* ── Empty state ── */}
      {displayablePosts.length === 0 && !curLayer && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#555',
            fontFamily: 'sans-serif',
            pointerEvents: 'none',
          }}
        >
          <p style={{ fontSize: 18, marginBottom: 8 }}>まだ表示できる写真がありません</p>
          <p style={{ fontSize: 14 }}>写真が投稿されるとここに表示されます</p>
        </div>
      )}

      {/* ── Current image layer (always visible until fully replaced) ── */}
      {curLayer && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            opacity: curOpacity,
            // Only enable CSS transition when a next layer is actively fading in
            transition: nxtLayer ? `opacity ${FADE_MS}ms ease-in-out` : 'none',
            zIndex: 1,
          }}
        >
          <img
            src={curLayer.url}
            alt=""
            draggable={false}
            style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
          />
        </div>
      )}

      {/* ── Next image layer (only present during transition, fades in on top) ── */}
      {nxtLayer && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            opacity: nxtOpacity,
            transition: `opacity ${FADE_MS}ms ease-in-out`,
            zIndex: 2,
          }}
        >
          <img
            src={nxtLayer.url}
            alt=""
            draggable={false}
            style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
          />
        </div>
      )}

      {/* ── Controls overlay: fades in/out on activity ── */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          opacity: showControls ? 1 : 0,
          transition: 'opacity 400ms ease',
          pointerEvents: showControls ? 'auto' : 'none',
          zIndex: 10,
        }}
      >
        {/* Top gradient + back link + counter */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            padding: '16px 20px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: 'linear-gradient(to bottom, rgba(0,0,0,0.7) 0%, transparent 100%)',
          }}
        >
          <Link
            to={`/room/${roomId}`}
            style={{
              color: '#ddd',
              textDecoration: 'none',
              fontSize: 15,
              padding: '4px 0',
              fontFamily: 'sans-serif',
            }}
          >
            ← 戻る
          </Link>
          <span style={{ fontSize: 13, color: '#bbb', fontFamily: 'sans-serif' }}>
            {displayablePosts.length > 0
              ? `${(currentIndex % displayablePosts.length) + 1} / ${displayablePosts.length}`
              : ''}
            {pollError && (
              <span style={{ marginLeft: 8, color: '#f88', fontSize: 11 }}>更新エラー</span>
            )}
          </span>
        </div>

        {/* Bottom gradient + nickname + controls */}
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            padding: '16px 20px 28px',
            background: 'linear-gradient(to top, rgba(0,0,0,0.7) 0%, transparent 100%)',
            fontFamily: 'sans-serif',
          }}
        >
          {settings.showNickname && activePost && (
            <div
              style={{
                color: '#ccc',
                fontSize: 14,
                textAlign: 'center',
                marginBottom: 14,
              }}
            >
              {activePost.nickname}
            </div>
          )}
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              gap: 12,
            }}
          >
            <CtrlBtn onClick={goPrev} disabled={displayablePosts.length <= 1} title="前へ">
              ‹
            </CtrlBtn>
            <CtrlBtn
              onClick={togglePlay}
              title={isPlaying ? '一時停止' : '再生'}
              size={22}
            >
              {isPlaying ? '⏸' : '▶'}
            </CtrlBtn>
            <CtrlBtn onClick={goNext} disabled={displayablePosts.length <= 1} title="次へ">
              ›
            </CtrlBtn>
            <CtrlBtn
              onClick={toggleFullscreen}
              title={isFullscreen ? '全画面解除' : '全画面'}
              size={18}
            >
              {isFullscreen ? '⊡' : '⊞'}
            </CtrlBtn>
          </div>
        </div>

        {/* Side navigation arrows */}
        {displayablePosts.length > 1 && (
          <>
            <SideNav side="left" onClick={goPrev} />
            <SideNav side="right" onClick={goNext} />
          </>
        )}
      </div>
    </div>
  );
}

import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api, ApiError, type Post, type SlideshowSettings } from '../api/client';
import { usePostsPolling } from '../hooks/usePostsPolling';

const VIEW_URL_REFRESH_BEFORE_EXPIRY = 120; // 有効期限の2分前に再取得

/** HEIC/HEIF は環境によって img 表示が失敗しやすい */
function isHeicMime(mime: string | undefined): boolean {
  return mime === 'image/heic' || mime === 'image/heif';
}

interface ViewUrlCache {
  urls: Record<string, string>;
  expiresAt: number;
}

export default function SlideshowPage() {
  const { roomId } = useParams<{ roomId: string }>();

  const [roomError, setRoomError] = useState('');
  const [settings, setSettings] = useState<SlideshowSettings>({
    intervalSeconds: 5,
    showNickname: true,
    orderMode: 'asc',
  });

  const { posts, error: pollError } = usePostsPolling(roomId);
  const imagePosts = posts.filter((p) => p.file_type === 'image');

  const [currentIndex, setCurrentIndex] = useState(0);
  const [viewUrlCache, setViewUrlCache] = useState<ViewUrlCache>({ urls: {}, expiresAt: 0 });
  const [urlLoading, setUrlLoading] = useState(false);
  const [imageLoadError, setImageLoadError] = useState(false);
  const viewUrlCacheRef = useRef(viewUrlCache);
  viewUrlCacheRef.current = viewUrlCache;

  const imagePostsRef = useRef<Post[]>([]);
  imagePostsRef.current = imagePosts;

  // Reset index when new posts arrive and index is out of bounds
  useEffect(() => {
    if (currentIndex >= imagePosts.length && imagePosts.length > 0) {
      setCurrentIndex(0);
    }
  }, [imagePosts.length, currentIndex]);

  // Load room info and settings
  useEffect(() => {
    if (!roomId) return;
    Promise.all([api.getRoom(roomId), api.getSlideshowSettings(roomId)])
      .then(([, s]) => setSettings(s))
      .catch((e) =>
        setRoomError(e instanceof ApiError ? e.message : 'ルーム情報の取得に失敗しました')
      );
  }, [roomId]);

  // Fetch viewUrls for current posts
  const fetchViewUrls = useCallback(async () => {
    if (!roomId) return;
    const posts = imagePostsRef.current;
    if (posts.length === 0) return;

    const now = Math.floor(Date.now() / 1000);
    const cache = viewUrlCacheRef.current;
    const needsRefresh =
      cache.expiresAt - now < VIEW_URL_REFRESH_BEFORE_EXPIRY ||
      posts.some((p) => !(p.id in cache.urls));

    if (!needsRefresh) return;

    setUrlLoading(true);
    try {
      const res = await api.getViewUrls(roomId, posts.map((p) => p.id));
      setViewUrlCache({ urls: res.viewUrls, expiresAt: res.expiresAt });
    } catch (_e) {
      // non-fatal: keep showing existing URLs if any
    } finally {
      setUrlLoading(false);
    }
  }, [roomId]);

  // Refresh viewUrls when posts change or periodically
  useEffect(() => {
    fetchViewUrls();
  }, [imagePosts.length, fetchViewUrls]);

  useEffect(() => {
    const timer = setInterval(fetchViewUrls, 60_000);
    return () => clearInterval(timer);
  }, [fetchViewUrls]);

  // Slideshow auto-advance
  useEffect(() => {
    if (imagePosts.length <= 1) return;
    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % imagePostsRef.current.length);
    }, settings.intervalSeconds * 1000);
    return () => clearInterval(timer);
  }, [settings.intervalSeconds, imagePosts.length]);

  const currentPost = imagePosts[currentIndex];
  const currentUrl = currentPost ? viewUrlCache.urls[currentPost.id] : undefined;

  useEffect(() => {
    setImageLoadError(false);
  }, [currentPost?.id, currentUrl]);

  if (roomError) {
    return (
      <div
        style={{
          minHeight: '100vh',
          background: '#111',
          color: '#fff',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 16,
        }}
      >
        <p style={{ color: '#f88' }}>{roomError}</p>
        <Link to="/" style={{ color: '#aaf' }}>
          トップへ戻る
        </Link>
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#111',
        color: '#fff',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Top bar */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 10,
          padding: '10px 16px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'rgba(0,0,0,0.4)',
        }}
      >
        <Link
          to={`/room/${roomId}`}
          style={{ color: '#ccc', textDecoration: 'none', fontSize: 13 }}
        >
          ← 戻る
        </Link>
        <span style={{ fontSize: 13, color: '#aaa' }}>
          {imagePosts.length > 0
            ? `${currentIndex + 1} / ${imagePosts.length}`
            : ''}
          {pollError && <span style={{ marginLeft: 8, color: '#f88', fontSize: 11 }}>更新エラー</span>}
          {urlLoading && <span style={{ marginLeft: 8, color: '#aaa', fontSize: 11 }}>URL取得中</span>}
        </span>
      </div>

      {/* Main display */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '60px 0 40px',
        }}
      >
        {imagePosts.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#666' }}>
            <p style={{ fontSize: 20, marginBottom: 8 }}>まだ写真が投稿されていません</p>
            <p style={{ fontSize: 14 }}>写真が投稿されるとここに表示されます</p>
          </div>
        ) : currentUrl ? (
          imageLoadError ? (
            <div style={{ textAlign: 'center', color: '#aaa', maxWidth: 420, padding: 16, lineHeight: 1.6 }}>
              {isHeicMime(currentPost?.mime_type) ? (
                <>
                  <p style={{ fontSize: 16, marginBottom: 8, color: '#c88' }}>
                    HEIC / HEIF の表示に失敗しました
                  </p>
                  <p style={{ fontSize: 13, color: '#777' }}>
                    iPhone の「設定 → カメラ → フォーマット」で互換性優先（JPEG）にするか、JPEG / PNG
                    での投稿を試してください。
                  </p>
                </>
              ) : (
                <>
                  <p style={{ fontSize: 15, color: '#c88' }}>画像の表示に失敗しました</p>
                  <p style={{ fontSize: 13, color: '#888', marginTop: 8 }}>
                    ネットワークや形式を確認し、ページを再読み込みしてください。
                  </p>
                </>
              )}
            </div>
          ) : (
            <img
              key={`${currentPost?.id}-${currentUrl}`}
              src={currentUrl}
              alt={currentPost?.nickname}
              onError={() => setImageLoadError(true)}
              style={{
                maxWidth: '100%',
                maxHeight: 'calc(100vh - 120px)',
                objectFit: 'contain',
                borderRadius: 4,
              }}
            />
          )
        ) : (
          <div style={{ color: '#555', fontSize: 14 }}>
            {urlLoading ? '読み込み中...' : '画像を準備中です'}
          </div>
        )}
      </div>

      {/* Nickname overlay */}
      {settings.showNickname && currentPost && (
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            padding: '12px 20px',
            background: 'rgba(0,0,0,0.5)',
            fontSize: 15,
            color: '#fff',
          }}
        >
          {currentPost.nickname}
          <span style={{ marginLeft: 12, fontSize: 12, color: '#aaa' }}>
            {new Date(currentPost.created_at * 1000).toLocaleString('ja-JP')}
          </span>
        </div>
      )}

      {/* Manual nav */}
      {imagePosts.length > 1 && (
        <>
          <button
            onClick={() =>
              setCurrentIndex((prev) => (prev - 1 + imagePosts.length) % imagePosts.length)
            }
            style={{
              position: 'absolute',
              left: 8,
              top: '50%',
              transform: 'translateY(-50%)',
              background: 'rgba(255,255,255,0.15)',
              border: 'none',
              color: '#fff',
              fontSize: 24,
              padding: '12px 16px',
              cursor: 'pointer',
              borderRadius: 4,
            }}
          >
            ‹
          </button>
          <button
            onClick={() =>
              setCurrentIndex((prev) => (prev + 1) % imagePosts.length)
            }
            style={{
              position: 'absolute',
              right: 8,
              top: '50%',
              transform: 'translateY(-50%)',
              background: 'rgba(255,255,255,0.15)',
              border: 'none',
              color: '#fff',
              fontSize: 24,
              padding: '12px 16px',
              cursor: 'pointer',
              borderRadius: 4,
            }}
          >
            ›
          </button>
        </>
      )}
    </div>
  );
}

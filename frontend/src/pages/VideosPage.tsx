import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api, resolvePublicMediaUrl, type Post } from '../api/client';
import { isMobileDevice } from '../utils/device';
import { openVideoUrl } from '../utils/videoDownload';

type VideoSaveProgress = {
  phase: 'fetching' | 'done' | 'error';
  current: number;
  total: number;
};

function formatVideoSaveProgress(progress: VideoSaveProgress): string {
  if (progress.phase === 'fetching') return `動画を取得中 ${progress.current} / ${progress.total}`;
  if (progress.phase === 'done') return '保存を開始しました';
  return '保存に失敗しました。もう一度お試しください。';
}

// ---- Video Modal ----

interface VideoModalProps {
  post: Post;
  videoUrl: string;
  isMobile: boolean;
  saveStatus: string;
  onClose: () => void;
  onDownload: () => void;
}

function VideoModal({ post, videoUrl, isMobile, saveStatus, onClose, onDownload }: VideoModalProps) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.97)', zIndex: 2000, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', flexShrink: 0 }}>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#fff', fontSize: 22, cursor: 'pointer', padding: '6px 10px', lineHeight: 1 }}>✕</button>
        <span style={{ fontSize: 13, color: '#ccc' }}>{post.nickname}</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            onClick={onDownload}
            style={{
              background: '#b8860b',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              padding: '8px 18px',
              fontSize: 13,
              cursor: 'pointer',
              fontWeight: 'bold',
              minHeight: 40,
            }}
          >
            {isMobile ? 'ファイルに保存' : '保存'}
          </button>
        </div>
      </div>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', padding: '0 8px' }}>
        <video
          src={resolvePublicMediaUrl(videoUrl)}
          controls
          autoPlay
          playsInline
          style={{ maxWidth: '100%', maxHeight: '100%', borderRadius: 8 }}
        />
      </div>
      <div style={{ padding: '10px 16px', background: 'rgba(0,0,0,0.6)', color: '#ccc', fontSize: 13, flexShrink: 0 }}>
        {post.nickname}
        <span style={{ marginLeft: 10, fontSize: 11, color: '#777' }}>{new Date(post.created_at * 1000).toLocaleString('ja-JP')}</span>
        <div style={{ marginTop: 8, fontSize: 12, color: '#aaa' }}>
          {saveStatus || '容量が大きいと再生されないことがあります。'}
        </div>
      </div>
    </div>
  );
}

// ---- Main Component ----

export default function VideosPage() {
  const { roomId } = useParams<{ roomId: string }>();

  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [thumbUrls, setThumbUrls] = useState<Record<string, string>>({});
  const [videoUrls, setVideoUrls] = useState<Record<string, string>>({});
  const [playingPost, setPlayingPost] = useState<Post | null>(null);
  const [loadingVideoId, setLoadingVideoId] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState('');
  const [saveProgress, setSaveProgress] = useState<VideoSaveProgress | null>(null);
  const isMobile = isMobileDevice();

  useEffect(() => {
    if (!roomId) return;
    setLoading(true);
    api.getPosts(roomId, undefined, 'video')
      .then(r => {
        const videoPosts = r.posts.filter(p => p.file_type === 'video');
        setPosts(videoPosts);
        if (videoPosts.length === 0) { setLoading(false); return; }
        return api.getViewUrls(roomId, videoPosts.map(p => p.id), undefined, 'thumbnail').then(v =>
          setThumbUrls(v.viewUrls)
        );
      })
      .catch(() => setError('データの取得に失敗しました。'))
      .finally(() => setLoading(false));
  }, [roomId]);

  async function handleDownload(post: Post) {
    if (!roomId) return;
    setSaveStatus('');
    setSaveProgress({ phase: 'fetching', current: 0, total: 1 });
    try {
      const res = await api.getViewUrls(roomId, [post.id]);
      const url = res.viewUrls[post.id];
      if (!url) throw new Error('video url not found');
      setVideoUrls(prev => ({ ...prev, [post.id]: url }));

      // Video must never be fetched into a Blob: R2 presigned URLs aren't
      // CORS-enabled for that, and large files would be slow/memory-heavy.
      // Open it directly and let the browser/OS handle the save.
      openVideoUrl(resolvePublicMediaUrl(url));

      setSaveProgress({ phase: 'done', current: 1, total: 1 });
      setSaveStatus('保存を開始しました。ブラウザのダウンロード状況をご確認ください。');
      setTimeout(() => setSaveProgress(null), 1200);
    } catch {
      setSaveProgress({ phase: 'error', current: 0, total: 1 });
      setSaveStatus('保存用URLを開けませんでした。もう一度お試しください。');
      setTimeout(() => setSaveProgress(null), 3000);
    }
  }

  async function handlePlay(post: Post) {
    setSaveStatus('');
    if (videoUrls[post.id]) {
      setPlayingPost(post);
      return;
    }
    setLoadingVideoId(post.id);
    try {
      const res = await api.getViewUrls(roomId!, [post.id]);
      const url = res.viewUrls[post.id];
      if (url) {
        setVideoUrls(prev => ({ ...prev, [post.id]: url }));
        setPlayingPost(post);
      }
    } catch {
      // non-fatal
    } finally {
      setLoadingVideoId(null);
    }
  }

  const accentColor = '#b8860b';

  const outerStyle: React.CSSProperties = {
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #f9f5ef 0%, #f0e8d5 100%)',
    fontFamily: 'Georgia, "Noto Serif JP", serif',
    color: '#333',
  };
  const stickyBarStyle: React.CSSProperties = {
    position: 'sticky',
    top: 0,
    zIndex: 20,
    background: 'rgba(249, 245, 239, 0.92)',
    backdropFilter: 'blur(10px)',
    WebkitBackdropFilter: 'blur(10px)',
    borderBottom: '1px solid rgba(184, 134, 11, 0.14)',
    boxShadow: '0 6px 18px rgba(80, 55, 20, 0.08)',
  };

  if (loading) return <div style={{ ...outerStyle, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><p style={{ color: '#888' }}>読み込み中...</p></div>;
  if (error) return (
    <div style={{ ...outerStyle, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
      <p style={{ color: '#c00' }}>{error}</p>
      <Link to={`/room/${roomId}`} style={{ color: accentColor }}>← 戻る</Link>
    </div>
  );

  return (
    <div style={outerStyle}>
      {playingPost && videoUrls[playingPost.id] && (
        <VideoModal
          post={playingPost}
          videoUrl={videoUrls[playingPost.id]}
          isMobile={isMobile}
          saveStatus={saveStatus}
          onClose={() => setPlayingPost(null)}
          onDownload={() => handleDownload(playingPost)}
        />
      )}

      <div style={stickyBarStyle}>
        <div style={{ padding: '12px 16px 8px', maxWidth: 800, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 10 }}>
          <Link to={`/room/${roomId}`} style={{ fontSize: 14, color: accentColor, textDecoration: 'none', minHeight: 44, display: 'flex', alignItems: 'center' }}>← 戻る</Link>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 'normal', color: accentColor, flex: 1 }}>動画一覧</h1>
          <span style={{ fontSize: 12, color: '#888' }}>{posts.length}件</span>
        </div>
        {saveProgress && (
          <div style={{ maxWidth: 800, margin: '0 auto', padding: '0 16px 12px' }}>
            <span style={{ fontSize: 13, color: saveProgress.phase === 'error' ? '#c00' : '#666', fontWeight: 'bold' }}>
              {formatVideoSaveProgress(saveProgress)}
            </span>
          </div>
        )}
      </div>

      <div style={{ maxWidth: 800, margin: '0 auto', padding: '16px 16px 40px' }}>
        {posts.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: '#888', fontSize: 14 }}>
            <p style={{ margin: 0 }}>まだ動画はありません</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
            {posts.map(post => {
              const thumb = thumbUrls[post.id];
              const isLoading = loadingVideoId === post.id;
              return (
                <div
                  key={post.id}
                  onClick={() => !isLoading && handlePlay(post)}
                  style={{
                    borderRadius: 10, overflow: 'hidden', cursor: isLoading ? 'wait' : 'pointer',
                    background: '#2a2a3a', position: 'relative',
                    WebkitTapHighlightColor: 'transparent',
                  }}
                >
                  <div style={{ aspectRatio: '16/9', position: 'relative' }}>
                    {thumb ? (
                      <img src={resolvePublicMediaUrl(thumb)} alt="" loading="lazy" decoding="async"
                        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                    ) : (
                      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <span style={{ fontSize: 28, color: '#667' }}>▶</span>
                      </div>
                    )}
                    <div style={{
                      position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: 'rgba(0,0,0,0.3)',
                    }}>
                      {isLoading ? (
                        <span style={{ fontSize: 13, color: '#fff' }}>読込中...</span>
                      ) : (
                        <div style={{
                          width: 44, height: 44, borderRadius: '50%', background: 'rgba(255,255,255,0.25)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          <span style={{ fontSize: 20, color: '#fff', marginLeft: 3 }}>▶</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <div style={{ padding: '8px 10px', background: 'rgba(0,0,0,0.6)' }}>
                    <div style={{ fontSize: 12, color: '#ccc', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {post.nickname}
                    </div>
                    <div style={{ fontSize: 10, color: '#777', marginTop: 2 }}>
                      {new Date(post.created_at * 1000).toLocaleDateString('ja-JP')}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

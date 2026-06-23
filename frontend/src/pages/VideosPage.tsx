import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api, resolvePublicMediaUrl, type Post } from '../api/client';
import { isShareSupported, shareMedia } from '../utils/share';

function mimeToExt(mime: string): string {
  const map: Record<string, string> = {
    'video/mp4': 'mp4',
    'video/quicktime': 'mov',
  };
  return map[mime.toLowerCase()] ?? 'mp4';
}

function buildDownloadFilename(post: Post): string {
  const short = post.id.slice(0, 8);
  return `video_${short}.${mimeToExt(post.mime_type)}`;
}

// ---- Video Modal ----

interface VideoModalProps {
  post: Post;
  videoUrl: string;
  saving: boolean;
  onClose: () => void;
  onDownload: () => void;
  onShare: () => void;
}

function VideoModal({ post, videoUrl, saving, onClose, onDownload, onShare }: VideoModalProps) {
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
          {isShareSupported() && (
            <button
              type="button"
              onClick={onShare}
              style={{ background: '#444', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 14px', fontSize: 13, cursor: 'pointer', fontWeight: 'bold', minHeight: 40 }}
            >
              共有
            </button>
          )}
          <button
            type="button"
            onClick={onDownload}
            disabled={saving}
            style={{
              background: '#b8860b',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              padding: '8px 18px',
              fontSize: 13,
              cursor: saving ? 'wait' : 'pointer',
              fontWeight: 'bold',
              minHeight: 40,
              opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? '保存中...' : '保存'}
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
          動画は端末によってファイル保存になる場合があります
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
  const [saving, setSaving] = useState(false);

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
    if (!roomId || saving) return;
    setSaving(true);
    try {
      let url = videoUrls[post.id];
      if (!url) {
        const res = await api.getViewUrls(roomId, [post.id]);
        url = res.viewUrls[post.id];
        if (url) setVideoUrls(prev => ({ ...prev, [post.id]: url! }));
      }
      if (!url) return;
      const resp = await fetch(resolvePublicMediaUrl(url));
      if (!resp.ok) throw new Error('fetch failed');
      const blob = await resp.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = buildDownloadFilename(post);
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(a.href);
    } catch {
      // non-fatal
    } finally {
      setSaving(false);
    }
  }

  async function handleShare(post: Post) {
    if (!roomId) return;
    try {
      let url = videoUrls[post.id];
      if (!url) {
        const res = await api.getViewUrls(roomId, [post.id]);
        url = res.viewUrls[post.id];
        if (url) setVideoUrls(prev => ({ ...prev, [post.id]: url! }));
      }
      if (!url) return;
      const shared = await shareMedia(resolvePublicMediaUrl(url), buildDownloadFilename(post), post.mime_type);
      if (!shared) await handleDownload(post);
    } catch {
      // non-fatal
    }
  }

  async function handlePlay(post: Post) {
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
          saving={saving}
          onClose={() => setPlayingPost(null)}
          onDownload={() => handleDownload(playingPost)}
          onShare={() => handleShare(playingPost)}
        />
      )}

      <div style={{ padding: '16px 16px 10px', maxWidth: 800, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 10 }}>
        <Link to={`/room/${roomId}`} style={{ fontSize: 14, color: accentColor, textDecoration: 'none', minHeight: 44, display: 'flex', alignItems: 'center' }}>← 戻る</Link>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 'normal', color: accentColor, flex: 1 }}>動画一覧</h1>
        <span style={{ fontSize: 12, color: '#888' }}>{posts.length}件</span>
      </div>

      <div style={{ maxWidth: 800, margin: '0 auto', padding: '0 16px 40px' }}>
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

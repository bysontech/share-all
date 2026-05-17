import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api, resolvePublicMediaUrl, type Post } from '../api/client';

// ---- Preview Modal ----

interface PreviewModalProps {
  post: Post;
  url: string;
  index: number;
  total: number;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
  onDownload: () => void;
}

function PreviewModal({ post, url, index, total, onClose, onPrev, onNext, onDownload }: PreviewModalProps) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') onPrev();
      if (e.key === 'ArrowRight') onNext();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, onPrev, onNext]);

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.96)', zIndex: 2000, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', flexShrink: 0 }}>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#fff', fontSize: 22, cursor: 'pointer', padding: '6px 10px', lineHeight: 1 }}>✕</button>
        <span style={{ fontSize: 13, color: '#999' }}>{index + 1} / {total}</span>
        <button onClick={onDownload} style={{ background: '#b8860b', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 18px', fontSize: 13, cursor: 'pointer', fontWeight: 'bold', minHeight: 40 }}>保存</button>
      </div>
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <img key={post.id} src={resolvePublicMediaUrl(url)} alt={post.nickname}
          style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', display: 'block' }} />
        {total > 1 && (
          <>
            <button onClick={onPrev} style={{ position: 'absolute', left: 6, top: '50%', transform: 'translateY(-50%)', background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', fontSize: 26, padding: '14px 16px', cursor: 'pointer', borderRadius: 4, minHeight: 56 }}>‹</button>
            <button onClick={onNext} style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', fontSize: 26, padding: '14px 16px', cursor: 'pointer', borderRadius: 4, minHeight: 56 }}>›</button>
          </>
        )}
      </div>
      <div style={{ padding: '10px 16px', background: 'rgba(0,0,0,0.6)', color: '#ccc', fontSize: 13, flexShrink: 0 }}>
        {post.nickname}
        <span style={{ marginLeft: 10, fontSize: 11, color: '#777' }}>{new Date(post.created_at * 1000).toLocaleString('ja-JP')}</span>
      </div>
    </div>
  );
}

// ---- Main Component ----

export default function PhotosPage() {
  const { roomId } = useParams<{ roomId: string }>();

  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [viewUrls, setViewUrls] = useState<Record<string, string>>({});
  const [previewPostId, setPreviewPostId] = useState<string | null>(null);

  useEffect(() => {
    if (!roomId) return;
    setLoading(true);
    api.getPosts(roomId, undefined, 'album')
      .then(r => {
        const imagePosts = r.posts.filter(p => p.file_type === 'image');
        setPosts(imagePosts);
        if (imagePosts.length === 0) { setLoading(false); return; }
        return api.getViewUrls(roomId, imagePosts.map(p => p.id), undefined, 'thumbnail').then(v =>
          setViewUrls(v.viewUrls)
        );
      })
      .catch(() => setError('データの取得に失敗しました。'))
      .finally(() => setLoading(false));
  }, [roomId]);

  const previewablePosts = posts.filter(p => viewUrls[p.id]);
  const previewIndex = previewPostId ? previewablePosts.findIndex(p => p.id === previewPostId) : -1;
  const previewPost = previewIndex >= 0 ? previewablePosts[previewIndex] : null;

  function previewPrev() {
    if (previewablePosts.length === 0) return;
    setPreviewPostId(previewablePosts[(previewIndex - 1 + previewablePosts.length) % previewablePosts.length].id);
  }
  function previewNext() {
    if (previewablePosts.length === 0) return;
    setPreviewPostId(previewablePosts[(previewIndex + 1) % previewablePosts.length].id);
  }

  async function handleDownload(post: Post) {
    if (!roomId) return;
    try {
      const res = await api.getViewUrls(roomId, [post.id]);
      const url = res.viewUrls[post.id];
      if (!url) return;
      const resp = await fetch(resolvePublicMediaUrl(url));
      if (!resp.ok) return;
      const blob = await resp.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      const ext = post.mime_type.split('/')[1] ?? 'jpg';
      a.download = `photo_${post.id.slice(0, 8)}.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(a.href);
    } catch {
      // non-fatal
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
      {previewPost && (
        <PreviewModal
          post={previewPost}
          url={viewUrls[previewPost.id]}
          index={previewIndex}
          total={previewablePosts.length}
          onClose={() => setPreviewPostId(null)}
          onPrev={previewPrev}
          onNext={previewNext}
          onDownload={() => handleDownload(previewPost)}
        />
      )}

      <div style={{ padding: '16px 16px 10px', maxWidth: 800, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 10 }}>
        <Link to={`/room/${roomId}`} style={{ fontSize: 14, color: accentColor, textDecoration: 'none', minHeight: 44, display: 'flex', alignItems: 'center' }}>← 戻る</Link>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 'normal', color: accentColor, flex: 1 }}>写真アルバム</h1>
        <span style={{ fontSize: 12, color: '#888' }}>{posts.length}枚</span>
      </div>

      <div style={{ maxWidth: 800, margin: '0 auto', padding: '0 16px 40px' }}>
        {posts.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: '#888', fontSize: 14 }}>
            <p style={{ margin: 0 }}>まだアルバム用の写真はありません</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: 6 }}>
            {posts.map(post => {
              const url = viewUrls[post.id];
              const clickable = !!url;
              return (
                <div
                  key={post.id}
                  onClick={() => clickable && setPreviewPostId(post.id)}
                  style={{
                    position: 'relative', aspectRatio: '1', borderRadius: 8, overflow: 'hidden',
                    cursor: clickable ? 'pointer' : 'default',
                    border: '3px solid transparent', boxSizing: 'border-box',
                    WebkitTapHighlightColor: 'transparent',
                  }}
                >
                  {url ? (
                    <img src={resolvePublicMediaUrl(url)} alt="" loading="lazy" decoding="async"
                      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                  ) : (
                    <div style={{ width: '100%', height: '100%', background: '#ede8df', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ fontSize: 14, color: '#bbb' }}>🖼</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

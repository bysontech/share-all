import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api, resolvePublicMediaUrl, type Post } from '../api/client';

function mimeToExt(mime: string): string {
  const map: Record<string, string> = {
    'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
    'image/heic': 'heic', 'image/heif': 'heif',
  };
  return map[mime.toLowerCase()] ?? 'jpg';
}

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
  const [selectionMode, setSelectionMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);

  useEffect(() => {
    if (!roomId) return;
    setLoading(true);
    api.getPosts(roomId, undefined, 'album')
      .then(r => {
        const imagePosts = r.posts.filter(p => p.file_type === 'image');
        setPosts(imagePosts);
        if (imagePosts.length === 0) { setLoading(false); return; }
        return api.getViewUrls(roomId, imagePosts.map(p => p.id), undefined, 'display').then(v =>
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

  const downloadPosts = useCallback(async (targets: Post[]) => {
    if (!roomId || targets.length === 0) return;
    setProgress({ current: 0, total: targets.length });
    let urls: Record<string, string> = {};
    try {
      const res = await api.getViewUrls(roomId, targets.map(p => p.id));
      urls = res.viewUrls;
    } catch {
      setProgress(null);
      return;
    }
    let done = 0;
    for (const post of targets) {
      const url = urls[post.id];
      if (!url) { done++; setProgress({ current: done, total: targets.length }); continue; }
      try {
        const resp = await fetch(resolvePublicMediaUrl(url));
        if (!resp.ok) throw new Error('fetch failed');
        const blob = await resp.blob();
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `photo_${post.id.slice(0, 8)}.${mimeToExt(post.mime_type)}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(a.href);
      } catch { /* skip */ }
      done++;
      setProgress({ current: done, total: targets.length });
    }
    setProgress(null);
  }, [roomId]);

  async function handleDownload(post: Post) {
    await downloadPosts([post]);
  }

  function toggleSelectionMode() {
    setSelectionMode(m => {
      if (m) setSelected(new Set());
      setPreviewPostId(null);
      return !m;
    });
  }

  function toggleSelect(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function handleTileClick(post: Post) {
    if (selectionMode) {
      toggleSelect(post.id);
    } else if (viewUrls[post.id]) {
      setPreviewPostId(post.id);
    }
  }

  const accentColor = '#b8860b';
  const btnBase: React.CSSProperties = {
    padding: '10px 14px', borderRadius: 6, border: 'none', cursor: 'pointer',
    fontSize: 13, fontWeight: 'bold', minHeight: 44, boxSizing: 'border-box',
  };
  const primaryBtn: React.CSSProperties = { ...btnBase, background: accentColor, color: '#fff' };
  const secondaryBtn: React.CSSProperties = { ...btnBase, background: '#e8e0d0', color: '#555' };
  const disabledBtn: React.CSSProperties = { ...btnBase, background: '#ccc', color: '#999', cursor: 'not-allowed' };
  const isDownloading = progress !== null;

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
        {posts.length > 0 && (
          <button
            type="button"
            onClick={toggleSelectionMode}
            style={{
              ...btnBase,
              background: selectionMode ? accentColor : '#e8e0d0',
              color: selectionMode ? '#fff' : '#555',
              padding: '8px 14px',
              minHeight: 38,
            }}
          >
            {selectionMode ? '完了' : '選択'}
          </button>
        )}
      </div>

      <div style={{ maxWidth: 800, margin: '0 auto', padding: '0 16px 40px' }}>
        {selectionMode && posts.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
            <button type="button" style={secondaryBtn} onClick={() => setSelected(new Set(posts.map(p => p.id)))}>全選択</button>
            <button type="button" style={secondaryBtn} onClick={() => setSelected(new Set())}>全解除</button>
            <button
              type="button"
              style={selected.size > 0 && !isDownloading ? primaryBtn : disabledBtn}
              disabled={selected.size === 0 || isDownloading}
              onClick={() => downloadPosts(posts.filter(p => selected.has(p.id)))}
            >
              選択した写真を保存 ({selected.size})
            </button>
          </div>
        )}
        {progress && (
          <p style={{ marginBottom: 12, fontSize: 13, color: '#666' }}>
            保存中... {progress.current} / {progress.total}
          </p>
        )}
        {posts.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: '#888', fontSize: 14 }}>
            <p style={{ margin: 0 }}>まだアルバム用の写真はありません</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: 6 }}>
            {posts.map(post => {
              const url = viewUrls[post.id];
              const isSelected = selected.has(post.id);
              return (
                <div
                  key={post.id}
                  onClick={() => handleTileClick(post)}
                  style={{
                    position: 'relative', aspectRatio: '1', borderRadius: 8, overflow: 'hidden',
                    cursor: selectionMode || url ? 'pointer' : 'default',
                    border: isSelected ? `3px solid ${accentColor}` : '3px solid transparent',
                    boxSizing: 'border-box',
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
                  {selectionMode && isSelected && (
                    <div style={{
                      position: 'absolute', top: 5, right: 5, width: 22, height: 22, borderRadius: '50%',
                      background: accentColor, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 13, color: '#fff', fontWeight: 'bold', pointerEvents: 'none',
                    }}>✓</div>
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

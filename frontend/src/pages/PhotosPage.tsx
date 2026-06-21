import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api, resolvePublicMediaUrl, type Post } from '../api/client';
import { getParticipantId } from '../utils/participantId';

const MAX_SELECTION = 100;
const SAVED_KEY = (roomId: string) => `room:${roomId}:savedPostIds`;

function loadSaved(roomId: string): Set<string> {
  try {
    const raw = localStorage.getItem(SAVED_KEY(roomId));
    const arr = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(arr) ? arr.filter((v): v is string => typeof v === 'string') : []);
  } catch {
    return new Set();
  }
}

function saveSaved(roomId: string, ids: Set<string>) {
  try {
    localStorage.setItem(SAVED_KEY(roomId), JSON.stringify([...ids]));
  } catch {
    // localStorage failure is non-fatal; the download itself already happened.
  }
}

function mimeToExt(mime: string): string {
  const map: Record<string, string> = {
    'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
    'image/heic': 'heic', 'image/heif': 'heif',
  };
  return map[mime.toLowerCase()] ?? 'jpg';
}

function buildDownloadFilename(post: Post, sequence: number): string {
  const seq = String(sequence).padStart(3, '0');
  const short = post.id.slice(0, 8);
  return `photo_${seq}_${short}.${mimeToExt(post.mime_type)}`;
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
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
  const [saved, setSaved] = useState<Set<string>>(() => loadSaved(roomId ?? ''));
  const [selectionMessage, setSelectionMessage] = useState('');
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const selfParticipantId = roomId ? getParticipantId(roomId) : null;
  const isDragSelectingRef = useRef(false);
  const dragStartIndexRef = useRef<number | null>(null);
  const lastDragIndexRef = useRef<number | null>(null);

  useEffect(() => {
    function stopDragSelect() {
      isDragSelectingRef.current = false;
      dragStartIndexRef.current = null;
      lastDragIndexRef.current = null;
    }

    window.addEventListener('pointerup', stopDragSelect);
    window.addEventListener('pointercancel', stopDragSelect);
    return () => {
      window.removeEventListener('pointerup', stopDragSelect);
      window.removeEventListener('pointercancel', stopDragSelect);
    };
  }, []);

  useEffect(() => {
    if (!roomId) return;
    setSaved(loadSaved(roomId));
    let cancelled = false;

    async function loadPhotos() {
      const pageSize = 100;
      const allPosts: Post[] = [];
      for (let offset = 0; ; offset += pageSize) {
        const res = await api.getPosts(roomId!, undefined, 'album', undefined, pageSize, offset);
        allPosts.push(...res.posts);
        if (res.posts.length < pageSize) break;
      }

      const imagePosts = allPosts.filter(p => p.file_type === 'image');
      if (cancelled) return;
      setPosts(imagePosts);
      if (imagePosts.length === 0) return;

      const urls: Record<string, string> = {};
      for (const ids of chunk(imagePosts.map(p => p.id), 50)) {
        const res = await api.getViewUrls(roomId!, ids, undefined, 'display');
        Object.assign(urls, res.viewUrls);
      }
      if (!cancelled) setViewUrls(urls);
    }

    setLoading(true);
    setError('');
    setPosts([]);
    setViewUrls({});
    loadPhotos()
      .catch(() => {
        if (!cancelled) setError('データの取得に失敗しました。');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
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
      for (const ids of chunk(targets.map(p => p.id), 50)) {
        const res = await api.getViewUrls(roomId, ids);
        Object.assign(urls, res.viewUrls);
      }
    } catch {
      setProgress(null);
      return;
    }
    const newSaved = new Set(saved);
    let done = 0;
    for (const [index, post] of targets.entries()) {
      const url = urls[post.id];
      if (!url) { done++; setProgress({ current: done, total: targets.length }); continue; }
      try {
        const resp = await fetch(resolvePublicMediaUrl(url));
        if (!resp.ok) throw new Error('fetch failed');
        const blob = await resp.blob();
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = buildDownloadFilename(post, index + 1);
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(a.href);
        newSaved.add(post.id);
      } catch { /* skip */ }
      done++;
      setProgress({ current: done, total: targets.length });
    }
    setSaved(newSaved);
    saveSaved(roomId, newSaved);
    setProgress(null);
  }, [roomId, saved]);

  async function handleDownload(post: Post) {
    await downloadPosts([post]);
  }

  function toggleSelectionMode() {
    setSelectionMode(m => {
      if (m) {
        setSelected(new Set());
        setSelectionMessage('');
      }
      isDragSelectingRef.current = false;
      dragStartIndexRef.current = null;
      lastDragIndexRef.current = null;
      setPreviewPostId(null);
      return !m;
    });
  }

  function addSelectRange(fromIndex: number, toIndex: number) {
    const start = Math.min(fromIndex, toIndex);
    const end = Math.max(fromIndex, toIndex);
    const ids = posts.slice(start, end + 1).map((p) => p.id);

    setSelected(prev => {
      const next = new Set(prev);
      for (const id of ids) {
        if (next.has(id)) continue;
        if (next.size >= MAX_SELECTION) {
          setSelectionMessage(`一度に選択できる写真は${MAX_SELECTION}枚までです。`);
          return next;
        }
        next.add(id);
      }
      setSelectionMessage('');
      return next;
    });
  }

  function toggleSelect(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        setSelectionMessage('');
      } else if (next.size >= MAX_SELECTION) {
        setSelectionMessage(`一度に選択できる写真は${MAX_SELECTION}枚までです。`);
      } else {
        next.add(id);
        setSelectionMessage('');
      }
      return next;
    });
  }

  function handleTileClick(post: Post) {
    if (selectionMode) return;
    if (viewUrls[post.id]) {
      setPreviewPostId(post.id);
    }
  }

  function handleTilePointerDown(e: React.PointerEvent<HTMLDivElement>, id: string, index: number) {
    if (!selectionMode) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    isDragSelectingRef.current = true;
    dragStartIndexRef.current = index;
    lastDragIndexRef.current = index;
    toggleSelect(id);
  }

  function handleGridPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!selectionMode || !isDragSelectingRef.current) return;
    const target = document.elementFromPoint(e.clientX, e.clientY);
    const tile = target?.closest('[data-photo-index]') as HTMLElement | null | undefined;
    const rawIndex = tile?.dataset.photoIndex;
    const index = rawIndex == null ? NaN : Number(rawIndex);
    const startIndex = dragStartIndexRef.current;
    if (!Number.isInteger(index) || startIndex == null || index === lastDragIndexRef.current) return;
    lastDragIndexRef.current = index;
    addSelectRange(startIndex, index);
    e.preventDefault();
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

      <div style={stickyBarStyle}>
        <div style={{ padding: '12px 16px 8px', maxWidth: 800, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 10 }}>
          <Link to={`/room/${roomId}`} style={{ fontSize: 14, color: accentColor, textDecoration: 'none', minHeight: 44, display: 'flex', alignItems: 'center' }}>← 戻る</Link>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 'normal', color: accentColor, flex: 1 }}>写真一覧</h1>
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
        {selectionMode && posts.length > 0 && (
          <div style={{ maxWidth: 800, margin: '0 auto', padding: '0 16px 12px' }}>
            <div style={{ fontSize: 13, color: '#666', marginBottom: 8 }}>
              選択中: {selected.size} / {MAX_SELECTION}
              {selectionMessage && <span style={{ marginLeft: 8, color: '#b85c00' }}>{selectionMessage}</span>}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <button type="button" style={secondaryBtn} onClick={() => { setSelected(new Set()); setSelectionMessage(''); }}>全解除</button>
              <button
                type="button"
                style={selected.size > 0 && !isDownloading ? primaryBtn : disabledBtn}
                disabled={selected.size === 0 || isDownloading}
                onClick={() => downloadPosts(posts.filter(p => selected.has(p.id)))}
              >
                選択した写真を保存 ({selected.size})
              </button>
            </div>
          </div>
        )}
      </div>

      <div style={{ maxWidth: 800, margin: '0 auto', padding: '16px 16px 40px' }}>
        {progress && (
          <p style={{ marginBottom: 12, fontSize: 13, color: '#666' }}>
            保存中... {progress.current} / {progress.total}
          </p>
        )}
        {posts.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: '#888', fontSize: 14 }}>
            <p style={{ margin: 0 }}>まだ共有された写真はありません</p>
          </div>
        ) : (
          <div
            onPointerMove={handleGridPointerMove}
            style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: 6 }}
          >
            {posts.map((post, index) => {
              const url = viewUrls[post.id];
              const isSelected = selected.has(post.id);
              const isMine = !!selfParticipantId && post.participant_id === selfParticipantId;
              const isSaved = saved.has(post.id);
              return (
                <div
                  key={post.id}
                  data-photo-index={index}
                  onPointerDown={(e) => handleTilePointerDown(e, post.id, index)}
                  onClick={() => handleTileClick(post)}
                  style={{
                    position: 'relative', aspectRatio: '1', borderRadius: 8, overflow: 'hidden',
                    cursor: selectionMode || url ? 'pointer' : 'default',
                    border: isSelected ? `3px solid ${accentColor}` : '3px solid transparent',
                    boxSizing: 'border-box',
                    WebkitTapHighlightColor: 'transparent',
                    touchAction: selectionMode ? 'none' : undefined,
                    userSelect: selectionMode ? 'none' : undefined,
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
                      position: 'absolute', right: 5, bottom: 5, width: 22, height: 22, borderRadius: '50%',
                      background: accentColor, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 13, color: '#fff', fontWeight: 'bold', pointerEvents: 'none',
                    }}>✓</div>
                  )}
                  {isMine && (
                    <div style={{
                      position: 'absolute', top: 5, left: 5,
                      background: 'rgba(184, 134, 11, 0.92)',
                      color: '#fff',
                      borderRadius: 999,
                      padding: '3px 6px',
                      fontSize: 10,
                      fontWeight: 'bold',
                      lineHeight: 1,
                      pointerEvents: 'none',
                    }}>自分</div>
                  )}
                  {isSaved && (
                    <div style={{
                      position: 'absolute', top: 5, right: 5,
                      background: 'rgba(34, 34, 34, 0.72)',
                      color: '#fff',
                      borderRadius: 999,
                      padding: '3px 6px',
                      fontSize: 10,
                      fontWeight: 'bold',
                      lineHeight: 1,
                      pointerEvents: 'none',
                    }}>保存済み</div>
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

import { useEffect, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api, type Post } from '../api/client';

const SAVED_KEY = (roomId: string) => `room:${roomId}:savedPostIds`;

function loadSaved(roomId: string): Set<string> {
  try {
    const raw = localStorage.getItem(SAVED_KEY(roomId));
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

function persistSaved(roomId: string, ids: Set<string>) {
  try {
    localStorage.setItem(SAVED_KEY(roomId), JSON.stringify([...ids]));
  } catch {
    // storage full or private mode — ignore
  }
}

function isImagePost(p: Post) {
  return p.mime_type.startsWith('image/');
}

interface DlResult {
  succeeded: number;
  failed: number;
}

export default function GalleryPage() {
  const { roomId } = useParams<{ roomId: string }>();

  const [posts, setPosts] = useState<Post[]>([]);
  const [viewUrls, setViewUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saved, setSaved] = useState<Set<string>>(() => loadSaved(roomId ?? ''));

  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [dlResult, setDlResult] = useState<DlResult | null>(null);

  const savedRef = useRef(saved);
  savedRef.current = saved;

  useEffect(() => {
    if (!roomId) return;
    setLoading(true);
    api.getPosts(roomId)
      .then(r => {
        const imgs = r.posts.filter(isImagePost);
        setPosts(imgs);
        if (imgs.length === 0) { setLoading(false); return; }
        const ids = imgs.map(p => p.id);
        return api.getViewUrls(roomId, ids).then(v => setViewUrls(v.viewUrls));
      })
      .catch(() => setError('データの取得に失敗しました。ページを再読み込みしてください。'))
      .finally(() => setLoading(false));
  }, [roomId]);

  function toggleSelect(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function selectAll() { setSelected(new Set(posts.map(p => p.id))); }
  function deselectAll() { setSelected(new Set()); }
  function selectUnsaved() {
    setSelected(new Set(posts.filter(p => !savedRef.current.has(p.id)).map(p => p.id)));
  }

  async function downloadPosts(targets: Post[]) {
    if (targets.length === 0) return;
    setDlResult(null);
    setProgress({ current: 0, total: targets.length });
    const newSaved = new Set(savedRef.current);
    let done = 0;
    let failCount = 0;

    for (const post of targets) {
      const url = viewUrls[post.id];
      if (!url) {
        failCount++;
        done++;
        setProgress({ current: done, total: targets.length });
        continue;
      }
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        const ext = post.mime_type.split('/')[1]?.replace('jpeg', 'jpg') ?? 'jpg';
        const filename = `photo_${post.id.slice(0, 8)}.${ext}`;
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(a.href);
        newSaved.add(post.id);
      } catch {
        failCount++;
      }
      done++;
      setProgress({ current: done, total: targets.length });
    }

    setSaved(newSaved);
    if (roomId) persistSaved(roomId, newSaved);
    setProgress(null);
    setDlResult({ succeeded: targets.length - failCount, failed: failCount });

    // auto-dismiss result after 5s
    setTimeout(() => setDlResult(null), 5000);
  }

  function handleDownloadSelected() {
    downloadPosts(posts.filter(p => selected.has(p.id)));
  }
  function handleDownloadAll() {
    downloadPosts(posts);
  }
  function handleDownloadUnsaved() {
    downloadPosts(posts.filter(p => !saved.has(p.id)));
  }

  const accentColor = '#b8860b';

  const outerStyle: React.CSSProperties = {
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #f9f5ef 0%, #f0e8d5 100%)',
    fontFamily: 'Georgia, "Noto Serif JP", serif',
    color: '#333',
    overflowX: 'hidden',
  };

  const headerStyle: React.CSSProperties = {
    padding: '20px 16px 12px',
    maxWidth: 800,
    margin: '0 auto',
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  };

  const bodyStyle: React.CSSProperties = {
    maxWidth: 800,
    margin: '0 auto',
    padding: '0 16px 40px',
  };

  const btnBase: React.CSSProperties = {
    padding: '10px 14px',
    borderRadius: 6,
    border: 'none',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 'bold',
    minHeight: 44,
    boxSizing: 'border-box',
    WebkitTapHighlightColor: 'transparent',
  };

  const primaryBtn: React.CSSProperties = {
    ...btnBase,
    background: accentColor,
    color: '#fff',
  };

  const secondaryBtn: React.CSSProperties = {
    ...btnBase,
    background: '#e8e0d0',
    color: '#555',
  };

  const disabledBtn: React.CSSProperties = {
    ...btnBase,
    background: '#ccc',
    color: '#999',
    cursor: 'not-allowed',
  };

  if (loading) {
    return (
      <div style={{ ...outerStyle, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: '#888' }}>アルバムを読み込み中...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ ...outerStyle, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
        <p style={{ color: '#c00', padding: '0 24px', textAlign: 'center' }}>{error}</p>
        <Link to={`/room/${roomId}`} style={{ color: accentColor, fontSize: 14 }}>← ルームに戻る</Link>
      </div>
    );
  }

  const unsavedCount = posts.filter(p => !saved.has(p.id)).length;
  const isDownloading = progress !== null;

  return (
    <div style={outerStyle}>
      <div style={headerStyle}>
        <Link to={`/room/${roomId}`} style={{ fontSize: 14, color: accentColor, textDecoration: 'none', minHeight: 44, display: 'flex', alignItems: 'center' }}>
          ← 戻る
        </Link>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 'normal', color: accentColor, flex: 1 }}>
          アルバム
        </h1>
        <span style={{ fontSize: 12, color: '#888', flexShrink: 0 }}>{posts.length}枚</span>
      </div>

      <div style={bodyStyle}>
        {/* Action toolbar */}
        {posts.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
            <button style={secondaryBtn} onClick={selectAll}>全選択</button>
            <button style={secondaryBtn} onClick={deselectAll}>全解除</button>
            <button style={unsavedCount > 0 ? secondaryBtn : disabledBtn} onClick={selectUnsaved} disabled={unsavedCount === 0}>
              未保存を選択 ({unsavedCount})
            </button>
            <div style={{ width: '100%', display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
              <button
                style={selected.size > 0 && !isDownloading ? primaryBtn : disabledBtn}
                onClick={handleDownloadSelected}
                disabled={selected.size === 0 || isDownloading}
              >
                選択した写真を保存 ({selected.size})
              </button>
              <button
                style={posts.length > 0 && !isDownloading ? primaryBtn : disabledBtn}
                onClick={handleDownloadAll}
                disabled={isDownloading}
              >
                すべて保存
              </button>
              <button
                style={unsavedCount > 0 && !isDownloading ? primaryBtn : disabledBtn}
                onClick={handleDownloadUnsaved}
                disabled={unsavedCount === 0 || isDownloading}
              >
                未保存のみ保存
              </button>
            </div>
          </div>
        )}

        {/* Progress */}
        {progress && (
          <div style={{ marginBottom: 12, padding: '10px 14px', background: '#fff3cd', borderRadius: 6, fontSize: 13 }}>
            保存中... {progress.current} / {progress.total}
          </div>
        )}

        {/* Download result */}
        {dlResult && (
          <div style={{
            marginBottom: 12, padding: '10px 14px', borderRadius: 6, fontSize: 13,
            background: dlResult.failed === 0 ? '#d4edda' : '#fff3cd',
            color: dlResult.failed === 0 ? '#155724' : '#856404',
          }}>
            {dlResult.succeeded}枚を保存しました
            {dlResult.failed > 0 && `（${dlResult.failed}枚は失敗しました）`}
          </div>
        )}

        {/* Empty state */}
        {posts.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: '#888', fontSize: 14, lineHeight: 1.8 }}>
            <p style={{ margin: 0 }}>まだ写真がありません</p>
            <p style={{ margin: '8px 0 0', fontSize: 12 }}>写真が投稿されるとここに表示されます</p>
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))',
            gap: 6,
          }}>
            {posts.map(post => {
              const url = viewUrls[post.id];
              const isSelected = selected.has(post.id);
              const isSaved = saved.has(post.id);
              return (
                <div
                  key={post.id}
                  onClick={() => toggleSelect(post.id)}
                  style={{
                    position: 'relative',
                    aspectRatio: '1',
                    borderRadius: 8,
                    overflow: 'hidden',
                    cursor: 'pointer',
                    border: isSelected ? `3px solid ${accentColor}` : '3px solid transparent',
                    boxSizing: 'border-box',
                    WebkitTapHighlightColor: 'transparent',
                  }}
                >
                  {url ? (
                    <img
                      src={url}
                      alt=""
                      loading="lazy"
                      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                    />
                  ) : (
                    <div style={{ width: '100%', height: '100%', background: '#e0d8c8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ fontSize: 11, color: '#999' }}>読込中</span>
                    </div>
                  )}
                  {isSelected && (
                    <div style={{
                      position: 'absolute', top: 5, right: 5,
                      width: 22, height: 22, borderRadius: '50%',
                      background: accentColor,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 13, color: '#fff', fontWeight: 'bold',
                      pointerEvents: 'none',
                    }}>✓</div>
                  )}
                  {isSaved && !isSelected && (
                    <div style={{
                      position: 'absolute', bottom: 4, right: 4,
                      fontSize: 10, background: 'rgba(0,0,0,0.5)', color: '#fff',
                      borderRadius: 4, padding: '2px 5px',
                      pointerEvents: 'none',
                    }}>保存済</div>
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

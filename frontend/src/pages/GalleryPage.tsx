import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api, type Post } from '../api/client';
import { getParticipantId } from '../utils/participantId';

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

/** SlideshowPage と同じ基準（file_type 優先）。MIME の大小・欠損でも一覧から落ちないようにする */
function isImagePost(p: Post) {
  if (p.file_type === 'image') return true;
  const m = p.mime_type?.toLowerCase() ?? '';
  return m.startsWith('image/');
}

// ---- Download filename helpers ----

function mimeToExt(mime: string): string {
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/heic': 'heic',
    'image/heif': 'heif',
    'image/gif': 'gif',
    'image/bmp': 'bmp',
  };
  return map[mime.toLowerCase()] ?? 'bin';
}

function sanitizeNickname(name: string): string {
  const s = (name ?? '')
    .replace(/[^\w]/g, '_')   // non-word chars → underscore
    .replace(/_+/g, '_')      // collapse consecutive underscores
    .replace(/^_+|_+$/g, '')  // trim leading/trailing underscores
    .slice(0, 20)
    .replace(/_+$/g, '')      // trim trailing underscore left after slice
    .toLowerCase();
  return s || 'guest';
}

function formatDateForFilename(unixSec: number): string {
  const d = new Date((unixSec || Math.floor(Date.now() / 1000)) * 1000);
  const yyyy = d.getFullYear();
  const MM = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const HH = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${yyyy}${MM}${dd}_${HH}${mm}${ss}`;
}

function buildDownloadFilename(post: Post): string {
  const nick = sanitizeNickname(post.nickname);
  const ts = formatDateForFilename(post.created_at);
  const short = post.id.slice(0, 8);
  const ext = mimeToExt(post.mime_type);
  return `wedding_${nick}_${ts}_${short}.${ext}`;
}

type FilterType = 'all' | 'others' | 'unsaved' | 'others_unsaved';

interface ViewUrlCache {
  urls: Record<string, string>;
  expiresAt: number; // unix seconds
}

interface DlResult {
  succeeded: number;
  failed: number;
}

export default function GalleryPage() {
  const { roomId } = useParams<{ roomId: string }>();

  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [viewUrlCache, setViewUrlCache] = useState<ViewUrlCache>({ urls: {}, expiresAt: 0 });

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saved, setSaved] = useState<Set<string>>(() => loadSaved(roomId ?? ''));
  const [filter, setFilter] = useState<FilterType>('all');

  const selfParticipantId = roomId ? getParticipantId(roomId) : null;

  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [dlResult, setDlResult] = useState<DlResult | null>(null);

  const savedRef = useRef(saved);
  savedRef.current = saved;

  const filteredPosts = useMemo(() => {
    switch (filter) {
      case 'others':
        return posts.filter(p => !selfParticipantId || p.participant_id !== selfParticipantId);
      case 'unsaved':
        return posts.filter(p => !saved.has(p.id));
      case 'others_unsaved':
        return posts.filter(p =>
          (!selfParticipantId || p.participant_id !== selfParticipantId) && !saved.has(p.id)
        );
      default:
        return posts;
    }
  }, [posts, filter, selfParticipantId, saved]);

  useEffect(() => {
    setSelected(new Set());
  }, [filter]);

  useEffect(() => {
    if (!roomId) return;
    setError('');
    setLoading(true);
    api.getPosts(roomId)
      .then(r => {
        const imgs = r.posts.filter(isImagePost);
        setPosts(imgs);
        if (imgs.length === 0) { setLoading(false); return; }
        const ids = imgs.map(p => p.id);
        return api.getViewUrls(roomId, ids, true).then(v =>
          setViewUrlCache({ urls: v.viewUrls, expiresAt: v.expiresAt })
        );
      })
      .catch(() => setError('データの取得に失敗しました。ページを再読み込みしてください。'))
      .finally(() => setLoading(false));
  }, [roomId]);

  // Fetches original (non-display) URLs for downloading
  async function fetchDownloadUrls(targets: Post[]): Promise<Record<string, string>> {
    if (!roomId || targets.length === 0) return {};
    try {
      const ids = targets.map(p => p.id);
      const res = await api.getViewUrls(roomId, ids, false);
      return res.viewUrls;
    } catch {
      return {};
    }
  }

  function toggleSelect(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function selectAll() { setSelected(new Set(filteredPosts.map(p => p.id))); }
  function deselectAll() { setSelected(new Set()); }
  function selectUnsaved() {
    setSelected(new Set(filteredPosts.filter(p => !saved.has(p.id)).map(p => p.id)));
  }

  async function downloadPosts(targets: Post[]) {
    if (targets.length === 0) return;
    setDlResult(null);
    setProgress({ current: 0, total: targets.length });

    const urls = await fetchDownloadUrls(targets);

    const newSaved = new Set(savedRef.current);
    let done = 0;
    let failCount = 0;

    for (const post of targets) {
      const url = urls[post.id];
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
        const filename = buildDownloadFilename(post);
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
    setTimeout(() => setDlResult(null), 5000);
  }

  function handleDownloadSelected() {
    downloadPosts(filteredPosts.filter(p => selected.has(p.id)));
  }
  function handleDownloadAll() {
    downloadPosts(filteredPosts);
  }
  function handleDownloadUnsaved() {
    downloadPosts(filteredPosts.filter(p => !saved.has(p.id)));
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

  const primaryBtn: React.CSSProperties = { ...btnBase, background: accentColor, color: '#fff' };
  const secondaryBtn: React.CSSProperties = { ...btnBase, background: '#e8e0d0', color: '#555' };
  const disabledBtn: React.CSSProperties = { ...btnBase, background: '#ccc', color: '#999', cursor: 'not-allowed' };

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

  const unsavedCount = filteredPosts.filter(p => !saved.has(p.id)).length;
  const isDownloading = progress !== null;
  const viewUrls = viewUrlCache.urls;

  // Filter button counts
  const othersCount = posts.filter(p => !selfParticipantId || p.participant_id !== selfParticipantId).length;
  const allUnsavedCount = posts.filter(p => !saved.has(p.id)).length;
  const othersUnsavedCount = posts.filter(p =>
    (!selfParticipantId || p.participant_id !== selfParticipantId) && !saved.has(p.id)
  ).length;

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
        {/* Filter bar */}
        {posts.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
            {([
              ['all', 'すべて', posts.length],
              ['others', '自分以外', othersCount],
              ['unsaved', '未保存', allUnsavedCount],
              ['others_unsaved', '自分以外+未保存', othersUnsavedCount],
            ] as [FilterType, string, number][]).map(([key, label, count]) => (
              <button
                key={key}
                style={{
                  ...btnBase,
                  background: filter === key ? accentColor : '#e8e0d0',
                  color: filter === key ? '#fff' : '#555',
                  fontSize: 12,
                  padding: '8px 12px',
                  minHeight: 36,
                }}
                onClick={() => setFilter(key)}
              >
                {label} ({count})
              </button>
            ))}
          </div>
        )}

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
                style={filteredPosts.length > 0 && !isDownloading ? primaryBtn : disabledBtn}
                onClick={handleDownloadAll}
                disabled={filteredPosts.length === 0 || isDownloading}
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
        ) : filteredPosts.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: '#888', fontSize: 14 }}>
            <p style={{ margin: 0 }}>このフィルターに該当する写真はありません</p>
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))',
            gap: 6,
          }}>
            {filteredPosts.map(post => {
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

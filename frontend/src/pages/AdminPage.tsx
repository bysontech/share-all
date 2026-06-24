import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api, ApiError, type RoomInfo, type AdminPost, type SlideshowSettings, type ThemeSettings, type EventMode, type EventModeSettings, type RoomFeedbackSummary } from '../api/client';
import { putToR2 } from '../api/client';

// ---- Sub-components ----

function PostRow({
  post,
  onToggle,
  onDelete,
}: {
  post: AdminPost;
  onToggle: (id: string, next: 'visible' | 'hidden') => void;
  onDelete: (id: string) => void;
}) {
  const date = new Date(post.created_at * 1000).toLocaleString('ja-JP');
  const isHidden = post.status === 'hidden';

  return (
    <tr style={{ background: isHidden ? '#fafafa' : '#fff', opacity: isHidden ? 0.6 : 1 }}>
      <td style={{ padding: '8px', borderBottom: '1px solid #eee', fontSize: 13 }}>{post.nickname}</td>
      <td style={{ padding: '8px', borderBottom: '1px solid #eee', fontSize: 12, color: '#888' }}>{date}</td>
      <td style={{ padding: '8px', borderBottom: '1px solid #eee', fontSize: 12 }}>
        {(post.file_size / 1024 / 1024).toFixed(1)} MB
      </td>
      <td style={{ padding: '8px', borderBottom: '1px solid #eee' }}>
        <span
          style={{
            fontSize: 11,
            padding: '2px 6px',
            borderRadius: 3,
            background: isHidden ? '#e2e3e5' : '#d4edda',
            color: isHidden ? '#555' : '#155724',
          }}
        >
          {isHidden ? '非表示' : '表示中'}
        </span>
      </td>
      <td style={{ padding: '8px', borderBottom: '1px solid #eee', whiteSpace: 'nowrap' }}>
        <button
          onClick={() => onToggle(post.id, isHidden ? 'visible' : 'hidden')}
          style={{ fontSize: 12, padding: '3px 10px', cursor: 'pointer', marginRight: 6 }}
        >
          {isHidden ? '表示する' : '非表示'}
        </button>
        <button
          onClick={() => onDelete(post.id)}
          style={{
            fontSize: 12,
            padding: '3px 10px',
            cursor: 'pointer',
            background: '#dc3545',
            color: '#fff',
            border: 'none',
            borderRadius: 3,
          }}
        >
          削除
        </button>
      </td>
    </tr>
  );
}

function SlideshowSettingsForm({
  initial,
  onSave,
  saving,
}: {
  initial: SlideshowSettings;
  onSave: (s: SlideshowSettings) => void;
  saving: boolean;
}) {
  const [intervalSeconds, setIntervalSeconds] = useState(initial.intervalSeconds);
  const [showNickname, setShowNickname] = useState(initial.showNickname);
  const [orderMode, setOrderMode] = useState(initial.orderMode);

  useEffect(() => {
    setIntervalSeconds(initial.intervalSeconds);
    setShowNickname(initial.showNickname);
    setOrderMode(initial.orderMode);
  }, [initial.intervalSeconds, initial.showNickname, initial.orderMode]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ width: 120, flexShrink: 0, fontSize: 14 }}>切替間隔（秒）</span>
        <input
          type="number"
          min={1}
          max={60}
          value={intervalSeconds}
          onChange={(e) => setIntervalSeconds(Number(e.target.value))}
          style={{ width: 80, padding: '5px 8px' }}
        />
      </label>
      <label style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ width: 120, flexShrink: 0, fontSize: 14 }}>ニックネーム表示</span>
        <input
          type="checkbox"
          checked={showNickname}
          onChange={(e) => setShowNickname(e.target.checked)}
          style={{ width: 18, height: 18 }}
        />
      </label>
      <label style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ width: 120, flexShrink: 0, fontSize: 14 }}>並び順</span>
        <select
          value={orderMode}
          onChange={(e) => setOrderMode(e.target.value)}
          style={{ padding: '5px 8px' }}
        >
          <option value="asc">古い順（asc）</option>
          <option value="desc">新しい順（desc）</option>
        </select>
      </label>
      <div>
        <button
          onClick={() => onSave({ intervalSeconds, showNickname, orderMode })}
          disabled={saving}
          style={{ padding: '8px 20px', cursor: 'pointer', fontWeight: 'bold' }}
        >
          {saving ? '保存中...' : '設定を保存'}
        </button>
      </div>
    </div>
  );
}

// ---- Event mode section ----

const MODE_META: Record<EventMode, { label: string; bg: string; color: string }> = {
  draft:      { label: '準備中',    bg: '#e2e3e5', color: '#555' },
  event_live: { label: '披露宴中',  bg: '#d4edda', color: '#155724' },
  archive:    { label: '終了後',    bg: '#cce5ff', color: '#004085' },
};

function toDatetimeLocal(ts: number | null): string {
  if (ts == null) return '';
  const d = new Date(ts * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromDatetimeLocal(s: string): number | null {
  if (!s) return null;
  const ms = new Date(s).getTime();
  return isNaN(ms) ? null : Math.floor(ms / 1000);
}

function EventModeSection({ roomId }: { roomId: string }) {
  const [settings, setSettings] = useState<EventModeSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [manualMode, setManualMode] = useState<string>('auto');
  const [openAt, setOpenAt] = useState('');
  const [closeAt, setCloseAt] = useState('');
  const [galleryAt, setGalleryAt] = useState('');
  const [videoAt, setVideoAt] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    api.getEventMode(roomId)
      .then(s => {
        setSettings(s);
        setManualMode(s.manualMode ?? 'auto');
        setOpenAt(toDatetimeLocal(s.slideshowOpenAt));
        setCloseAt(toDatetimeLocal(s.slideshowCloseAt));
        setGalleryAt(toDatetimeLocal(s.galleryOpenAt));
        setVideoAt(toDatetimeLocal(s.videoOpenAt));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [roomId]);

  async function handleSave() {
    setSaving(true);
    setMsg('');
    try {
      const updated = await api.updateEventMode(roomId, {
        manualMode: manualMode === 'auto' ? null : manualMode,
        slideshowOpenAt: fromDatetimeLocal(openAt),
        slideshowCloseAt: fromDatetimeLocal(closeAt),
        galleryOpenAt: fromDatetimeLocal(galleryAt),
        videoOpenAt: fromDatetimeLocal(videoAt),
      });
      setSettings(updated);
      setMsg('保存しました');
    } catch (e) {
      setMsg(e instanceof ApiError ? `エラー: ${e.message}` : '保存に失敗しました');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div style={{ fontSize: 13, color: '#888' }}>読み込み中...</div>;
  if (!settings) return null;

  const current = settings.eventMode;
  const meta = MODE_META[current] ?? MODE_META.event_live;
  const labelStyle: React.CSSProperties = { display: 'block', fontSize: 14, marginBottom: 10 };
  const dtInputStyle: React.CSSProperties = { padding: '5px 8px', fontSize: 14, borderRadius: 4, border: '1px solid #ccc' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Current resolved mode */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, color: '#555' }}>現在の状態：</span>
        <span style={{ padding: '3px 12px', borderRadius: 12, background: meta.bg, color: meta.color, fontSize: 13, fontWeight: 'bold' }}>
          {meta.label}
        </span>
        {settings.nextTransitionAt && (
          <span style={{ fontSize: 12, color: '#888' }}>
            次の切替予定: {new Date(settings.nextTransitionAt * 1000).toLocaleString('ja-JP')}
          </span>
        )}
      </div>

      {/* Manual override */}
      <div>
        <p style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 'bold' }}>手動切替</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {(['auto', 'draft', 'event_live', 'archive'] as const).map(m => {
            const active = manualMode === m;
            const label = m === 'auto' ? '自動（スケジュール）' : MODE_META[m].label;
            return (
              <button
                key={m}
                onClick={() => setManualMode(m)}
                style={{
                  padding: '8px 16px', cursor: 'pointer', borderRadius: 4, fontSize: 13,
                  border: active ? '2px solid #0d6efd' : '1px solid #ccc',
                  background: active ? '#e7f0ff' : '#fff',
                  fontWeight: active ? 'bold' : 'normal',
                  minHeight: 38,
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
        {manualMode !== 'auto' && (
          <p style={{ margin: '6px 0 0', fontSize: 12, color: '#e65100' }}>
            手動切替中：スケジュールより優先されます
          </p>
        )}
      </div>

      {/* Schedule settings */}
      <div>
        <p style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 'bold' }}>スケジュール設定</p>
        <p style={{ margin: '0 0 10px', fontSize: 12, color: '#666' }}>
          手動切替が「自動」のときに有効です。時刻はご利用のブラウザのローカル時刻で入力してください。
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[
            { label: '披露宴開始（スライドショー開放）', val: openAt, set: setOpenAt },
            { label: 'スライドショー終了（アーカイブ開始）', val: closeAt, set: setCloseAt },
            { label: '写真ギャラリー開放（任意）', val: galleryAt, set: setGalleryAt },
            { label: '動画開放（任意）', val: videoAt, set: setVideoAt },
          ].map(({ label, val, set }) => (
            <label key={label} style={labelStyle}>
              <span style={{ display: 'block', marginBottom: 4 }}>{label}</span>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  type="datetime-local"
                  value={val}
                  onChange={e => set(e.target.value)}
                  style={dtInputStyle}
                />
                {val && (
                  <button onClick={() => set('')} style={{ fontSize: 11, padding: '4px 8px', cursor: 'pointer', borderRadius: 3 }}>
                    クリア
                  </button>
                )}
              </div>
            </label>
          ))}
        </div>
      </div>

      <div>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{ padding: '8px 24px', cursor: 'pointer', fontWeight: 'bold', marginRight: 12 }}
        >
          {saving ? '保存中...' : '保存'}
        </button>
        {msg && (
          <span style={{ fontSize: 13, color: msg.startsWith('エラー') ? 'red' : 'green' }}>{msg}</span>
        )}
      </div>
    </div>
  );
}

// ---- Theme settings form ----

const EMPTY_THEME: ThemeSettings = {
  title: null,
  message: null,
  mainVisualKey: null,
  mainVisualDisplayKey: null,
  mainVisualDisplayMimeType: null,
  backgroundImageKey: null,
  backgroundDisplayImageKey: null,
  backgroundDisplayMimeType: null,
  themeColor: null,
  animationMode: 'none',
};

async function generateDisplayWebP(
  file: File,
  maxDim: number,
  quality: number
): Promise<{ blob: Blob; mimeType: string } | null> {
  try {
    let bitmap: ImageBitmap;
    try { bitmap = await createImageBitmap(file); } catch { return null; }
    let { width, height } = bitmap;
    if (width > maxDim || height > maxDim) {
      const scale = maxDim / Math.max(width, height);
      width = Math.round(width * scale);
      height = Math.round(height * scale);
    }
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) { bitmap.close(); return null; }
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    return new Promise((resolve) => {
      canvas.toBlob((blob) => resolve(blob ? { blob, mimeType: 'image/webp' } : null), 'image/webp', quality);
    });
  } catch { return null; }
}

function ThemeSettingsForm({
  initial,
  roomId,
  onSaved,
}: {
  initial: ThemeSettings;
  roomId: string;
  onSaved: (t: ThemeSettings) => void;
}) {
  const [title, setTitle] = useState(initial.title ?? '');
  const [message, setMessage] = useState(initial.message ?? '');
  const [themeColor, setThemeColor] = useState(initial.themeColor ?? '#b8860b');
  const [animationMode, setAnimationMode] = useState(initial.animationMode);
  const [mainVisualKey, setMainVisualKey] = useState<string | null>(initial.mainVisualKey);
  const [mainVisualDisplayKey, setMainVisualDisplayKey] = useState<string | null>(initial.mainVisualDisplayKey);
  const [mainVisualDisplayMimeType, setMainVisualDisplayMimeType] = useState<string | null>(initial.mainVisualDisplayMimeType);
  const [bgKey, setBgKey] = useState<string | null>(initial.backgroundImageKey);
  const [bgDisplayKey, setBgDisplayKey] = useState<string | null>(initial.backgroundDisplayImageKey);
  const [bgDisplayMimeType, setBgDisplayMimeType] = useState<string | null>(initial.backgroundDisplayMimeType);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [uploadingMain, setUploadingMain] = useState(false);
  const [uploadingBg, setUploadingBg] = useState(false);

  useEffect(() => {
    setTitle(initial.title ?? '');
    setMessage(initial.message ?? '');
    setThemeColor(initial.themeColor ?? '#b8860b');
    setAnimationMode(initial.animationMode);
    setMainVisualKey(initial.mainVisualKey);
    setMainVisualDisplayKey(initial.mainVisualDisplayKey);
    setMainVisualDisplayMimeType(initial.mainVisualDisplayMimeType);
    setBgKey(initial.backgroundImageKey);
    setBgDisplayKey(initial.backgroundDisplayImageKey);
    setBgDisplayMimeType(initial.backgroundDisplayMimeType);
  }, [initial.title, initial.message, initial.themeColor, initial.animationMode, initial.mainVisualKey, initial.mainVisualDisplayKey, initial.mainVisualDisplayMimeType, initial.backgroundImageKey, initial.backgroundDisplayImageKey, initial.backgroundDisplayMimeType]);

  async function uploadMainVisualImage(file: File) {
    setUploadingMain(true);
    try {
      const res = await api.getThemeUploadUrl(roomId, 'main_visual', file.type, file.size);
      await putToR2(res.uploadUrl, file);
      setMainVisualKey(res.fileKey);

      try {
        const display = await generateDisplayWebP(file, 1920, 0.80);
        if (display) {
          const displayRes = await api.getThemeUploadUrl(roomId, 'main_visual_display', display.mimeType, display.blob.size);
          await putToR2(displayRes.uploadUrl, display.blob);
          setMainVisualDisplayKey(displayRes.fileKey);
          setMainVisualDisplayMimeType(display.mimeType);
        } else {
          setMainVisualDisplayKey(null);
          setMainVisualDisplayMimeType(null);
        }
      } catch {
        setMainVisualDisplayKey(null);
        setMainVisualDisplayMimeType(null);
      }
    } catch (e) {
      alert(e instanceof ApiError ? e.message : '画像のアップロードに失敗しました');
    } finally {
      setUploadingMain(false);
    }
  }

  async function uploadBgImage(file: File) {
    setUploadingBg(true);
    try {
      const res = await api.getThemeUploadUrl(roomId, 'background', file.type, file.size);
      await putToR2(res.uploadUrl, file);
      setBgKey(res.fileKey);

      try {
        const display = await generateDisplayWebP(file, 1920, 0.75);
        if (display) {
          const displayRes = await api.getThemeUploadUrl(roomId, 'background_display', display.mimeType, display.blob.size);
          await putToR2(displayRes.uploadUrl, display.blob);
          setBgDisplayKey(displayRes.fileKey);
          setBgDisplayMimeType(display.mimeType);
        } else {
          setBgDisplayKey(null);
          setBgDisplayMimeType(null);
        }
      } catch {
        setBgDisplayKey(null);
        setBgDisplayMimeType(null);
      }
    } catch (e) {
      alert(e instanceof ApiError ? e.message : '画像のアップロードに失敗しました');
    } finally {
      setUploadingBg(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setMsg('');
    try {
      const updated = await api.updateTheme(roomId, {
        title: title.trim() || null,
        message: message.trim() || null,
        mainVisualKey,
        mainVisualDisplayKey,
        mainVisualDisplayMimeType,
        backgroundImageKey: bgKey,
        backgroundDisplayImageKey: bgDisplayKey,
        backgroundDisplayMimeType: bgDisplayMimeType,
        themeColor: themeColor || null,
        animationMode,
      });
      onSaved(updated);
      setMsg('保存しました');
    } catch (e) {
      setMsg(e instanceof ApiError ? `エラー: ${e.message}` : '保存に失敗しました');
    } finally {
      setSaving(false);
    }
  }

  const inputStyle: React.CSSProperties = { width: '100%', padding: '7px 10px', boxSizing: 'border-box', marginTop: 4 };
  const labelStyle: React.CSSProperties = { display: 'block', fontSize: 14, marginBottom: 10 };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={labelStyle}>
        タイトル
        <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="例: 田中・山田 結婚式" style={inputStyle} />
      </label>
      <label style={labelStyle}>
        メッセージ
        <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={3} placeholder="ご参加ありがとうございます" style={{ ...inputStyle, resize: 'vertical' }} />
      </label>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <label style={{ ...labelStyle, flex: 1, minWidth: 160 }}>
          テーマカラー
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
            <input type="color" value={themeColor} onChange={(e) => setThemeColor(e.target.value)} style={{ width: 48, height: 32, cursor: 'pointer' }} />
            <input type="text" value={themeColor} onChange={(e) => setThemeColor(e.target.value)} style={{ flex: 1, padding: '6px 8px' }} />
          </div>
        </label>
        <label style={{ ...labelStyle, flex: 1, minWidth: 160 }}>
          アニメーション
          <select value={animationMode} onChange={(e) => setAnimationMode(e.target.value)} style={{ ...inputStyle }}>
            <option value="none">なし</option>
            <option value="fade">フェード</option>
            <option value="float">フロート</option>
          </select>
        </label>
      </div>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <label style={{ ...labelStyle, flex: 1, minWidth: 200 }}>
          メインビジュアル
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) uploadMainVisualImage(f);
                e.target.value = '';
              }}
              style={{ display: 'none' }}
              id="main-visual-input"
            />
            <label htmlFor="main-visual-input" style={{ padding: '5px 12px', background: '#555', color: '#fff', borderRadius: 3, cursor: 'pointer', fontSize: 13 }}>
              {uploadingMain ? 'アップロード中...' : '選択'}
            </label>
            {mainVisualKey && (
              <span style={{ fontSize: 11, color: '#888', wordBreak: 'break-all' }}>
                設定済み ✓{mainVisualDisplayKey ? ' (表示用あり)' : ' (表示用なし)'}
              </span>
            )}
          </div>
        </label>
        <label style={{ ...labelStyle, flex: 1, minWidth: 200 }}>
          背景画像
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) uploadBgImage(f);
                e.target.value = '';
              }}
              style={{ display: 'none' }}
              id="bg-image-input"
            />
            <label htmlFor="bg-image-input" style={{ padding: '5px 12px', background: '#555', color: '#fff', borderRadius: 3, cursor: 'pointer', fontSize: 13 }}>
              {uploadingBg ? 'アップロード中...' : '選択'}
            </label>
            {bgKey && (
              <span style={{ fontSize: 11, color: '#888', wordBreak: 'break-all' }}>
                設定済み ✓{bgDisplayKey ? ' (表示用あり)' : ' (表示用なし)'}
              </span>
            )}
          </div>
        </label>
      </div>
      <div>
        <button onClick={handleSave} disabled={saving || uploadingMain || uploadingBg} style={{ padding: '8px 24px', cursor: 'pointer', fontWeight: 'bold', marginTop: 4 }}>
          {saving ? '保存中...' : 'テーマを保存'}
        </button>
        {msg && <span style={{ marginLeft: 12, fontSize: 13, color: msg.startsWith('エラー') ? 'red' : 'green' }}>{msg}</span>}
      </div>
    </div>
  );
}

// ---- Main component ----

export default function AdminPage() {
  const { roomId } = useParams<{ roomId: string }>();

  const [room, setRoom] = useState<RoomInfo | null>(null);
  const [roomError, setRoomError] = useState('');

  const [posts, setPosts] = useState<AdminPost[]>([]);
  const [postsError, setPostsError] = useState('');
  const [postsLoading, setPostsLoading] = useState(false);
  const [actionMsg, setActionMsg] = useState('');
  const [copyMsg, setCopyMsg] = useState('');
  const actionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [settings, setSettings] = useState<SlideshowSettings>({
    intervalSeconds: 5,
    showNickname: true,
    orderMode: 'asc',
  });
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsMsg, setSettingsMsg] = useState('');

  const [theme, setTheme] = useState<ThemeSettings>(EMPTY_THEME);
  const [feedbackSummary, setFeedbackSummary] = useState<RoomFeedbackSummary['counts']>({ ok: 0, line: 0 });
  const [feedbackError, setFeedbackError] = useState('');

  const participantUrl = roomId ? `${window.location.origin}/room/${roomId}` : '';

  // Load room info
  useEffect(() => {
    if (!roomId) return;
    api
      .getRoom(roomId)
      .then(setRoom)
      .catch((e) => setRoomError(e instanceof ApiError ? e.message : 'ルーム情報の取得に失敗しました'));
  }, [roomId]);

  // Load slideshow settings and theme
  useEffect(() => {
    if (!roomId) return;
    api.getSlideshowSettings(roomId).then(setSettings).catch(() => {});
    api.getTheme(roomId).then(setTheme).catch(() => {});
    api.getRoomFeedbackSummary(roomId)
      .then((res) => {
        setFeedbackSummary(res.counts);
        setFeedbackError('');
      })
      .catch((e) => setFeedbackError(e instanceof ApiError ? e.message : 'フィードバック集計の取得に失敗しました'));
  }, [roomId]);

  const loadPosts = useCallback(async () => {
    if (!roomId) return;
    setPostsLoading(true);
    try {
      const res = await api.getAdminPosts(roomId);
      setPosts(res.posts);
      setPostsError('');
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        setPosts([]);
        setPostsError(
          'サイトの管理者でログインしてください。トップ（/）でログイン後、再度このページを開いてください。'
        );
      } else {
        setPostsError(e instanceof ApiError ? e.message : '投稿の取得に失敗しました');
      }
    } finally {
      setPostsLoading(false);
    }
  }, [roomId]);

  useEffect(() => {
    loadPosts();
  }, [loadPosts]);

  function showAction(msg: string) {
    setActionMsg(msg);
    if (actionTimerRef.current) clearTimeout(actionTimerRef.current);
    actionTimerRef.current = setTimeout(() => setActionMsg(''), 4000);
  }

  async function handleToggle(postId: string, next: 'visible' | 'hidden') {
    if (!roomId) return;
    try {
      await api.updatePostStatus(roomId, postId, next);
      setPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, status: next } : p)));
      showAction(next === 'hidden' ? '非表示にしました' : '表示に変更しました');
    } catch (e) {
      showAction(e instanceof ApiError ? `エラー: ${e.message}` : '更新に失敗しました');
    }
  }

  async function handleDelete(postId: string) {
    if (!roomId) return;
    if (!window.confirm('この投稿を削除しますか？\nR2とDBから完全に削除されます。')) return;
    try {
      await api.deletePost(roomId, postId);
      setPosts((prev) => prev.filter((p) => p.id !== postId));
      showAction('削除しました');
    } catch (e) {
      showAction(e instanceof ApiError ? `エラー: ${e.message}` : '削除に失敗しました');
    }
  }

  async function handleSaveSettings(next: SlideshowSettings) {
    if (!roomId) return;
    setSettingsSaving(true);
    setSettingsMsg('');
    try {
      const updated = await api.updateSlideshowSettings(roomId, next);
      setSettings(updated);
      setSettingsMsg('保存しました');
    } catch (e) {
      setSettingsMsg(e instanceof ApiError ? `エラー: ${e.message}` : '保存に失敗しました');
    } finally {
      setSettingsSaving(false);
    }
  }

  // ---- Render ----

  if (roomError) {
    return (
      <div style={{ maxWidth: 600, margin: '40px auto', padding: '0 16px' }}>
        <p style={{ color: 'red' }}>{roomError}</p>
      </div>
    );
  }

  if (!room) return <div style={{ padding: 24 }}>読み込み中...</div>;

  const visibleCount = posts.filter((p) => p.status === 'visible').length;
  const hiddenCount = posts.filter((p) => p.status === 'hidden').length;

  return (
    <div style={{ maxWidth: 800, margin: '24px auto', padding: '0 16px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <h2 style={{ margin: 0 }}>{room.name} — 管理</h2>
        <Link
          to="/"
          style={{
            fontSize: 12,
            padding: '6px 12px',
            border: '1px solid #ccc',
            borderRadius: 4,
            color: '#333',
            textDecoration: 'none',
            flexShrink: 0,
          }}
        >
          サイトの管理へ
        </Link>
      </div>

      {/* Participant URL */}
      <section style={{ background: '#f5f5f5', borderRadius: 4, padding: 14, marginBottom: 24 }}>
        <p style={{ margin: '0 0 6px', fontWeight: 'bold', fontSize: 14 }}>参加者URL</p>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <code style={{ fontSize: 13, wordBreak: 'break-all', flex: 1 }}>{participantUrl}</code>
          <button
            onClick={() => {
              navigator.clipboard.writeText(participantUrl)
                .then(() => { setCopyMsg('コピーしました'); setTimeout(() => setCopyMsg(''), 2500); })
                .catch(() => { setCopyMsg('コピー失敗'); setTimeout(() => setCopyMsg(''), 2500); });
            }}
            style={{ padding: '4px 10px', cursor: 'pointer', whiteSpace: 'nowrap' }}
          >
            {copyMsg || 'コピー'}
          </button>
          <Link
            to={`/room/${roomId}/slideshow`}
            target="_blank"
            style={{ padding: '4px 10px', background: '#1a1a1a', color: '#fff', borderRadius: 4, textDecoration: 'none', fontSize: 13, whiteSpace: 'nowrap' }}
          >
            スライドショー
          </Link>
        </div>
      </section>

      {/* Action feedback */}
      {actionMsg && (
        <div style={{
          marginBottom: 12, padding: '10px 14px', borderRadius: 6, fontSize: 13,
          background: actionMsg.startsWith('エラー') || actionMsg.includes('失敗') ? '#f8d7da' : '#d4edda',
          color: actionMsg.startsWith('エラー') || actionMsg.includes('失敗') ? '#721c24' : '#155724',
        }}>
          {actionMsg}
        </div>
      )}

      {/* Feedback summary */}
      <section style={{ background: '#fff8e1', border: '1px solid #ffe082', borderRadius: 6, padding: 14, marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <h3 style={{ margin: 0, fontSize: 16 }}>ベータ版フィードバック</h3>
          {feedbackError && <span style={{ fontSize: 12, color: '#b85c00' }}>取得エラー: {feedbackError}</span>}
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 12 }}>
          <div style={{ background: '#fff', borderRadius: 6, padding: '10px 14px', minWidth: 150, border: '1px solid #f0e0a0' }}>
            <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>問題なく使えた 👍</div>
            <div style={{ fontSize: 24, fontWeight: 'bold', color: '#5d4037' }}>{feedbackSummary.ok}</div>
          </div>
          <div style={{ background: '#fff', borderRadius: 6, padding: '10px 14px', minWidth: 180, border: '1px solid #f0e0a0' }}>
            <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>LINEグループ共有希望 🙋</div>
            <div style={{ fontSize: 24, fontWeight: 'bold', color: '#5d4037' }}>{feedbackSummary.line}</div>
          </div>
        </div>
      </section>

      {/* Post list */}
      <section style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
          <h3 style={{ margin: 0 }}>投稿一覧</h3>
          <span style={{ fontSize: 13, color: '#555' }}>
            全{posts.length}件 / 表示中: {visibleCount} / 非表示: {hiddenCount}
          </span>
          <button
            onClick={loadPosts}
            disabled={postsLoading}
            style={{ marginLeft: 'auto', fontSize: 12, padding: '4px 10px', cursor: 'pointer' }}
          >
            {postsLoading ? '更新中...' : '更新'}
          </button>
        </div>
        {postsError && <p style={{ color: 'red', fontSize: 13 }}>{postsError}</p>}
        {posts.length === 0 && !postsLoading ? (
          !postsError ? <p style={{ color: '#888' }}>投稿はまだありません</p> : null
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f0f0f0' }}>
                  <th style={{ padding: '8px', textAlign: 'left', fontWeight: 'normal' }}>投稿者</th>
                  <th style={{ padding: '8px', textAlign: 'left', fontWeight: 'normal' }}>日時</th>
                  <th style={{ padding: '8px', textAlign: 'left', fontWeight: 'normal' }}>サイズ</th>
                  <th style={{ padding: '8px', textAlign: 'left', fontWeight: 'normal' }}>状態</th>
                  <th style={{ padding: '8px', textAlign: 'left', fontWeight: 'normal' }}>操作</th>
                </tr>
              </thead>
              <tbody>
                {posts.map((post) => (
                  <PostRow
                    key={post.id}
                    post={post}
                    onToggle={handleToggle}
                    onDelete={handleDelete}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Slideshow settings */}
      <section style={{ marginBottom: 32 }}>
        <h3 style={{ margin: '0 0 14px' }}>スライドショー設定</h3>
        <SlideshowSettingsForm initial={settings} onSave={handleSaveSettings} saving={settingsSaving} />
        {settingsMsg && (
          <p style={{ marginTop: 8, fontSize: 13, color: settingsMsg.startsWith('エラー') ? 'red' : 'green' }}>
            {settingsMsg}
          </p>
        )}
      </section>

      {/* Event mode */}
      <section style={{ marginBottom: 32 }}>
        <h3 style={{ margin: '0 0 14px' }}>ルーム公開モード</h3>
        <EventModeSection roomId={roomId ?? ''} />
      </section>

      {/* Theme settings */}
      <section style={{ marginBottom: 32 }}>
        <h3 style={{ margin: '0 0 14px' }}>テーマ設定（参加者画面）</h3>
        <ThemeSettingsForm initial={theme} roomId={roomId ?? ''} onSaved={setTheme} />
      </section>
    </div>
  );
}

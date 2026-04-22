import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { api, ApiError, type RoomInfo, type Post } from '../api/client';

type UploadState = 'idle' | 'signing' | 'uploading' | 'completing' | 'done' | 'error';

export default function RoomPage() {
  const { roomId } = useParams<{ roomId: string }>();

  const [room, setRoom] = useState<RoomInfo | null>(null);
  const [roomError, setRoomError] = useState('');

  const nicknameKey = `nickname:${roomId}`;
  const [nickname, setNickname] = useState(() => localStorage.getItem(nicknameKey) ?? '');
  const [nicknameInput, setNicknameInput] = useState('');
  const [passcodeInput, setPasscodeInput] = useState('');
  const [passcodeVerified, setPasscodeVerified] = useState(false);

  const [file, setFile] = useState<File | null>(null);
  const [uploadState, setUploadState] = useState<UploadState>('idle');
  const [uploadError, setUploadError] = useState('');
  const [lastPostId, setLastPostId] = useState('');

  const [posts, setPosts] = useState<Post[]>([]);
  const [postsError, setPostsError] = useState('');

  const loadPosts = useCallback(async () => {
    if (!roomId) return;
    try {
      const res = await api.getPosts(roomId);
      setPosts(res.posts);
      setPostsError('');
    } catch (e) {
      setPostsError(e instanceof ApiError ? e.message : '一覧の取得に失敗しました');
    }
  }, [roomId]);

  useEffect(() => {
    if (!roomId) return;
    api.getRoom(roomId)
      .then((r) => {
        setRoom(r);
        if (!r.hasPasscode) setPasscodeVerified(true);
      })
      .catch((e) => setRoomError(e instanceof ApiError ? e.message : 'ルーム情報の取得に失敗しました'));
  }, [roomId]);

  useEffect(() => {
    if (nickname && passcodeVerified) {
      loadPosts();
    }
  }, [nickname, passcodeVerified, loadPosts]);

  function handlePasscodeSubmit() {
    setPasscodeVerified(true);
  }

  function handleNicknameSubmit() {
    const n = nicknameInput.trim();
    if (!n) return;
    localStorage.setItem(nicknameKey, n);
    setNickname(n);
  }

  async function handleUpload() {
    if (!file || !roomId || !nickname) return;
    setUploadState('signing');
    setUploadError('');
    let postId = '';

    try {
      const urlRes = await api.getUploadUrl(roomId, {
        nickname,
        fileName: file.name,
        mimeType: file.type,
        fileSize: file.size,
      });
      postId = urlRes.postId;
      setLastPostId(postId);

      setUploadState('uploading');
      const putRes = await fetch(urlRes.uploadUrl, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type },
      });

      if (!putRes.ok) throw new Error(`R2 PUT failed: ${putRes.status}`);

      setUploadState('completing');
      await api.completeUpload(roomId, postId);

      setUploadState('done');
      setFile(null);
      await loadPosts();
    } catch (e) {
      setUploadState('error');
      setUploadError(e instanceof Error ? e.message : 'アップロードに失敗しました');
      if (postId) {
        await api.failUpload(roomId, postId).catch(() => {});
      }
    }
  }

  async function handleRetry() {
    if (!file) {
      setUploadState('idle');
      setUploadError('');
      return;
    }
    await handleUpload();
  }

  if (roomError) {
    return (
      <div style={{ maxWidth: 480, margin: '40px auto', padding: '0 16px' }}>
        <p style={{ color: 'red' }}>{roomError}</p>
      </div>
    );
  }

  if (!room) {
    return <div style={{ padding: 24 }}>読み込み中...</div>;
  }

  if (room.hasPasscode && !passcodeVerified) {
    return (
      <div style={{ maxWidth: 480, margin: '40px auto', padding: '0 16px' }}>
        <h2>{room.name}</h2>
        <p>パスコードを入力してください</p>
        <input
          type="text"
          value={passcodeInput}
          onChange={(e) => setPasscodeInput(e.target.value)}
          placeholder="パスコード"
          style={{ padding: '8px', width: '100%', boxSizing: 'border-box', marginBottom: 8 }}
        />
        <button onClick={handlePasscodeSubmit} style={{ padding: '8px 16px', cursor: 'pointer' }}>
          入室する
        </button>
        <p style={{ fontSize: 12, color: '#888' }}>※ パスコード検証はサーバー側で行います</p>
      </div>
    );
  }

  if (!nickname) {
    return (
      <div style={{ maxWidth: 480, margin: '40px auto', padding: '0 16px' }}>
        <h2>{room.name}</h2>
        <p>ニックネームを入力してください</p>
        <input
          type="text"
          value={nicknameInput}
          onChange={(e) => setNicknameInput(e.target.value)}
          placeholder="例: 太郎"
          style={{ padding: '8px', width: '100%', boxSizing: 'border-box', marginBottom: 8 }}
          onKeyDown={(e) => e.key === 'Enter' && handleNicknameSubmit()}
        />
        <button onClick={handleNicknameSubmit} style={{ padding: '8px 16px', cursor: 'pointer' }}>
          参加する
        </button>
      </div>
    );
  }

  const uploadLabel: Record<UploadState, string> = {
    idle: 'アップロード',
    signing: 'URL取得中...',
    uploading: 'アップロード中...',
    completing: '確定中...',
    done: '完了！',
    error: '再試行',
  };

  return (
    <div style={{ maxWidth: 600, margin: '40px auto', padding: '0 16px' }}>
      <h2>{room.name}</h2>
      <p style={{ color: '#555' }}>参加中: <strong>{nickname}</strong></p>

      <div style={{ border: '1px solid #ccc', borderRadius: 4, padding: 16, marginBottom: 24 }}>
        <h3 style={{ margin: '0 0 12px' }}>画像をアップロード</h3>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic"
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setUploadState('idle');
            setUploadError('');
          }}
          disabled={['signing', 'uploading', 'completing'].includes(uploadState)}
          style={{ display: 'block', marginBottom: 8 }}
        />
        {file && (
          <p style={{ fontSize: 13, color: '#555', margin: '0 0 8px' }}>
            {file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)
          </p>
        )}
        {uploadError && <p style={{ color: 'red', margin: '0 0 8px' }}>{uploadError}</p>}
        {uploadState === 'done' && (
          <p style={{ color: 'green', margin: '0 0 8px' }}>アップロード成功！</p>
        )}
        <button
          onClick={uploadState === 'error' ? handleRetry : handleUpload}
          disabled={!file || ['signing', 'uploading', 'completing'].includes(uploadState)}
          style={{ padding: '8px 20px', cursor: 'pointer' }}
        >
          {uploadLabel[uploadState]}
        </button>
        {lastPostId && uploadState === 'error' && (
          <p style={{ fontSize: 12, color: '#888', marginTop: 4 }}>postId: {lastPostId}</p>
        )}
      </div>

      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <h3 style={{ margin: 0 }}>投稿一覧</h3>
          <button onClick={loadPosts} style={{ padding: '4px 10px', cursor: 'pointer', fontSize: 12 }}>
            更新
          </button>
        </div>
        {postsError && <p style={{ color: 'red' }}>{postsError}</p>}
        {posts.length === 0 ? (
          <p style={{ color: '#888' }}>まだ投稿はありません</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {posts.map((p) => (
              <li key={p.id} style={{ borderBottom: '1px solid #eee', padding: '8px 0' }}>
                <span style={{ fontWeight: 'bold' }}>{p.nickname}</span>
                <span style={{ marginLeft: 8, fontSize: 12, color: '#888' }}>
                  {new Date(p.created_at * 1000).toLocaleString('ja-JP')}
                </span>
                <span
                  style={{
                    marginLeft: 8,
                    fontSize: 11,
                    background: '#e0e0e0',
                    borderRadius: 3,
                    padding: '1px 5px',
                  }}
                >
                  {p.file_type}
                </span>
                {p.nickname === nickname && (
                  <span
                    style={{
                      marginLeft: 8,
                      fontSize: 11,
                      background: '#cce5ff',
                      borderRadius: 3,
                      padding: '1px 5px',
                    }}
                  >
                    自分
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

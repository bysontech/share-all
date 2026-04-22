import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api, ApiError, type RoomInfo } from '../api/client';
import { useUploadQueue } from '../hooks/useUploadQueue';
import { usePostsPolling } from '../hooks/usePostsPolling';
import type { QueueItem } from '../hooks/useUploadQueue';

const STATUS_LABEL: Record<QueueItem['status'], string> = {
  pending: '待機中',
  uploading: 'アップロード中',
  completing: '登録中',
  done: '完了',
  error: 'エラー',
};

export default function RoomPage() {
  const { roomId } = useParams<{ roomId: string }>();

  const [room, setRoom] = useState<RoomInfo | null>(null);
  const [roomError, setRoomError] = useState('');

  const nicknameKey = `nickname:${roomId}`;
  const [nickname, setNickname] = useState(() => localStorage.getItem(nicknameKey) ?? '');
  const [nicknameInput, setNicknameInput] = useState('');
  const [passcodeInput, setPasscodeInput] = useState('');
  const [passcodeVerified, setPasscodeVerified] = useState(false);

  const { posts, error: pollError, addPost } = usePostsPolling(
    nickname && passcodeVerified ? roomId : undefined
  );

  const { items, addFiles, retryItem, clearDone, summary } = useUploadQueue({
    roomId: roomId ?? '',
    nickname,
    onPostComplete: addPost,
  });

  useEffect(() => {
    if (!roomId) return;
    api
      .getRoom(roomId)
      .then((r) => {
        setRoom(r);
        if (!r.hasPasscode) setPasscodeVerified(true);
      })
      .catch((e) => setRoomError(e instanceof ApiError ? e.message : 'ルーム情報の取得に失敗しました'));
  }, [roomId]);

  function handleNicknameSubmit() {
    const n = nicknameInput.trim();
    if (!n) return;
    localStorage.setItem(nicknameKey, n);
    setNickname(n);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files ?? []).filter((f) =>
      ['image/jpeg', 'image/png', 'image/webp', 'image/heic'].includes(f.type)
    );
    if (selected.length > 0) addFiles(selected);
    e.target.value = '';
  }

  if (roomError) {
    return (
      <div style={{ maxWidth: 480, margin: '40px auto', padding: '0 16px' }}>
        <p style={{ color: 'red' }}>{roomError}</p>
      </div>
    );
  }

  if (!room) return <div style={{ padding: 24 }}>読み込み中...</div>;

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
        <button onClick={() => setPasscodeVerified(true)} style={{ padding: '8px 16px', cursor: 'pointer' }}>
          入室する
        </button>
        <p style={{ fontSize: 12, color: '#888' }}>
          ※ パスコードは投稿時に検証されます
        </p>
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

  return (
    <div style={{ maxWidth: 600, margin: '40px auto', padding: '0 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <h2 style={{ margin: 0 }}>{room.name}</h2>
        <Link
          to={`/room/${roomId}/slideshow`}
          style={{
            padding: '6px 14px',
            background: '#1a1a1a',
            color: '#fff',
            borderRadius: 4,
            textDecoration: 'none',
            fontSize: 14,
          }}
        >
          スライドショー
        </Link>
      </div>
      <p style={{ color: '#555', margin: '0 0 20px' }}>
        参加中: <strong>{nickname}</strong>
      </p>

      {/* Upload area */}
      <div style={{ border: '1px solid #ccc', borderRadius: 4, padding: 16, marginBottom: 24 }}>
        <h3 style={{ margin: '0 0 12px' }}>画像をアップロード</h3>
        <label
          style={{
            display: 'inline-block',
            padding: '8px 16px',
            background: '#0066cc',
            color: '#fff',
            borderRadius: 4,
            cursor: 'pointer',
            marginBottom: 12,
          }}
        >
          画像を選択
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic"
            multiple
            onChange={handleFileChange}
            style={{ display: 'none' }}
          />
        </label>

        {/* Summary */}
        {summary.total > 0 && (
          <div style={{ fontSize: 13, color: '#555', marginBottom: 8 }}>
            全{summary.total}件 | 処理中: {summary.active} | 完了: {summary.done} | エラー: {summary.error}
            {summary.done > 0 && (
              <button
                onClick={clearDone}
                style={{ marginLeft: 8, fontSize: 12, cursor: 'pointer', padding: '2px 8px' }}
              >
                完了を消す
              </button>
            )}
          </div>
        )}

        {/* Queue list */}
        {items.length > 0 && (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {items.map((item) => (
              <li
                key={item.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '6px 0',
                  borderBottom: '1px solid #f0f0f0',
                  fontSize: 13,
                }}
              >
                <span
                  style={{
                    width: 60,
                    flexShrink: 0,
                    fontSize: 11,
                    padding: '2px 5px',
                    borderRadius: 3,
                    background:
                      item.status === 'done'
                        ? '#d4edda'
                        : item.status === 'error'
                        ? '#f8d7da'
                        : item.status === 'pending'
                        ? '#e2e3e5'
                        : '#fff3cd',
                    textAlign: 'center',
                  }}
                >
                  {STATUS_LABEL[item.status]}
                </span>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {item.file.name}
                </span>
                <span style={{ flexShrink: 0, color: '#888', fontSize: 11 }}>
                  {(item.file.size / 1024 / 1024).toFixed(1)} MB
                </span>
                {item.status === 'error' && (
                  <button
                    onClick={() => retryItem(item.id)}
                    style={{ fontSize: 11, padding: '2px 8px', cursor: 'pointer', flexShrink: 0 }}
                  >
                    再試行
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Post list */}
      <div>
        <h3 style={{ margin: '0 0 12px' }}>投稿一覧</h3>
        {pollError && (
          <p style={{ fontSize: 12, color: '#aaa' }}>{pollError}</p>
        )}
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

import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api, ApiError, type RoomInfo } from '../api/client';

export default function AdminPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const [room, setRoom] = useState<RoomInfo | null>(null);
  const [error, setError] = useState('');

  const hostToken = roomId ? localStorage.getItem(`hostToken:${roomId}`) : null;
  const participantUrl = roomId ? `${window.location.origin}/room/${roomId}` : '';

  useEffect(() => {
    if (!roomId) return;
    api.getRoom(roomId)
      .then(setRoom)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'ルーム情報の取得に失敗しました'));
  }, [roomId]);

  if (error) return <div style={{ padding: 24 }}><p style={{ color: 'red' }}>{error}</p></div>;
  if (!room) return <div style={{ padding: 24 }}>読み込み中...</div>;

  const expiresDate = new Date(room.expiresAt * 1000).toLocaleDateString('ja-JP');

  return (
    <div style={{ maxWidth: 600, margin: '40px auto', padding: '0 16px' }}>
      <h1>管理者ページ</h1>
      <h2>{room.name}</h2>
      {room.description && <p>{room.description}</p>}
      <table style={{ borderCollapse: 'collapse', width: '100%', marginBottom: 16 }}>
        <tbody>
          <tr>
            <td style={{ padding: '6px 8px', fontWeight: 'bold' }}>ルームID</td>
            <td style={{ padding: '6px 8px', fontFamily: 'monospace' }}>{room.roomId}</td>
          </tr>
          <tr>
            <td style={{ padding: '6px 8px', fontWeight: 'bold' }}>パスコード</td>
            <td style={{ padding: '6px 8px' }}>{room.hasPasscode ? '設定あり' : 'なし'}</td>
          </tr>
          <tr>
            <td style={{ padding: '6px 8px', fontWeight: 'bold' }}>有効期限</td>
            <td style={{ padding: '6px 8px' }}>{expiresDate}</td>
          </tr>
          <tr>
            <td style={{ padding: '6px 8px', fontWeight: 'bold' }}>ホストトークン</td>
            <td style={{ padding: '6px 8px', fontFamily: 'monospace', wordBreak: 'break-all' }}>
              {hostToken ?? '（このブラウザに保存されていません）'}
            </td>
          </tr>
        </tbody>
      </table>
      <div style={{ background: '#f0f0f0', padding: 16, borderRadius: 4 }}>
        <p style={{ margin: '0 0 8px', fontWeight: 'bold' }}>参加者URL</p>
        <p style={{ margin: '0 0 8px', wordBreak: 'break-all', fontFamily: 'monospace' }}>{participantUrl}</p>
        <button
          onClick={() => navigator.clipboard.writeText(participantUrl)}
          style={{ padding: '6px 12px', cursor: 'pointer' }}
        >
          コピー
        </button>
      </div>
    </div>
  );
}

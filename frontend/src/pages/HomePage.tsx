import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '../api/client';

export default function HomePage() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [passcode, setPasscode] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleCreate() {
    if (!name.trim()) { setError('ルーム名を入力してください'); return; }
    setLoading(true);
    setError('');
    try {
      const res = await api.createRoom({
        name: name.trim(),
        passcode: passcode.trim() || undefined,
        description: description.trim() || undefined,
      });
      localStorage.setItem(`hostToken:${res.roomId}`, res.hostToken);
      navigate(`/admin/${res.roomId}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'エラーが発生しました');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 480, margin: '40px auto', padding: '0 16px' }}>
      <h1>Share All</h1>
      <h2>ルーム作成</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <label>
          ルーム名 *
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例: 田中・山田 結婚式"
            style={{ display: 'block', width: '100%', marginTop: 4, padding: '8px', boxSizing: 'border-box' }}
          />
        </label>
        <label>
          パスコード（任意）
          <input
            type="text"
            value={passcode}
            onChange={(e) => setPasscode(e.target.value)}
            placeholder="省略可"
            style={{ display: 'block', width: '100%', marginTop: 4, padding: '8px', boxSizing: 'border-box' }}
          />
        </label>
        <label>
          説明（任意）
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="省略可"
            style={{ display: 'block', width: '100%', marginTop: 4, padding: '8px', boxSizing: 'border-box' }}
          />
        </label>
        {error && <p style={{ color: 'red' }}>{error}</p>}
        <button onClick={handleCreate} disabled={loading} style={{ padding: '10px', cursor: 'pointer' }}>
          {loading ? '作成中...' : 'ルームを作成'}
        </button>
      </div>
    </div>
  );
}

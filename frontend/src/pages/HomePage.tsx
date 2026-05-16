export default function HomePage() {
  return (
    <div
      style={{
        fontFamily: 'sans-serif',
        color: '#1a1a1a',
        maxWidth: 600,
        margin: '0 auto',
        padding: '0 20px',
      }}
    >
      {/* Hero */}
      <section
        style={{
          textAlign: 'center',
          padding: '80px 0 48px',
        }}
      >
        <h1 style={{ fontSize: 32, fontWeight: 700, margin: '0 0 16px' }}>Share Photo</h1>
        <p style={{ fontSize: 18, color: '#555', margin: '0 0 8px', lineHeight: 1.6 }}>
          結婚式・記念日の写真を、ゲストと一緒に残しましょう。
        </p>
        <p style={{ fontSize: 15, color: '#888', margin: 0, lineHeight: 1.6 }}>
          スマートフォンから簡単にアップロード・閲覧できる写真共有アプリです。
        </p>
      </section>

      {/* Features */}
      <section style={{ padding: '0 0 48px' }}>
        <ul
          style={{
            listStyle: 'none',
            padding: 0,
            margin: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 20,
          }}
        >
          {[
            { emoji: '📷', title: '写真・動画を共有', desc: 'ゲストがその場で撮った写真や動画を一か所に集められます。' },
            { emoji: '🖼️', title: 'ギャラリー表示', desc: 'アップロードされた写真をギャラリー形式でまとめて確認できます。' },
            { emoji: '✨', title: 'スライドショー', desc: '会場のモニターに映しながら、リアルタイムで写真を楽しめます。' },
            { emoji: '📱', title: 'スマホ対応', desc: 'QRコードや招待URLからかんたんに参加できます。' },
          ].map((f) => (
            <li
              key={f.title}
              style={{
                display: 'flex',
                gap: 16,
                alignItems: 'flex-start',
                padding: '16px',
                background: '#f8f8f8',
                borderRadius: 12,
              }}
            >
              <span style={{ fontSize: 28, flexShrink: 0 }}>{f.emoji}</span>
              <div>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>{f.title}</div>
                <div style={{ fontSize: 14, color: '#666', lineHeight: 1.5 }}>{f.desc}</div>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* How to join */}
      <section
        style={{
          background: '#f0f4ff',
          borderRadius: 16,
          padding: '28px 24px',
          marginBottom: 48,
          textAlign: 'center',
        }}
      >
        <h2 style={{ fontSize: 18, margin: '0 0 12px' }}>ご参加の方へ</h2>
        <p style={{ fontSize: 14, color: '#555', margin: 0, lineHeight: 1.7 }}>
          担当者から共有された招待URL（QRコード）からアクセスしてください。
          <br />
          アプリのインストールは不要です。
        </p>
      </section>

      <footer
        style={{
          textAlign: 'center',
          fontSize: 12,
          color: '#aaa',
          paddingBottom: 40,
        }}
      >
        &copy; {new Date().getFullYear()} Share Photo
      </footer>
    </div>
  );
}

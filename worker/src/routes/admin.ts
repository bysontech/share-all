import { Hono } from 'hono';
import type { Env } from '../types';
import { uuid, nowSec } from '../utils';
import { ADMIN_SESSION_COOKIE, verifyAdminSiteSession } from '../adminSession';

type ParamRoomId = { roomId: string };

const admin = new Hono<{ Bindings: Env }>();

// ── Crypto helpers ──

function uint8ToBase64(arr: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < arr.length; i++) binary += String.fromCharCode(arr[i]);
  return btoa(binary);
}

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function hmacSign(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return uint8ToBase64(new Uint8Array(sig));
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function buildSetCookie(value: string, maxAge: number, secure: boolean): string {
  let s = `${ADMIN_SESSION_COOKIE}=${value}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}`;
  if (secure) s += '; Secure';
  return s;
}

// ── Session helpers ──

async function issueSessionCookie(secret: string, maxAge: number, secure: boolean): Promise<string> {
  const payload = btoa(JSON.stringify({ iat: nowSec() }));
  const sig = await hmacSign(secret, payload);
  return buildSetCookie(`${payload}.${sig}`, maxAge, secure);
}

function isSecureEnv(env: Env): boolean {
  return (env.FRONTEND_URL ?? '').startsWith('https://');
}

// ── Middleware ──

async function requireAdmin(c: { env: Env; req: { header: (name: string) => string | undefined }; json: (data: unknown, status?: number) => Response }): Promise<Response | null> {
  const ok = await verifyAdminSiteSession(c.env, c.req.header('Cookie'));
  if (!ok) return c.json({ error: 'Unauthorized' }, 401);
  return null;
}

// ── Routes ──

// POST /api/admin/login
admin.post('/login', async (c) => {
  const passwordHashRaw = c.env.ADMIN_PASSWORD_HASH?.trim();
  const secret = c.env.ADMIN_SESSION_SECRET?.trim();
  if (!passwordHashRaw || !secret) {
    return c.json({ error: 'Admin not configured' }, 503);
  }

  // Plain SHA-256 of UTF-8 password, lowercase hex (64 chars). Wrong format → env misconfigured.
  const passwordHash = passwordHashRaw.toLowerCase().replace(/^0x/, '');
  if (!/^[a-f0-9]{64}$/.test(passwordHash)) {
    return c.json({
      error: 'Admin misconfigured',
      hint: 'ADMIN_PASSWORD_HASH must be SHA-256 hex (64 lowercase hex chars)',
    }, 503);
  }

  const body = await c.req.json<{ password?: string }>();
  if (!body.password) {
    return c.json({ error: 'password is required' }, 400);
  }

  const inputHash = await sha256Hex(body.password);
  if (!timingSafeEqual(inputHash, passwordHash)) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const maxAge = parseInt(c.env.ADMIN_SESSION_MAX_AGE ?? '86400', 10);
  const cookie = await issueSessionCookie(secret, maxAge, isSecureEnv(c.env));

  c.header('Set-Cookie', cookie);
  return c.json({ ok: true });
});

// POST /api/admin/logout
admin.post('/logout', (c) => {
  c.header('Set-Cookie', buildSetCookie('', 0, isSecureEnv(c.env)));
  return c.json({ ok: true });
});

// GET /api/admin/me
admin.get('/me', async (c) => {
  const denied = await requireAdmin(c);
  if (denied) return denied;
  return c.json({ ok: true });
});

// GET /api/admin/rooms
admin.get('/rooms', async (c) => {
  const denied = await requireAdmin(c);
  if (denied) return denied;

  type RoomRow = {
    id: string;
    name: string;
    description: string | null;
    created_at: number;
    expires_at: number;
  };
  type CountRow = {
    room_id: string;
    total: number;
    image_count: number;
    video_count: number;
  };

  const [roomsResult, countsResult] = await Promise.all([
    c.env.DB.prepare(
      'SELECT id, name, description, created_at, expires_at FROM rooms ORDER BY created_at DESC'
    ).all<RoomRow>(),
    c.env.DB.prepare(
      `SELECT room_id,
         COUNT(*) AS total,
         SUM(CASE WHEN file_type = 'image' THEN 1 ELSE 0 END) AS image_count,
         SUM(CASE WHEN file_type = 'video' THEN 1 ELSE 0 END) AS video_count
       FROM posts WHERE upload_status = 'uploaded' GROUP BY room_id`
    ).all<CountRow>(),
  ]);

  const countMap: Record<string, CountRow> = {};
  for (const row of countsResult.results ?? []) countMap[row.room_id] = row;

  const frontendUrl = c.env.FRONTEND_URL ?? '';
  const rooms = (roomsResult.results ?? []).map((r) => {
    const cnt = countMap[r.id];
    return {
      roomId: r.id,
      name: r.name,
      description: r.description,
      createdAt: r.created_at,
      expiresAt: r.expires_at,
      participantUrl: `${frontendUrl}/room/${r.id}`,
      adminUrl: `${frontendUrl}/admin/${r.id}`,
      postCount: cnt?.total ?? 0,
      imageCount: cnt?.image_count ?? 0,
      videoCount: cnt?.video_count ?? 0,
    };
  });

  return c.json({ rooms });
});

// POST /api/admin/rooms
admin.post('/rooms', async (c) => {
  const denied = await requireAdmin(c);
  if (denied) return denied;

  const body = await c.req.json<{ name?: string; passcode?: string; description?: string }>();
  if (!body.name || body.name.trim() === '') {
    return c.json({ error: 'name is required' }, 400);
  }

  const roomId = uuid();
  const hostToken = uuid();
  const now = nowSec();
  const expiresAt = now + 30 * 24 * 60 * 60;

  await c.env.DB.prepare(
    'INSERT INTO rooms (id, name, passcode, host_token, description, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  )
    .bind(roomId, body.name.trim(), body.passcode ?? null, hostToken, body.description ?? null, expiresAt, now)
    .run();

  await c.env.DB.prepare(
    'INSERT INTO slideshow_settings (room_id, interval_seconds, show_nickname, order_mode, updated_at) VALUES (?, 5, 1, ?, ?)'
  )
    .bind(roomId, 'asc', now)
    .run();

  const frontendUrl = c.env.FRONTEND_URL ?? '';
  return c.json(
    {
      roomId,
      hostToken,
      participantUrl: `${frontendUrl}/room/${roomId}`,
      adminUrl: `${frontendUrl}/admin/${roomId}`,
      expiresAt,
    },
    201
  );
});

// DELETE /api/admin/rooms/:roomId
admin.delete('/rooms/:roomId', async (c) => {
  const denied = await requireAdmin(c);
  if (denied) return denied;

  const { roomId } = c.req.param() as ParamRoomId;

  const room = await c.env.DB.prepare('SELECT id FROM rooms WHERE id = ?')
    .bind(roomId)
    .first<{ id: string }>();
  if (!room) return c.json({ error: 'Room not found' }, 404);

  type PostRow = { id: string; file_key: string };
  type DerivRow = { file_key: string | null };
  type ThemeRow = { main_visual_key: string | null; background_image_key: string | null };

  const [postsResult, derivsResult, theme] = await Promise.all([
    c.env.DB.prepare('SELECT id, file_key FROM posts WHERE room_id = ?').bind(roomId).all<PostRow>(),
    c.env.DB.prepare(
      `SELECT md.file_key FROM media_derivatives md
       JOIN posts p ON md.post_id = p.id WHERE p.room_id = ?`
    )
      .bind(roomId)
      .all<DerivRow>(),
    c.env.DB.prepare(
      'SELECT main_visual_key, background_image_key FROM theme_settings WHERE room_id = ?'
    )
      .bind(roomId)
      .first<ThemeRow>(),
  ]);

  // Delete R2 objects (log failures, don't abort)
  const r2Keys: string[] = [];
  for (const p of postsResult.results ?? []) if (p.file_key) r2Keys.push(p.file_key);
  for (const d of derivsResult.results ?? []) if (d.file_key) r2Keys.push(d.file_key);
  if (theme?.main_visual_key) r2Keys.push(theme.main_visual_key);
  if (theme?.background_image_key) r2Keys.push(theme.background_image_key);

  await Promise.all(
    r2Keys.map((key) =>
      c.env.STORAGE.delete(key).catch((e) => console.error(`R2 delete failed: ${key}`, e))
    )
  );

  // Delete DB records in dependency order
  const postIds = (postsResult.results ?? []).map((p) => p.id);
  if (postIds.length > 0) {
    const placeholders = postIds.map(() => '?').join(',');
    await c.env.DB.prepare(
      `DELETE FROM media_derivatives WHERE post_id IN (${placeholders})`
    )
      .bind(...postIds)
      .run();
  }
  await c.env.DB.prepare('DELETE FROM posts WHERE room_id = ?').bind(roomId).run();
  await c.env.DB.prepare('DELETE FROM slideshow_settings WHERE room_id = ?').bind(roomId).run();
  await c.env.DB.prepare('DELETE FROM theme_settings WHERE room_id = ?').bind(roomId).run();
  await c.env.DB.prepare('DELETE FROM rooms WHERE id = ?').bind(roomId).run();

  return c.json({ ok: true, deletedPosts: postIds.length });
});

export default admin;

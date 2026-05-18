import { Hono } from 'hono';
import type { Env } from '../types';

const wedding = new Hono<{ Bindings: Env }>();

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function validateToken(token: string, envHash: string | undefined): Promise<boolean> {
  if (!envHash) return false;
  const storedHash = envHash.trim().toLowerCase().replace(/^0x/, '');
  const inputHash = await sha256Hex(token);
  return timingSafeEqual(inputHash, storedHash);
}

// GET /wedding/live/:token — redirect to slideshow
// Registered before /:token so the literal "live" segment is matched first.
wedding.get('/live/:token', async (c) => {
  const { token } = c.req.param() as { token: string };
  const roomId = c.env.PUBLIC_WEDDING_ROOM_ID?.trim();

  if (!roomId || !(await validateToken(token, c.env.PUBLIC_WEDDING_LIVE_TOKEN_HASH))) {
    return c.notFound();
  }

  const base = (c.env.FRONTEND_URL ?? '').replace(/\/$/, '');
  return c.redirect(`${base}/room/${roomId}/slideshow`, 302);
});

// GET /wedding/:token — redirect to room participant view
wedding.get('/:token', async (c) => {
  const { token } = c.req.param() as { token: string };
  const roomId = c.env.PUBLIC_WEDDING_ROOM_ID?.trim();

  if (!roomId || !(await validateToken(token, c.env.PUBLIC_WEDDING_ENTRY_TOKEN_HASH))) {
    return c.notFound();
  }

  const base = (c.env.FRONTEND_URL ?? '').replace(/\/$/, '');
  return c.redirect(`${base}/room/${roomId}`, 302);
});

// Catch-all: return 404 for all other /wedding/* paths to prevent enumeration
wedding.all('*', (c) => c.notFound());

export default wedding;

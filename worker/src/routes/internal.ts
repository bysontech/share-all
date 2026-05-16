import { Hono } from 'hono';
import type { Env } from '../types';
import { nowSec } from '../utils';
import {
  ADMIN_ENTRY_COOKIE,
  signEntryPayload,
  buildEntryCookieHeader,
} from '../entrySession';

const internal = new Hono<{ Bindings: Env }>();

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

// GET /internal/:token
// Validates the entry token and issues an admin_entry cookie, then redirects to /admin/login.
// Returns 404 on any failure to avoid revealing the existence of the admin route.
internal.get('/:token', async (c) => {
  const { token } = c.req.param() as { token: string };
  const tokenHashRaw = c.env.ADMIN_ENTRY_TOKEN_HASH?.trim();
  const secret = c.env.ADMIN_ENTRY_SESSION_SECRET?.trim();
  const ts = new Date().toISOString();

  if (!tokenHashRaw || !secret) {
    console.log(`[internal] ${ts} entry not configured`);
    return c.notFound();
  }

  const tokenHash = tokenHashRaw.toLowerCase().replace(/^0x/, '');
  const inputHash = await sha256Hex(token);

  if (!timingSafeEqual(inputHash, tokenHash)) {
    console.log(`[internal] ${ts} token mismatch`);
    return c.notFound();
  }

  console.log(`[internal] ${ts} token accepted`);

  const maxAge = parseInt(c.env.ADMIN_ENTRY_SESSION_MAX_AGE ?? '1800', 10);
  const secure = (c.env.FRONTEND_URL ?? '').startsWith('https://');
  const payload = btoa(JSON.stringify({ iat: nowSec() }));
  const sig = await signEntryPayload(secret, payload);

  c.header('Set-Cookie', buildEntryCookieHeader(secret, payload, sig, maxAge, secure));

  const frontendUrl = (c.env.FRONTEND_URL ?? '').replace(/\/$/, '');
  return c.redirect(`${frontendUrl}/admin/login`, 302);
});

// Catch-all under /internal to prevent path enumeration
internal.all('*', (c) => c.notFound());

export default internal;


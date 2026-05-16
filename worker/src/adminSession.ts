import type { Env } from './types';

/** Cookie name for site-wide admin login (matches admin routes Set-Cookie) */
export const ADMIN_SESSION_COOKIE = 'admin_session';

function parseCookie(cookieHeader: string | undefined, name: string): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return null;
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
  let binary = '';
  for (let i = 0; i < sig.byteLength; i++) binary += String.fromCharCode(new Uint8Array(sig)[i]);
  return btoa(binary);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** True if request carries a valid signed admin_session cookie */
export async function verifyAdminSiteSession(
  env: Env,
  cookieHeader: string | undefined
): Promise<boolean> {
  const secret = env.ADMIN_SESSION_SECRET?.trim();
  if (!secret) return false;
  const raw = parseCookie(cookieHeader, ADMIN_SESSION_COOKIE);
  if (!raw) return false;
  const lastDot = raw.lastIndexOf('.');
  if (lastDot < 0) return false;
  const payload = raw.slice(0, lastDot);
  const givenSig = raw.slice(lastDot + 1);
  const expectedSig = await hmacSign(secret, payload);
  return timingSafeEqual(givenSig, expectedSig);
}

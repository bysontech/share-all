import type { Env } from './types';

/** Cookie name for the admin entry gate (separate from admin_session) */
export const ADMIN_ENTRY_COOKIE = 'admin_entry';

function parseCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
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
  new Uint8Array(sig).forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** True if request carries a valid signed admin_entry cookie */
export async function verifyAdminEntrySession(
  env: Env,
  cookieHeader: string | undefined
): Promise<boolean> {
  const secret = env.ADMIN_ENTRY_SESSION_SECRET?.trim();
  if (!secret) return false;
  const raw = parseCookie(cookieHeader, ADMIN_ENTRY_COOKIE);
  if (!raw) return false;
  const lastDot = raw.lastIndexOf('.');
  if (lastDot < 0) return false;
  const payload = raw.slice(0, lastDot);
  const givenSig = raw.slice(lastDot + 1);
  const expectedSig = await hmacSign(secret, payload);
  return timingSafeEqual(givenSig, expectedSig);
}

/** Build the Set-Cookie header string for the entry cookie */
export function buildEntryCookieHeader(
  secret: string,
  payload: string,
  sig: string,
  maxAge: number,
  secure: boolean
): string {
  const value = `${payload}.${sig}`;
  let s = `${ADMIN_ENTRY_COOKIE}=${value}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}`;
  if (secure) s += '; Secure';
  return s;
}

/** Sign a payload with the entry secret and return the base64 sig */
export async function signEntryPayload(secret: string, payload: string): Promise<string> {
  return hmacSign(secret, payload);
}

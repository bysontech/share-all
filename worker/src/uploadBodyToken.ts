import { nowSec } from './utils';

export type UploadBodyTokenPayload = {
  postId: string;
  roomId: string;
  fileKey: string;
  mimeType: string;
  exp: number;
};

function bytesToB64url(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]!);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlToBytes(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + pad;
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a[i]! ^ b[i]!;
  return out === 0;
}

async function hmacSha256(secret: string, message: string): Promise<Uint8Array> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return new Uint8Array(sig);
}

export async function createUploadBodyToken(
  secret: string,
  data: UploadBodyTokenPayload
): Promise<string> {
  const payload = JSON.stringify(data);
  const sig = await hmacSha256(secret, payload);
  return `${bytesToB64url(new TextEncoder().encode(payload))}.${bytesToB64url(sig)}`;
}

export async function verifyUploadBodyToken(
  secret: string,
  token: string
): Promise<UploadBodyTokenPayload | null> {
  const dot = token.indexOf('.');
  if (dot === -1) return null;
  const payloadB64 = token.slice(0, dot);
  const sigB64 = token.slice(dot + 1);
  let payload: string;
  try {
    payload = new TextDecoder().decode(b64urlToBytes(payloadB64));
  } catch {
    return null;
  }
  const expectedSig = await hmacSha256(secret, payload);
  let actualSig: Uint8Array;
  try {
    actualSig = b64urlToBytes(sigB64);
  } catch {
    return null;
  }
  if (!timingSafeEqual(expectedSig, actualSig)) return null;
  let data: UploadBodyTokenPayload;
  try {
    data = JSON.parse(payload) as UploadBodyTokenPayload;
  } catch {
    return null;
  }
  if (
    typeof data.postId !== 'string' ||
    typeof data.roomId !== 'string' ||
    typeof data.fileKey !== 'string' ||
    typeof data.mimeType !== 'string' ||
    typeof data.exp !== 'number'
  ) {
    return null;
  }
  if (data.exp < nowSec()) return null;
  return data;
}

export type ViewFileTokenPayload = {
  k: 'view-file';
  postId: string;
  roomId: string;
  fileKey: string;
  exp: number;
};

export async function createViewFileToken(
  secret: string,
  data: Omit<ViewFileTokenPayload, 'k'>
): Promise<string> {
  const full: ViewFileTokenPayload = { k: 'view-file', ...data };
  const payload = JSON.stringify(full);
  const sig = await hmacSha256(secret, payload);
  return `${bytesToB64url(new TextEncoder().encode(payload))}.${bytesToB64url(sig)}`;
}

export async function verifyViewFileToken(
  secret: string,
  token: string
): Promise<ViewFileTokenPayload | null> {
  const dot = token.indexOf('.');
  if (dot === -1) return null;
  const payloadB64 = token.slice(0, dot);
  const sigB64 = token.slice(dot + 1);
  let payload: string;
  try {
    payload = new TextDecoder().decode(b64urlToBytes(payloadB64));
  } catch {
    return null;
  }
  const expectedSig = await hmacSha256(secret, payload);
  let actualSig: Uint8Array;
  try {
    actualSig = b64urlToBytes(sigB64);
  } catch {
    return null;
  }
  if (!timingSafeEqual(expectedSig, actualSig)) return null;
  let data: ViewFileTokenPayload;
  try {
    data = JSON.parse(payload) as ViewFileTokenPayload;
  } catch {
    return null;
  }
  if (data.k !== 'view-file') return null;
  if (
    typeof data.postId !== 'string' ||
    typeof data.roomId !== 'string' ||
    typeof data.fileKey !== 'string' ||
    typeof data.exp !== 'number'
  ) {
    return null;
  }
  if (data.exp < nowSec()) return null;
  return data;
}

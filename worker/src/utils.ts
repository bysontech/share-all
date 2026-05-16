export function uuid(): string {
  return crypto.randomUUID();
}

export function nowSec(): number {
  return Math.floor(Date.now() / 1000);
}

/** `rooms.expires_at` is NOT NULL; app does not enforce room expiry—this is a DB placeholder only. */
export const ROOM_EXPIRES_AT_PLACEHOLDER_SEC = 4102444800; // ~2100-01-01 UTC

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function err(message: string, status = 400): Response {
  return json({ error: message }, status);
}

export function getExtFromMime(mime: string): string {
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/heic': 'heic',
    'video/mp4': 'mp4',
    'video/quicktime': 'mov',
  };
  return map[mime] ?? 'bin';
}

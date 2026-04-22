export function uuid(): string {
  return crypto.randomUUID();
}

export function nowSec(): number {
  return Math.floor(Date.now() / 1000);
}

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
  };
  return map[mime] ?? 'bin';
}

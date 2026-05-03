const KEY = (roomId: string) => `room:${roomId}:participantId`;

export function getOrCreateParticipantId(roomId: string): string {
  const existing = localStorage.getItem(KEY(roomId));
  if (existing) return existing;
  const id = crypto.randomUUID();
  try { localStorage.setItem(KEY(roomId), id); } catch {}
  return id;
}

export function getParticipantId(roomId: string): string | null {
  return localStorage.getItem(KEY(roomId));
}

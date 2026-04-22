import type { D1Database } from '@cloudflare/workers-types';
import type { Room, Post } from './types';

export async function getRoom(db: D1Database, roomId: string): Promise<Room | null> {
  const result = await db
    .prepare('SELECT * FROM rooms WHERE id = ?')
    .bind(roomId)
    .first<Room>();
  return result ?? null;
}

export async function getRoomAndValidate(
  db: D1Database,
  roomId: string
): Promise<{ room: Room } | { error: string; status: number }> {
  const room = await getRoom(db, roomId);
  if (!room) return { error: 'Room not found', status: 404 };
  const now = Math.floor(Date.now() / 1000);
  if (room.expires_at < now) return { error: 'Room has expired', status: 410 };
  return { room };
}

export async function getPost(db: D1Database, postId: string): Promise<Post | null> {
  const result = await db
    .prepare('SELECT * FROM posts WHERE id = ?')
    .bind(postId)
    .first<Post>();
  return result ?? null;
}

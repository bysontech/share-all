import { Hono } from 'hono';
import type { Env } from '../types';
import { uuid, nowSec, err } from '../utils';
import { getRoomAndValidate } from '../db';

const rooms = new Hono<{ Bindings: Env }>();

rooms.post('/', async (c) => {
  const body = await c.req.json<{ name?: string; passcode?: string; description?: string }>();
  if (!body.name || body.name.trim() === '') {
    return err('name is required');
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
  const participantUrl = `${frontendUrl}/room/${roomId}`;

  return c.json({ roomId, hostToken, participantUrl, expiresAt }, 201);
});

rooms.get('/:roomId', async (c) => {
  const { roomId } = c.req.param();
  const result = await getRoomAndValidate(c.env.DB, roomId);
  if ('error' in result) return err(result.error, result.status);
  const { room } = result;

  return c.json({
    roomId: room.id,
    name: room.name,
    hasPasscode: !!room.passcode,
    description: room.description,
    expiresAt: room.expires_at,
  });
});

export default rooms;

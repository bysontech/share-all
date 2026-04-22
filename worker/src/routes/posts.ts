import { Hono } from 'hono';
import type { Env } from '../types';
import { ALLOWED_IMAGE_MIMES, MAX_IMAGE_SIZE } from '../types';
import { uuid, nowSec, err, getExtFromMime } from '../utils';
import { getRoomAndValidate, getPost } from '../db';
import { generatePresignedPutUrl } from '../r2';

type ParamRoomId = { roomId: string };
type ParamPost = { roomId: string; postId: string };

const posts = new Hono<{ Bindings: Env }>();

posts.post('/upload-url', async (c) => {
  const { roomId } = c.req.param() as ParamRoomId;
  const roomResult = await getRoomAndValidate(c.env.DB, roomId);
  if ('error' in roomResult) return err(roomResult.error, roomResult.status);

  const body = await c.req.json<{
    nickname?: string;
    fileName?: string;
    mimeType?: string;
    fileSize?: number;
  }>();

  if (!body.nickname || body.nickname.trim() === '') {
    return err('nickname is required');
  }
  if (!body.mimeType) return err('mimeType is required');
  if (!body.fileSize) return err('fileSize is required');

  if (!(ALLOWED_IMAGE_MIMES as readonly string[]).includes(body.mimeType)) {
    return err(`mimeType not allowed: ${body.mimeType}`);
  }
  if (body.fileSize > MAX_IMAGE_SIZE) {
    return err('File too large (max 20MB)');
  }

  const postId = uuid();
  const ext = getExtFromMime(body.mimeType);
  const fileKey = `${roomId}/images/${postId}.${ext}`;
  const now = nowSec();
  const expirySeconds = parseInt(c.env.SIGNED_URL_EXPIRY_UPLOAD ?? '900', 10);

  await c.env.DB.prepare(
    `INSERT INTO posts (id, room_id, nickname, file_key, file_type, mime_type, file_size, status, upload_status, created_at)
     VALUES (?, ?, ?, ?, 'image', ?, ?, 'visible', 'pending', ?)`
  )
    .bind(postId, roomId, body.nickname.trim(), fileKey, body.mimeType, body.fileSize, now)
    .run();

  let uploadUrl: string;
  try {
    uploadUrl = await generatePresignedPutUrl(c.env.STORAGE, fileKey, body.mimeType, expirySeconds);
  } catch (_e) {
    await c.env.DB.prepare("UPDATE posts SET upload_status = 'failed' WHERE id = ?").bind(postId).run();
    return err('Failed to generate upload URL', 500);
  }

  return c.json({ uploadUrl, fileKey, postId }, 201);
});

posts.post('/:postId/complete', async (c) => {
  const { roomId, postId } = c.req.param() as ParamPost;
  const roomResult = await getRoomAndValidate(c.env.DB, roomId);
  if ('error' in roomResult) return err(roomResult.error, roomResult.status);

  const post = await getPost(c.env.DB, postId);
  if (!post) return err('Post not found', 404);
  if (post.room_id !== roomId) return err('Post not found', 404);
  if (post.upload_status !== 'pending') return err('Post is not pending', 409);

  const now = nowSec();
  await c.env.DB.prepare(
    "UPDATE posts SET upload_status = 'uploaded', uploaded_at = ? WHERE id = ?"
  )
    .bind(now, postId)
    .run();

  return c.json({ ok: true });
});

posts.post('/:postId/fail', async (c) => {
  const { roomId, postId } = c.req.param() as ParamPost;
  const roomResult = await getRoomAndValidate(c.env.DB, roomId);
  if ('error' in roomResult) return err(roomResult.error, roomResult.status);

  const post = await getPost(c.env.DB, postId);
  if (!post) return err('Post not found', 404);
  if (post.room_id !== roomId) return err('Post not found', 404);

  await c.env.DB.prepare("UPDATE posts SET upload_status = 'failed' WHERE id = ?")
    .bind(postId)
    .run();

  return c.json({ ok: true });
});

posts.get('/', async (c) => {
  const { roomId } = c.req.param() as ParamRoomId;
  const roomResult = await getRoomAndValidate(c.env.DB, roomId);
  if ('error' in roomResult) return err(roomResult.error, roomResult.status);

  const since = c.req.query('since');
  const limit = Math.min(parseInt(c.req.query('limit') ?? '50', 10), 100);

  type Row = { id: string; nickname: string; file_type: string; file_key: string; mime_type: string; created_at: number; sort_order: number | null };

  let results: Row[];

  if (since) {
    const { results: rows } = await c.env.DB.prepare(
      `SELECT id, nickname, file_type, file_key, mime_type, created_at, sort_order
       FROM posts
       WHERE room_id = ? AND upload_status = 'uploaded' AND status = 'visible' AND created_at > ?
       ORDER BY created_at ASC
       LIMIT ?`
    )
      .bind(roomId, parseInt(since, 10), limit)
      .all<Row>();
    results = rows;
  } else {
    const { results: rows } = await c.env.DB.prepare(
      `SELECT id, nickname, file_type, file_key, mime_type, created_at, sort_order
       FROM posts
       WHERE room_id = ? AND upload_status = 'uploaded' AND status = 'visible'
       ORDER BY created_at ASC
       LIMIT ?`
    )
      .bind(roomId, limit)
      .all<Row>();
    results = rows;
  }

  const serverTime = nowSec();
  return c.json({ posts: results, serverTime });
});

export default posts;

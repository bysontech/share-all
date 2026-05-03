import { Hono } from 'hono';
import type { Env } from '../types';
import { ALLOWED_IMAGE_MIMES, MAX_IMAGE_SIZE } from '../types';
import { uuid, nowSec, err, getExtFromMime } from '../utils';
import { getRoomAndValidate, getPost, validateHostToken } from '../db';
import { generatePresignedPutUrl, generatePresignedGetUrl, r2SupportsPresignedPut } from '../r2';
import {
  createUploadBodyToken,
  verifyUploadBodyToken,
  createViewFileToken,
  verifyViewFileToken,
} from '../uploadBodyToken';

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
    uploadType?: 'original' | 'display';
    postId?: string;
  }>();

  if (!body.mimeType) return err('mimeType is required');
  if (!body.fileSize) return err('fileSize is required');

  const expirySeconds = parseInt(c.env.SIGNED_URL_EXPIRY_UPLOAD ?? '900', 10);
  const now = nowSec();

  // Display WebP upload: no DB record, signs a URL for the display file key
  if (body.uploadType === 'display') {
    if (!body.postId) return err('postId is required for display uploads');
    if (body.mimeType !== 'image/webp') return err('display uploads must be image/webp');
    if (body.fileSize > MAX_IMAGE_SIZE) return err('File too large (max 20MB)');

    const post = await getPost(c.env.DB, body.postId);
    if (!post || post.room_id !== roomId) return err('Post not found', 404);

    const fileKey = `${roomId}/display/${body.postId}.webp`;
    let uploadUrl: string;

    if (r2SupportsPresignedPut(c.env.STORAGE)) {
      try {
        uploadUrl = await generatePresignedPutUrl(c.env.STORAGE, fileKey, 'image/webp', expirySeconds);
      } catch (e) {
        console.error('Failed to generate presigned display upload URL', { roomId, postId: body.postId, error: e });
        return err('Failed to generate upload URL', 500);
      }
    } else {
      const secret = c.env.UPLOAD_BODY_SIGNING_SECRET;
      if (!secret) return err('UPLOAD_BODY_SIGNING_SECRET is required for local upload proxy', 500);
      const exp = now + expirySeconds;
      const token = await createUploadBodyToken(secret, { postId: body.postId, roomId, fileKey, mimeType: 'image/webp', exp });
      uploadUrl = `/api/rooms/${roomId}/posts/${body.postId}/upload-display?token=${encodeURIComponent(token)}`;
    }

    return c.json({ uploadUrl, fileKey, postId: body.postId }, 200);
  }

  // Original upload
  if (!body.nickname || body.nickname.trim() === '') return err('nickname is required');
  if (!(ALLOWED_IMAGE_MIMES as readonly string[]).includes(body.mimeType)) {
    return err(`mimeType not allowed: ${body.mimeType}`);
  }
  if (body.fileSize > MAX_IMAGE_SIZE) return err('File too large (max 20MB)');

  const postId = uuid();
  const ext = getExtFromMime(body.mimeType);
  const fileKey = `${roomId}/images/${postId}.${ext}`;

  await c.env.DB.prepare(
    `INSERT INTO posts (id, room_id, nickname, file_key, file_type, mime_type, file_size, status, upload_status, created_at)
     VALUES (?, ?, ?, ?, 'image', ?, ?, 'visible', 'pending', ?)`
  )
    .bind(postId, roomId, body.nickname.trim(), fileKey, body.mimeType, body.fileSize, now)
    .run();

  let uploadUrl: string;
  if (r2SupportsPresignedPut(c.env.STORAGE)) {
    try {
      uploadUrl = await generatePresignedPutUrl(c.env.STORAGE, fileKey, body.mimeType, expirySeconds);
    } catch (e) {
      console.error('Failed to generate presigned upload URL', {
        roomId, postId, fileKey, mimeType: body.mimeType, expirySeconds, error: e,
      });
      await c.env.DB.prepare("UPDATE posts SET upload_status = 'failed' WHERE id = ?").bind(postId).run();
      return err('Failed to generate upload URL', 500);
    }
  } else {
    const secret = c.env.UPLOAD_BODY_SIGNING_SECRET;
    if (!secret) {
      await c.env.DB.prepare("UPDATE posts SET upload_status = 'failed' WHERE id = ?").bind(postId).run();
      return err('UPLOAD_BODY_SIGNING_SECRET is required for local upload proxy', 500);
    }
    const exp = now + expirySeconds;
    const token = await createUploadBodyToken(secret, { postId, roomId, fileKey, mimeType: body.mimeType, exp });
    uploadUrl = `/api/rooms/${roomId}/posts/${postId}/upload-body?token=${encodeURIComponent(token)}`;
  }

  return c.json({ uploadUrl, fileKey, postId }, 201);
});

posts.put('/:postId/upload-body', async (c) => {
  const { roomId, postId } = c.req.param() as ParamPost;
  const token = c.req.query('token');
  if (!token) return err('token is required', 400);

  const secret = c.env.UPLOAD_BODY_SIGNING_SECRET;
  if (!secret) return err('Upload proxy not configured', 501);

  const payload = await verifyUploadBodyToken(secret, token);
  if (!payload || payload.postId !== postId || payload.roomId !== roomId) {
    return err('Invalid or expired token', 403);
  }

  const roomResult = await getRoomAndValidate(c.env.DB, roomId);
  if ('error' in roomResult) return err(roomResult.error, roomResult.status);

  const post = await getPost(c.env.DB, postId);
  if (!post) return err('Post not found', 404);
  if (post.room_id !== roomId) return err('Post not found', 404);
  if (post.upload_status !== 'pending') return err('Post is not pending', 409);
  if (post.file_key !== payload.fileKey || post.mime_type !== payload.mimeType) {
    return err('Token does not match post', 403);
  }

  const contentLength = c.req.header('Content-Length');
  if (contentLength) {
    const n = parseInt(contentLength, 10);
    if (!Number.isFinite(n) || n > MAX_IMAGE_SIZE) {
      return err('File too large (max 20MB)', 413);
    }
  }

  const body = c.req.raw.body;
  if (!body) return err('Body is required', 400);

  try {
    await c.env.STORAGE.put(payload.fileKey, body, {
      httpMetadata: { contentType: payload.mimeType },
    });
  } catch (e) {
    console.error('R2 put failed (upload-body proxy)', { fileKey: payload.fileKey, error: e });
    return err('Storage upload failed', 500);
  }

  return new Response(null, { status: 204 });
});

posts.put('/:postId/upload-display', async (c) => {
  const { roomId, postId } = c.req.param() as ParamPost;
  const token = c.req.query('token');
  if (!token) return err('token is required', 400);

  const secret = c.env.UPLOAD_BODY_SIGNING_SECRET;
  if (!secret) return err('Upload proxy not configured', 501);

  const payload = await verifyUploadBodyToken(secret, token);
  if (!payload || payload.postId !== postId || payload.roomId !== roomId) {
    return err('Invalid or expired token', 403);
  }

  const roomResult = await getRoomAndValidate(c.env.DB, roomId);
  if ('error' in roomResult) return err(roomResult.error, roomResult.status);

  const body = c.req.raw.body;
  if (!body) return err('Body is required', 400);

  try {
    await c.env.STORAGE.put(payload.fileKey, body, {
      httpMetadata: { contentType: payload.mimeType },
    });
  } catch (e) {
    console.error('R2 put failed (upload-display proxy)', { fileKey: payload.fileKey, error: e });
    return err('Storage upload failed', 500);
  }

  return new Response(null, { status: 204 });
});

posts.post('/:postId/complete', async (c) => {
  const { roomId, postId } = c.req.param() as ParamPost;
  const roomResult = await getRoomAndValidate(c.env.DB, roomId);
  if ('error' in roomResult) return err(roomResult.error, roomResult.status);

  const post = await getPost(c.env.DB, postId);
  if (!post) return err('Post not found', 404);
  if (post.room_id !== roomId) return err('Post not found', 404);
  if (post.upload_status !== 'pending') return err('Post is not pending', 409);

  type CompleteBody = { participantId?: string; displayFileKey?: string; displayMimeType?: string };
  let body: CompleteBody = {};
  try { body = await c.req.json<CompleteBody>(); } catch { /* empty body ok */ }

  const now = nowSec();
  await c.env.DB.prepare(
    "UPDATE posts SET upload_status = 'uploaded', uploaded_at = ?, participant_id = ?, display_file_key = ?, display_mime_type = ? WHERE id = ?"
  )
    .bind(now, body.participantId ?? null, body.displayFileKey ?? null, body.displayMimeType ?? null, postId)
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

  type Row = { id: string; nickname: string; file_type: string; file_key: string; mime_type: string; created_at: number; sort_order: number | null; participant_id: string | null; display_file_key: string | null };

  let results: Row[];

  if (since) {
    const { results: rows } = await c.env.DB.prepare(
      `SELECT id, nickname, file_type, file_key, mime_type, created_at, sort_order, participant_id, display_file_key
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
      `SELECT id, nickname, file_type, file_key, mime_type, created_at, sort_order, participant_id, display_file_key
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

posts.post('/view-urls', async (c) => {
  const { roomId } = c.req.param() as ParamRoomId;
  const roomResult = await getRoomAndValidate(c.env.DB, roomId);
  if ('error' in roomResult) return err(roomResult.error, roomResult.status);

  const body = await c.req.json<{ postIds?: string[]; preferDisplay?: boolean }>();
  if (!Array.isArray(body.postIds) || body.postIds.length === 0) {
    return err('postIds must be a non-empty array');
  }
  if (body.postIds.length > 50) {
    return err('postIds too many (max 50)');
  }

  const expirySeconds = parseInt(c.env.SIGNED_URL_EXPIRY_VIEW ?? '3600', 10);
  const usePresigned = r2SupportsPresignedPut(c.env.STORAGE);
  const proxySecret = c.env.UPLOAD_BODY_SIGNING_SECRET;

  if (!usePresigned && !proxySecret) {
    return err('UPLOAD_BODY_SIGNING_SECRET is required for local view URL proxy', 501);
  }

  type Row = { id: string; file_key: string; display_file_key: string | null };
  const placeholders = body.postIds.map(() => '?').join(',');
  const { results } = await c.env.DB.prepare(
    `SELECT id, file_key, display_file_key FROM posts
     WHERE room_id = ? AND upload_status = 'uploaded' AND status = 'visible'
     AND id IN (${placeholders})`
  )
    .bind(roomId, ...body.postIds)
    .all<Row>();

  const viewUrls: Record<string, string> = {};
  const exp = nowSec() + expirySeconds;
  await Promise.all(
    results.map(async (row) => {
      const keyToSign = body.preferDisplay && row.display_file_key ? row.display_file_key : row.file_key;
      try {
        if (usePresigned) {
          const url = await generatePresignedGetUrl(c.env.STORAGE, keyToSign, expirySeconds);
          viewUrls[row.id] = url;
        } else {
          const token = await createViewFileToken(proxySecret!, {
            postId: row.id,
            roomId,
            fileKey: keyToSign,
            exp,
          });
          viewUrls[row.id] =
            `/api/rooms/${roomId}/posts/${row.id}/view-file?token=${encodeURIComponent(token)}`;
        }
      } catch (_e) {
        // skip: URL generation failure for one post should not fail the whole request
      }
    })
  );

  const expiresAt = exp;
  return c.json({ viewUrls, expiresAt });
});

// ---- Admin endpoints (X-Host-Token required) ----

posts.get('/admin', async (c) => {
  const { roomId } = c.req.param() as ParamRoomId;
  const roomResult = await getRoomAndValidate(c.env.DB, roomId);
  if ('error' in roomResult) return err(roomResult.error, roomResult.status);
  const { room } = roomResult;

  if (!validateHostToken(room, c.req.header('X-Host-Token'))) {
    return err('Unauthorized', 401);
  }

  const limit = Math.min(parseInt(c.req.query('limit') ?? '100', 10), 200);
  type AdminRow = {
    id: string; nickname: string; file_type: string; file_key: string;
    mime_type: string; file_size: number; status: string; upload_status: string;
    created_at: number; uploaded_at: number | null; sort_order: number | null;
  };

  const { results } = await c.env.DB.prepare(
    `SELECT id, nickname, file_type, file_key, mime_type, file_size, status, upload_status, created_at, uploaded_at, sort_order
     FROM posts
     WHERE room_id = ? AND upload_status = 'uploaded'
     ORDER BY created_at DESC
     LIMIT ?`
  )
    .bind(roomId, limit)
    .all<AdminRow>();

  return c.json({ posts: results });
});

posts.patch('/:postId', async (c) => {
  const { roomId, postId } = c.req.param() as ParamPost;
  const roomResult = await getRoomAndValidate(c.env.DB, roomId);
  if ('error' in roomResult) return err(roomResult.error, roomResult.status);
  const { room } = roomResult;

  if (!validateHostToken(room, c.req.header('X-Host-Token'))) {
    return err('Unauthorized', 401);
  }

  const body = await c.req.json<{ status?: string }>();
  if (!body.status || !['visible', 'hidden'].includes(body.status)) {
    return err('status must be visible or hidden');
  }

  const post = await getPost(c.env.DB, postId);
  if (!post) return err('Post not found', 404);
  if (post.room_id !== roomId) return err('Post not found', 404);

  await c.env.DB.prepare('UPDATE posts SET status = ? WHERE id = ?')
    .bind(body.status, postId)
    .run();

  return c.json({ id: postId, status: body.status });
});

posts.delete('/:postId', async (c) => {
  const { roomId, postId } = c.req.param() as ParamPost;
  const roomResult = await getRoomAndValidate(c.env.DB, roomId);
  if ('error' in roomResult) return err(roomResult.error, roomResult.status);
  const { room } = roomResult;

  if (!validateHostToken(room, c.req.header('X-Host-Token'))) {
    return err('Unauthorized', 401);
  }

  const post = await getPost(c.env.DB, postId);
  if (!post) return err('Post not found', 404);
  if (post.room_id !== roomId) return err('Post not found', 404);

  try {
    await c.env.STORAGE.delete(post.file_key);
  } catch (e) {
    console.error('R2 delete failed', { fileKey: post.file_key, error: e });
    return err('Failed to delete file from storage', 500);
  }

  await c.env.DB.prepare('DELETE FROM posts WHERE id = ?').bind(postId).run();

  return c.json({ ok: true });
});

posts.get('/:postId/view-file', async (c) => {
  const { roomId, postId } = c.req.param() as ParamPost;
  const token = c.req.query('token');
  if (!token) return err('token is required', 400);

  const secret = c.env.UPLOAD_BODY_SIGNING_SECRET;
  if (!secret) return err('View proxy not configured', 501);

  const payload = await verifyViewFileToken(secret, token);
  if (!payload || payload.postId !== postId || payload.roomId !== roomId) {
    return err('Invalid or expired token', 403);
  }

  const roomResult = await getRoomAndValidate(c.env.DB, roomId);
  if ('error' in roomResult) return err(roomResult.error, roomResult.status);

  const post = await getPost(c.env.DB, postId);
  if (!post) return err('Post not found', 404);
  if (post.room_id !== roomId) return err('Post not found', 404);
  if (post.upload_status !== 'uploaded' || post.status !== 'visible') {
    return err('Post not found', 404);
  }
  if (post.file_key !== payload.fileKey && post.display_file_key !== payload.fileKey) {
    return err('Token does not match post', 403);
  }

  const obj = await c.env.STORAGE.get(payload.fileKey);
  if (!obj) return err('Object not found', 404);

  const contentType = obj.httpMetadata?.contentType ?? post.mime_type;
  return new Response(obj.body, {
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'private, max-age=60',
    },
  });
});

export default posts;

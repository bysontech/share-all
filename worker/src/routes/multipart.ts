import { Hono } from 'hono';
import type { Env } from '../types';
import { ALLOWED_VIDEO_MIMES } from '../types';
import { uuid, nowSec, err, getExtFromMime } from '../utils';
import { getRoomAndValidate, getPost } from '../db';
import {
  createMultipartUpload,
  generatePresignedUploadPartUrl,
  completeMultipartUpload,
  abortMultipartUpload,
  envSupportsMultipart,
  missingPresignConfigKeys,
} from '../r2';
import { resolveEventMode } from '../eventMode';

type ParamRoomId = { roomId: string };

const DEFAULT_MAX_LARGE_VIDEO_SIZE_MB = 5000;

function maxLargeVideoSizeBytes(env: Env): number {
  const raw = parseInt(env.MAX_LARGE_VIDEO_SIZE_MB ?? '', 10);
  const mb = Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_MAX_LARGE_VIDEO_SIZE_MB;
  return mb * 1024 * 1024;
}

function s3ConfigError(env: Env) {
  const missing = missingPresignConfigKeys(env);
  return err(
    `大容量動画アップロードには R2 直接アップロード設定が必要です。未設定: ${missing.join(', ')}。本番は wrangler secret put、ローカルは worker/.dev.vars に設定してください。`,
    503
  );
}

const multipart = new Hono<{ Bindings: Env }>();

// Start a new Multipart Upload: validates the request, creates a pending post record
// (mirroring the existing /upload-url post-creation shape), and opens the R2-side
// multipart session. Does not touch the existing /upload-url endpoint or its post records.
multipart.post('/start', async (c) => {
  const { roomId } = c.req.param() as ParamRoomId;
  const roomResult = await getRoomAndValidate(c.env.DB, roomId);
  if ('error' in roomResult) return err(roomResult.error, roomResult.status);
  const { room } = roomResult;

  if (!envSupportsMultipart(c.env)) return s3ConfigError(c.env);

  const body = await c.req.json<{
    nickname?: string;
    fileName?: string;
    mimeType?: string;
    fileSize?: number;
  }>();

  if (!body.nickname || body.nickname.trim() === '') return err('nickname is required');
  if (!body.mimeType) return err('mimeType is required');
  if (!body.fileSize) return err('fileSize is required');

  if (!(ALLOWED_VIDEO_MIMES as readonly string[]).includes(body.mimeType)) {
    return err(`mimeType not allowed: ${body.mimeType}`);
  }

  const maxBytes = maxLargeVideoSizeBytes(c.env);
  if (body.fileSize > maxBytes) {
    return err(`File too large (max ${Math.round(maxBytes / 1024 / 1024)}MB)`);
  }

  const now = nowSec();
  const eventMode = resolveEventMode(room, now);
  if (eventMode !== 'archive') {
    return err('Video upload is not available in current room mode', 403);
  }

  const postId = uuid();
  const ext = getExtFromMime(body.mimeType);
  const fileKey = `${roomId}/videos/${postId}.${ext}`;

  await c.env.DB.prepare(
    `INSERT INTO posts (id, room_id, nickname, file_key, file_type, mime_type, file_size, status, upload_status, post_purpose, participant_id, created_at)
     VALUES (?, ?, ?, ?, 'video', ?, ?, 'visible', 'pending', 'video', NULL, ?)`
  )
    .bind(postId, roomId, body.nickname.trim(), fileKey, body.mimeType, body.fileSize, now)
    .run();

  let uploadId: string;
  try {
    uploadId = await createMultipartUpload(c.env, fileKey, body.mimeType);
  } catch (e) {
    console.error('Failed to create R2 multipart upload', { roomId, postId, fileKey, error: e });
    await c.env.DB.prepare("UPDATE posts SET upload_status = 'failed' WHERE id = ?").bind(postId).run();
    return err('Failed to start multipart upload', 500);
  }

  return c.json({ uploadId, fileKey, postId }, 201);
});

// Returns a presigned PUT URL for a single part. The part body goes browser -> R2
// directly; the Worker never receives it.
multipart.post('/part-url', async (c) => {
  const { roomId } = c.req.param() as ParamRoomId;
  const roomResult = await getRoomAndValidate(c.env.DB, roomId);
  if ('error' in roomResult) return err(roomResult.error, roomResult.status);

  if (!envSupportsMultipart(c.env)) return s3ConfigError(c.env);

  const body = await c.req.json<{
    postId?: string;
    fileKey?: string;
    uploadId?: string;
    partNumber?: number;
  }>();

  if (!body.postId || !body.fileKey || !body.uploadId || !body.partNumber) {
    return err('postId, fileKey, uploadId, partNumber are required');
  }
  if (!Number.isInteger(body.partNumber) || body.partNumber < 1) {
    return err('partNumber must be a positive integer');
  }

  const post = await getPost(c.env.DB, body.postId);
  if (!post || post.room_id !== roomId) return err('Post not found', 404);
  if (post.file_key !== body.fileKey) return err('fileKey does not match post', 403);
  if (post.upload_status !== 'pending') return err('Post is not pending', 409);

  const expirySeconds = parseInt(c.env.SIGNED_URL_EXPIRY_UPLOAD ?? '900', 10);

  let uploadUrl: string;
  try {
    uploadUrl = await generatePresignedUploadPartUrl(c.env, body.fileKey, body.uploadId, body.partNumber, expirySeconds);
  } catch (e) {
    console.error('Failed to presign multipart part URL', { roomId, postId: body.postId, partNumber: body.partNumber, error: e });
    return err('Failed to generate part upload URL', 500);
  }

  return c.json({ uploadUrl, partNumber: body.partNumber }, 200);
});

// Completes the R2-side multipart upload only (turns the parts into a single object).
// Does NOT mark the post as uploaded — the frontend calls the existing
// POST /posts/:postId/complete afterward to do that, exactly like normal video upload.
multipart.post('/complete', async (c) => {
  const { roomId } = c.req.param() as ParamRoomId;
  const roomResult = await getRoomAndValidate(c.env.DB, roomId);
  if ('error' in roomResult) return err(roomResult.error, roomResult.status);

  if (!envSupportsMultipart(c.env)) return s3ConfigError(c.env);

  const body = await c.req.json<{
    postId?: string;
    fileKey?: string;
    uploadId?: string;
    parts?: { partNumber: number; etag: string }[];
  }>();

  if (!body.postId || !body.fileKey || !body.uploadId || !body.parts?.length) {
    return err('postId, fileKey, uploadId, parts are required');
  }

  // Defensive check: never forward a part list that's missing, duplicated, or
  // out of sequence to R2 — surface the problem here with a clear error instead.
  const sortedParts = [...body.parts].sort((a, b) => a.partNumber - b.partNumber);
  const seenPartNumbers = new Set<number>();
  for (const p of sortedParts) {
    if (seenPartNumbers.has(p.partNumber)) return err(`Duplicate partNumber: ${p.partNumber}`);
    seenPartNumbers.add(p.partNumber);
    if (!p.etag || !p.etag.trim()) return err(`Missing ETag for partNumber ${p.partNumber}`);
  }
  for (let i = 0; i < sortedParts.length; i++) {
    if (sortedParts[i].partNumber !== i + 1) {
      return err(`Part sequence is not contiguous (expected partNumber ${i + 1}, got ${sortedParts[i].partNumber})`);
    }
  }

  const post = await getPost(c.env.DB, body.postId);
  if (!post || post.room_id !== roomId) return err('Post not found', 404);
  if (post.file_key !== body.fileKey) return err('fileKey does not match post', 403);
  if (post.upload_status !== 'pending') return err('Post is not pending', 409);

  try {
    await completeMultipartUpload(c.env, body.fileKey, body.uploadId, sortedParts);
  } catch (e) {
    console.error('Failed to complete R2 multipart upload', { roomId, postId: body.postId, error: e });
    return err('Failed to complete multipart upload', 500);
  }

  return c.json({ ok: true });
});

// Aborts the R2-side multipart upload and marks the pending post as failed so it
// doesn't linger. Called on user cancel or on unrecoverable part failure.
multipart.post('/abort', async (c) => {
  const { roomId } = c.req.param() as ParamRoomId;
  const roomResult = await getRoomAndValidate(c.env.DB, roomId);
  if ('error' in roomResult) return err(roomResult.error, roomResult.status);

  const body = await c.req.json<{
    postId?: string;
    fileKey?: string;
    uploadId?: string;
  }>();

  if (!body.postId || !body.fileKey || !body.uploadId) {
    return err('postId, fileKey, uploadId are required');
  }

  const post = await getPost(c.env.DB, body.postId);
  if (!post || post.room_id !== roomId) return err('Post not found', 404);
  if (post.file_key !== body.fileKey) return err('fileKey does not match post', 403);

  if (envSupportsMultipart(c.env)) {
    try {
      await abortMultipartUpload(c.env, body.fileKey, body.uploadId);
    } catch (e) {
      console.error('Failed to abort R2 multipart upload', { roomId, postId: body.postId, error: e });
      // Continue: still mark the post failed below so it doesn't linger as pending.
    }
  }

  if (post.upload_status === 'pending') {
    await c.env.DB.prepare("UPDATE posts SET upload_status = 'failed' WHERE id = ?").bind(body.postId).run();
  }

  return c.json({ ok: true });
});

export default multipart;

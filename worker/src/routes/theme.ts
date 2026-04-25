import { Hono } from 'hono';
import type { Env } from '../types';
import { ALLOWED_IMAGE_MIMES, MAX_IMAGE_SIZE } from '../types';
import { uuid, nowSec, err, getExtFromMime } from '../utils';
import { getRoomAndValidate, validateHostToken } from '../db';
import { generatePresignedPutUrl, generatePresignedGetUrl, r2SupportsPresignedPut } from '../r2';
import { createUploadBodyToken, createViewFileToken } from '../uploadBodyToken';

type ParamRoomId = { roomId: string };

interface ThemeRow {
  room_id: string;
  title: string | null;
  message: string | null;
  main_visual_key: string | null;
  background_image_key: string | null;
  theme_color: string | null;
  animation_mode: string;
  updated_at: number;
}

const ALLOWED_ANIMATION_MODES = ['none', 'fade', 'float'] as const;

function rowToResponse(row: ThemeRow) {
  return {
    title: row.title,
    message: row.message,
    mainVisualKey: row.main_visual_key,
    backgroundImageKey: row.background_image_key,
    themeColor: row.theme_color,
    animationMode: row.animation_mode,
  };
}

const theme = new Hono<{ Bindings: Env }>();

theme.get('/', async (c) => {
  const { roomId } = c.req.param() as ParamRoomId;
  const roomResult = await getRoomAndValidate(c.env.DB, roomId);
  if ('error' in roomResult) return err(roomResult.error, roomResult.status);

  const row = await c.env.DB.prepare(
    'SELECT * FROM theme_settings WHERE room_id = ?'
  )
    .bind(roomId)
    .first<ThemeRow>();

  if (!row) {
    return c.json({
      title: null,
      message: null,
      mainVisualKey: null,
      backgroundImageKey: null,
      themeColor: null,
      animationMode: 'none',
    });
  }

  return c.json(rowToResponse(row));
});

theme.put('/', async (c) => {
  const { roomId } = c.req.param() as ParamRoomId;
  const roomResult = await getRoomAndValidate(c.env.DB, roomId);
  if ('error' in roomResult) return err(roomResult.error, roomResult.status);
  const { room } = roomResult;

  if (!validateHostToken(room, c.req.header('X-Host-Token'))) {
    return err('Unauthorized', 401);
  }

  const body = await c.req.json<{
    title?: string | null;
    message?: string | null;
    mainVisualKey?: string | null;
    backgroundImageKey?: string | null;
    themeColor?: string | null;
    animationMode?: string;
  }>();

  const animationMode = body.animationMode ?? 'none';
  if (!(ALLOWED_ANIMATION_MODES as readonly string[]).includes(animationMode)) {
    return err(`animationMode must be one of: ${ALLOWED_ANIMATION_MODES.join(', ')}`);
  }

  const now = nowSec();
  await c.env.DB.prepare(
    `INSERT INTO theme_settings (room_id, title, message, main_visual_key, background_image_key, theme_color, animation_mode, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(room_id) DO UPDATE SET
       title = excluded.title,
       message = excluded.message,
       main_visual_key = excluded.main_visual_key,
       background_image_key = excluded.background_image_key,
       theme_color = excluded.theme_color,
       animation_mode = excluded.animation_mode,
       updated_at = excluded.updated_at`
  )
    .bind(
      roomId,
      body.title ?? null,
      body.message ?? null,
      body.mainVisualKey ?? null,
      body.backgroundImageKey ?? null,
      body.themeColor ?? null,
      animationMode,
      now
    )
    .run();

  return c.json({
    title: body.title ?? null,
    message: body.message ?? null,
    mainVisualKey: body.mainVisualKey ?? null,
    backgroundImageKey: body.backgroundImageKey ?? null,
    themeColor: body.themeColor ?? null,
    animationMode,
  });
});

theme.post('/upload-url', async (c) => {
  const { roomId } = c.req.param() as ParamRoomId;
  const roomResult = await getRoomAndValidate(c.env.DB, roomId);
  if ('error' in roomResult) return err(roomResult.error, roomResult.status);
  const { room } = roomResult;

  if (!validateHostToken(room, c.req.header('X-Host-Token'))) {
    return err('Unauthorized', 401);
  }

  const body = await c.req.json<{
    imageType?: string;
    mimeType?: string;
    fileSize?: number;
  }>();

  if (!body.imageType || !['main_visual', 'background'].includes(body.imageType)) {
    return err('imageType must be main_visual or background');
  }
  if (!body.mimeType) return err('mimeType is required');
  if (!body.fileSize) return err('fileSize is required');

  if (!(ALLOWED_IMAGE_MIMES as readonly string[]).includes(body.mimeType)) {
    return err(`mimeType not allowed: ${body.mimeType}`);
  }
  if (body.fileSize > MAX_IMAGE_SIZE) {
    return err('File too large (max 20MB)');
  }

  const fileId = uuid();
  const ext = getExtFromMime(body.mimeType);
  const fileKey = `${roomId}/theme/${body.imageType}/${fileId}.${ext}`;
  const expirySeconds = parseInt(c.env.SIGNED_URL_EXPIRY_UPLOAD ?? '900', 10);
  const now = nowSec();

  let uploadUrl: string;
  if (r2SupportsPresignedPut(c.env.STORAGE)) {
    try {
      uploadUrl = await generatePresignedPutUrl(c.env.STORAGE, fileKey, body.mimeType, expirySeconds);
    } catch (_e) {
      return err('Failed to generate upload URL', 500);
    }
  } else {
    const secret = c.env.UPLOAD_BODY_SIGNING_SECRET;
    if (!secret) return err('UPLOAD_BODY_SIGNING_SECRET is required for local upload proxy', 500);
    const token = await createUploadBodyToken(secret, {
      postId: fileId,
      roomId,
      fileKey,
      mimeType: body.mimeType,
      exp: now + expirySeconds,
    });
    uploadUrl = `/api/rooms/${roomId}/posts/${fileId}/upload-body?token=${encodeURIComponent(token)}`;
  }

  return c.json({ uploadUrl, fileKey }, 201);
});

theme.post('/view-urls', async (c) => {
  const { roomId } = c.req.param() as ParamRoomId;
  const roomResult = await getRoomAndValidate(c.env.DB, roomId);
  if ('error' in roomResult) return err(roomResult.error, roomResult.status);

  const row = await c.env.DB.prepare(
    'SELECT * FROM theme_settings WHERE room_id = ?'
  )
    .bind(roomId)
    .first<ThemeRow>();

  if (!row) return c.json({ viewUrls: {} });

  const expirySeconds = parseInt(c.env.SIGNED_URL_EXPIRY_VIEW ?? '3600', 10);
  const usePresigned = r2SupportsPresignedPut(c.env.STORAGE);
  const proxySecret = c.env.UPLOAD_BODY_SIGNING_SECRET;
  const now = nowSec();
  const exp = now + expirySeconds;

  const viewUrls: Record<string, string> = {};

  async function resolveKey(key: string | null, label: string) {
    if (!key) return;
    try {
      if (usePresigned) {
        viewUrls[label] = await generatePresignedGetUrl(c.env.STORAGE, key, expirySeconds);
      } else if (proxySecret) {
        const token = await createViewFileToken(proxySecret, {
          postId: label,
          roomId,
          fileKey: key,
          exp,
        });
        viewUrls[label] = `/api/rooms/${roomId}/theme/view-file/${label}?token=${encodeURIComponent(token)}`;
      }
    } catch (_e) { /* skip */ }
  }

  await Promise.all([
    resolveKey(row.main_visual_key, 'mainVisual'),
    resolveKey(row.background_image_key, 'background'),
  ]);

  return c.json({ viewUrls, expiresAt: exp });
});

theme.get('/view-file/:imageType', async (c) => {
  const { roomId, imageType } = c.req.param() as { roomId: string; imageType: string };
  const token = c.req.query('token');
  if (!token) return err('token is required', 400);

  const secret = c.env.UPLOAD_BODY_SIGNING_SECRET;
  if (!secret) return err('View proxy not configured', 501);

  const { verifyViewFileToken } = await import('../uploadBodyToken');
  const payload = await verifyViewFileToken(secret, token);
  if (!payload || payload.postId !== imageType || payload.roomId !== roomId) {
    return err('Invalid or expired token', 403);
  }

  const roomResult = await getRoomAndValidate(c.env.DB, roomId);
  if ('error' in roomResult) return err(roomResult.error, roomResult.status);

  const obj = await c.env.STORAGE.get(payload.fileKey);
  if (!obj) return err('Object not found', 404);

  const contentType = obj.httpMetadata?.contentType ?? 'application/octet-stream';
  return new Response(obj.body, {
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'private, max-age=300',
    },
  });
});

export default theme;

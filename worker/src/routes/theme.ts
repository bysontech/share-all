import { Hono } from 'hono';
import type { Env } from '../types';
import { ALLOWED_IMAGE_MIMES, MAX_IMAGE_SIZE } from '../types';
import { uuid, nowSec, err, getExtFromMime } from '../utils';
import { getRoomAndValidate } from '../db';
import { authorizeRoomManage } from '../roomManageAuth';
import { generatePresignedPutUrl, generatePresignedGetUrl, envSupportsPresignedPut, envSupportsPresignedGet, resolvePresignTarget } from '../r2';
import { createUploadBodyToken, createViewFileToken } from '../uploadBodyToken';
import { buildCdnCgiImageUrl } from '../image-transformations';

type ParamRoomId = { roomId: string };

interface ThemeRow {
  room_id: string;
  title: string | null;
  message: string | null;
  main_visual_key: string | null;
  main_visual_display_key: string | null;
  main_visual_display_mime_type: string | null;
  background_image_key: string | null;
  background_display_image_key: string | null;
  background_display_mime_type: string | null;
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
    mainVisualDisplayKey: row.main_visual_display_key,
    mainVisualDisplayMimeType: row.main_visual_display_mime_type,
    backgroundImageKey: row.background_image_key,
    backgroundDisplayImageKey: row.background_display_image_key,
    backgroundDisplayMimeType: row.background_display_mime_type,
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
      mainVisualDisplayKey: null,
      mainVisualDisplayMimeType: null,
      backgroundImageKey: null,
      backgroundDisplayImageKey: null,
      backgroundDisplayMimeType: null,
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

  if (!(await authorizeRoomManage(c.env, room, c.req.header('X-Host-Token'), c.req.header('Cookie')))) {
    return err('Unauthorized', 401);
  }

  const body = await c.req.json<{
    title?: string | null;
    message?: string | null;
    mainVisualKey?: string | null;
    mainVisualDisplayKey?: string | null;
    mainVisualDisplayMimeType?: string | null;
    backgroundImageKey?: string | null;
    backgroundDisplayImageKey?: string | null;
    backgroundDisplayMimeType?: string | null;
    themeColor?: string | null;
    animationMode?: string;
  }>();

  const animationMode = body.animationMode ?? 'none';
  if (!(ALLOWED_ANIMATION_MODES as readonly string[]).includes(animationMode)) {
    return err(`animationMode must be one of: ${ALLOWED_ANIMATION_MODES.join(', ')}`);
  }

  const now = nowSec();
  await c.env.DB.prepare(
    `INSERT INTO theme_settings (room_id, title, message, main_visual_key, main_visual_display_key, main_visual_display_mime_type, background_image_key, background_display_image_key, background_display_mime_type, theme_color, animation_mode, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(room_id) DO UPDATE SET
       title = excluded.title,
       message = excluded.message,
       main_visual_key = excluded.main_visual_key,
       main_visual_display_key = excluded.main_visual_display_key,
       main_visual_display_mime_type = excluded.main_visual_display_mime_type,
       background_image_key = excluded.background_image_key,
       background_display_image_key = excluded.background_display_image_key,
       background_display_mime_type = excluded.background_display_mime_type,
       theme_color = excluded.theme_color,
       animation_mode = excluded.animation_mode,
       updated_at = excluded.updated_at`
  )
    .bind(
      roomId,
      body.title ?? null,
      body.message ?? null,
      body.mainVisualKey ?? null,
      body.mainVisualDisplayKey ?? null,
      body.mainVisualDisplayMimeType ?? null,
      body.backgroundImageKey ?? null,
      body.backgroundDisplayImageKey ?? null,
      body.backgroundDisplayMimeType ?? null,
      body.themeColor ?? null,
      animationMode,
      now
    )
    .run();

  return c.json({
    title: body.title ?? null,
    message: body.message ?? null,
    mainVisualKey: body.mainVisualKey ?? null,
    mainVisualDisplayKey: body.mainVisualDisplayKey ?? null,
    mainVisualDisplayMimeType: body.mainVisualDisplayMimeType ?? null,
    backgroundImageKey: body.backgroundImageKey ?? null,
    backgroundDisplayImageKey: body.backgroundDisplayImageKey ?? null,
    backgroundDisplayMimeType: body.backgroundDisplayMimeType ?? null,
    themeColor: body.themeColor ?? null,
    animationMode,
  });
});

theme.post('/upload-url', async (c) => {
  const { roomId } = c.req.param() as ParamRoomId;
  const roomResult = await getRoomAndValidate(c.env.DB, roomId);
  if ('error' in roomResult) return err(roomResult.error, roomResult.status);
  const { room } = roomResult;

  if (!(await authorizeRoomManage(c.env, room, c.req.header('X-Host-Token'), c.req.header('Cookie')))) {
    return err('Unauthorized', 401);
  }

  const body = await c.req.json<{
    imageType?: string;
    mimeType?: string;
    fileSize?: number;
  }>();

  if (!body.imageType || !['main_visual', 'main_visual_display', 'background', 'background_display'].includes(body.imageType)) {
    return err('imageType must be main_visual, main_visual_display, background, or background_display');
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
  const folderMap: Record<string, string> = {
    main_visual: 'main_visual',
    main_visual_display: 'main-visual-display',
    background: 'background',
    background_display: 'background-display',
  };
  const folderName = folderMap[body.imageType] ?? body.imageType;
  const fileKey = `${roomId}/theme/${folderName}/${fileId}.${ext}`;
  const expirySeconds = parseInt(c.env.SIGNED_URL_EXPIRY_UPLOAD ?? '900', 10);
  const now = nowSec();

  let uploadUrl: string;
  if (envSupportsPresignedPut(c.env)) {
    try {
      uploadUrl = await generatePresignedPutUrl(c.env, fileKey, body.mimeType, expirySeconds);
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
    uploadUrl = `/api/rooms/${roomId}/theme/upload-body/${fileId}?token=${encodeURIComponent(token)}`;
  }

  return c.json({ uploadUrl, fileKey }, 201);
});

theme.put('/upload-body/:fileId', async (c) => {
  const { roomId, fileId } = c.req.param() as { roomId: string; fileId: string };
  const token = c.req.query('token');
  if (!token) return err('token is required', 400);

  const secret = c.env.UPLOAD_BODY_SIGNING_SECRET;
  if (!secret) return err('Upload proxy not configured', 501);

  const { verifyUploadBodyToken } = await import('../uploadBodyToken');
  const payload = await verifyUploadBodyToken(secret, token);
  if (!payload || payload.postId !== fileId || payload.roomId !== roomId) {
    return err('Invalid or expired token', 403);
  }

  const roomResult = await getRoomAndValidate(c.env.DB, roomId);
  if ('error' in roomResult) return err(roomResult.error, roomResult.status);

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
    console.error('Theme upload-body proxy failed', { fileKey: payload.fileKey, error: e });
    return err('Storage upload failed', 500);
  }

  return new Response(null, { status: 204 });
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
  const usePresigned = envSupportsPresignedGet(c.env);
  const proxySecret = c.env.UPLOAD_BODY_SIGNING_SECRET;
  const now = nowSec();
  const exp = now + expirySeconds;

  const viewUrls: Record<string, string> = {};

  async function resolveKey(key: string | null, label: string) {
    if (!key) return;
    try {
      if (usePresigned) {
        viewUrls[label] = await generatePresignedGetUrl(resolvePresignTarget(c.env), key, expirySeconds);
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

  // main visual: prefer display key (lighter), fallback to original
  const mainVisualSourceKey = row.main_visual_display_key ?? row.main_visual_key;
  await Promise.all([
    resolveKey(mainVisualSourceKey, 'mainVisual'),
    resolveKey(row.background_image_key, 'background'),
  ]);

  // Priority 1: pre-generated display key in R2
  if (row.background_display_image_key) {
    await resolveKey(row.background_display_image_key, 'backgroundDisplay');
  } else {
    // Priority 2: Image Transformations on-the-fly (migration fallback for existing rooms)
    const transformOrigin = c.env.IMAGE_TRANSFORMATIONS_ORIGIN?.trim();
    if (viewUrls['background'] && transformOrigin) {
      let bgAbsUrl = viewUrls['background'];
      if (bgAbsUrl.startsWith('/')) {
        bgAbsUrl = `${transformOrigin.replace(/\/$/, '')}${bgAbsUrl}`;
      }
      viewUrls['backgroundDisplay'] = buildCdnCgiImageUrl(transformOrigin, bgAbsUrl, {
        width: 1920,
        quality: 75,
      });
    }
  }

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

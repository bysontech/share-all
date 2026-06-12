import { Hono } from 'hono';
import type { Env } from '../types';
import { uuid, nowSec, err, ROOM_EXPIRES_AT_PLACEHOLDER_SEC } from '../utils';
import { getRoomAndValidate } from '../db';
import { authorizeRoomManage } from '../roomManageAuth';
import { generatePresignedGetUrl, r2SupportsPresignedPut } from '../r2';
import { createViewFileToken } from '../uploadBodyToken';
import { buildCdnCgiImageUrl } from '../image-transformations';
import { resolveEventMode, computeNextTransitionAt } from '../eventMode';

type ParamRoomId = { roomId: string };

const VALID_EVENT_MODES = new Set(['draft', 'event_live', 'archive']);

const rooms = new Hono<{ Bindings: Env }>();

rooms.post('/', async (c) => {
  const body = await c.req.json<{ name?: string; passcode?: string; description?: string }>();
  if (!body.name || body.name.trim() === '') {
    return err('name is required');
  }

  const roomId = uuid();
  const hostToken = uuid();
  const now = nowSec();

  await c.env.DB.prepare(
    'INSERT INTO rooms (id, name, passcode, host_token, description, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  )
    .bind(
      roomId,
      body.name.trim(),
      body.passcode ?? null,
      hostToken,
      body.description ?? null,
      ROOM_EXPIRES_AT_PLACEHOLDER_SEC,
      now
    )
    .run();

  await c.env.DB.prepare(
    'INSERT INTO slideshow_settings (room_id, interval_seconds, show_nickname, order_mode, updated_at) VALUES (?, 5, 1, ?, ?)'
  )
    .bind(roomId, 'asc', now)
    .run();

  const frontendUrl = c.env.FRONTEND_URL ?? '';
  const participantUrl = `${frontendUrl}/room/${roomId}`;

  return c.json({ roomId, hostToken, participantUrl }, 201);
});

// Bootstrap: room + theme + event mode + signed background/mainvisual URLs in one request
rooms.get('/:roomId/bootstrap', async (c) => {
  const { roomId } = c.req.param() as ParamRoomId;
  const result = await getRoomAndValidate(c.env.DB, roomId);
  if ('error' in result) return err(result.error, result.status);
  const { room } = result;

  type ThemeRow = {
    title: string | null; message: string | null;
    main_visual_key: string | null;
    main_visual_display_key: string | null;
    background_image_key: string | null;
    background_display_image_key: string | null;
    theme_color: string | null; animation_mode: string;
  };
  const themeRow = await c.env.DB.prepare(
    'SELECT title, message, main_visual_key, main_visual_display_key, background_image_key, background_display_image_key, theme_color, animation_mode FROM theme_settings WHERE room_id = ?'
  ).bind(roomId).first<ThemeRow>();

  const expirySeconds = parseInt(c.env.SIGNED_URL_EXPIRY_VIEW ?? '3600', 10);
  const usePresigned = r2SupportsPresignedPut(c.env.STORAGE);
  const proxySecret = c.env.UPLOAD_BODY_SIGNING_SECRET;
  const now = nowSec();
  const exp = now + expirySeconds;
  const transformOrigin = c.env.IMAGE_TRANSFORMATIONS_ORIGIN?.trim();

  async function signKey(fileKey: string, label: string): Promise<string | null> {
    try {
      if (usePresigned) return await generatePresignedGetUrl(c.env.STORAGE, fileKey, expirySeconds);
      if (proxySecret) {
        const token = await createViewFileToken(proxySecret, { postId: label, roomId, fileKey, exp });
        return `/api/rooms/${roomId}/theme/view-file/${label}?token=${encodeURIComponent(token)}`;
      }
    } catch (_e) { /* skip */ }
    return null;
  }

  let mainVisualUrl: string | null = null;
  let backgroundDisplayUrl: string | null = null;

  if (themeRow) {
    // Prefer display key (lighter) for main visual, fall back to original
    const mainVisualSourceKey = themeRow.main_visual_display_key ?? themeRow.main_visual_key;
    if (mainVisualSourceKey) {
      mainVisualUrl = await signKey(mainVisualSourceKey, 'mainVisual');
    }

    if (themeRow.background_display_image_key) {
      backgroundDisplayUrl = await signKey(themeRow.background_display_image_key, 'backgroundDisplay');
    } else if (themeRow.background_image_key && transformOrigin && proxySecret) {
      const bgUrl = await signKey(themeRow.background_image_key, 'background');
      if (bgUrl) {
        let bgAbsUrl = bgUrl;
        if (bgAbsUrl.startsWith('/')) bgAbsUrl = `${transformOrigin.replace(/\/$/, '')}${bgAbsUrl}`;
        backgroundDisplayUrl = buildCdnCgiImageUrl(transformOrigin, bgAbsUrl, { width: 1920, quality: 75 });
      }
    }
  }

  const eventMode = resolveEventMode(room, now);
  const nextTransitionAt = computeNextTransitionAt(room, now);

  return c.json({
    room: {
      roomId: room.id,
      name: room.name,
      hasPasscode: !!room.passcode,
      description: room.description,
    },
    theme: {
      title: themeRow?.title ?? null,
      message: themeRow?.message ?? null,
      themeColor: themeRow?.theme_color ?? null,
      animationMode: themeRow?.animation_mode ?? 'none',
      mainVisualUrl,
      backgroundDisplayUrl,
    },
    eventMode,
    nextTransitionAt,
  });
});

rooms.get('/:roomId', async (c) => {
  const { roomId } = c.req.param() as ParamRoomId;
  const result = await getRoomAndValidate(c.env.DB, roomId);
  if ('error' in result) return err(result.error, result.status);
  const { room } = result;

  return c.json({
    roomId: room.id,
    name: room.name,
    hasPasscode: !!room.passcode,
    description: room.description,
  });
});

rooms.get('/:roomId/slideshow-settings', async (c) => {
  const { roomId } = c.req.param() as ParamRoomId;
  const result = await getRoomAndValidate(c.env.DB, roomId);
  if ('error' in result) return err(result.error, result.status);

  type Row = { room_id: string; interval_seconds: number; show_nickname: number; order_mode: string; updated_at: number };
  const settings = await c.env.DB.prepare(
    'SELECT * FROM slideshow_settings WHERE room_id = ?'
  )
    .bind(roomId)
    .first<Row>();

  if (!settings) {
    return c.json({ intervalSeconds: 5, showNickname: true, orderMode: 'asc' });
  }

  return c.json({
    intervalSeconds: settings.interval_seconds,
    showNickname: settings.show_nickname === 1,
    orderMode: settings.order_mode,
  });
});

rooms.put('/:roomId/slideshow-settings', async (c) => {
  const { roomId } = c.req.param() as ParamRoomId;
  const result = await getRoomAndValidate(c.env.DB, roomId);
  if ('error' in result) return err(result.error, result.status);
  const { room } = result;

  if (!(await authorizeRoomManage(c.env, room, c.req.header('X-Host-Token'), c.req.header('Cookie')))) {
    return err('Unauthorized', 401);
  }

  const body = await c.req.json<{
    intervalSeconds?: number;
    showNickname?: boolean;
    orderMode?: string;
  }>();

  const intervalSeconds = body.intervalSeconds ?? 5;
  const showNickname = body.showNickname ?? true;
  const orderMode = body.orderMode ?? 'asc';

  if (typeof intervalSeconds !== 'number' || intervalSeconds < 1 || intervalSeconds > 60) {
    return err('intervalSeconds must be between 1 and 60');
  }
  if (!['asc', 'desc'].includes(orderMode)) {
    return err('orderMode must be asc or desc');
  }

  const now = nowSec();
  await c.env.DB.prepare(
    `INSERT INTO slideshow_settings (room_id, interval_seconds, show_nickname, order_mode, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(room_id) DO UPDATE SET
       interval_seconds = excluded.interval_seconds,
       show_nickname = excluded.show_nickname,
       order_mode = excluded.order_mode,
       updated_at = excluded.updated_at`
  )
    .bind(roomId, intervalSeconds, showNickname ? 1 : 0, orderMode, now)
    .run();

  return c.json({ intervalSeconds, showNickname, orderMode });
});

// GET event mode settings (public — needed by participant page via bootstrap, admin page uses this)
rooms.get('/:roomId/event-mode', async (c) => {
  const { roomId } = c.req.param() as ParamRoomId;
  const result = await getRoomAndValidate(c.env.DB, roomId);
  if ('error' in result) return err(result.error, result.status);
  const { room } = result;

  const now = nowSec();
  const eventMode = resolveEventMode(room, now);
  const nextTransitionAt = computeNextTransitionAt(room, now);

  return c.json({
    eventMode,
    manualMode: room.event_mode,
    slideshowOpenAt: room.slideshow_open_at,
    slideshowCloseAt: room.slideshow_close_at,
    galleryOpenAt: room.gallery_open_at,
    videoOpenAt: room.video_open_at,
    nextTransitionAt,
  });
});

// PUT event mode settings (requires host token or admin session)
rooms.put('/:roomId/event-mode', async (c) => {
  const { roomId } = c.req.param() as ParamRoomId;
  const result = await getRoomAndValidate(c.env.DB, roomId);
  if ('error' in result) return err(result.error, result.status);
  const { room } = result;

  if (!(await authorizeRoomManage(c.env, room, c.req.header('X-Host-Token'), c.req.header('Cookie')))) {
    return err('Unauthorized', 401);
  }

  const body = await c.req.json<{
    manualMode?: string | null;
    slideshowOpenAt?: number | null;
    slideshowCloseAt?: number | null;
    galleryOpenAt?: number | null;
    videoOpenAt?: number | null;
  }>();

  const manualMode = body.manualMode ?? null;
  if (manualMode !== null && !VALID_EVENT_MODES.has(manualMode)) {
    return err('manualMode must be draft, event_live, archive, or null');
  }

  const slideshowOpenAt = body.slideshowOpenAt ?? null;
  const slideshowCloseAt = body.slideshowCloseAt ?? null;
  const galleryOpenAt = body.galleryOpenAt ?? null;
  const videoOpenAt = body.videoOpenAt ?? null;

  await c.env.DB.prepare(
    `UPDATE rooms SET
       event_mode = ?,
       slideshow_open_at = ?,
       slideshow_close_at = ?,
       gallery_open_at = ?,
       video_open_at = ?
     WHERE id = ?`
  )
    .bind(manualMode, slideshowOpenAt, slideshowCloseAt, galleryOpenAt, videoOpenAt, roomId)
    .run();

  // Re-fetch to return fresh resolved state
  const updated = { ...room, event_mode: manualMode, slideshow_open_at: slideshowOpenAt, slideshow_close_at: slideshowCloseAt, gallery_open_at: galleryOpenAt, video_open_at: videoOpenAt };
  const now = nowSec();
  const eventMode = resolveEventMode(updated, now);
  const nextTransitionAt = computeNextTransitionAt(updated, now);

  return c.json({
    eventMode,
    manualMode,
    slideshowOpenAt,
    slideshowCloseAt,
    galleryOpenAt,
    videoOpenAt,
    nextTransitionAt,
  });
});

export default rooms;

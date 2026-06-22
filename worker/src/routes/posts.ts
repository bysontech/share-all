import { Hono } from 'hono';
import type { Env } from '../types';
import { ALLOWED_IMAGE_MIMES, ALLOWED_VIDEO_MIMES, MAX_IMAGE_SIZE, MAX_VIDEO_SIZE } from '../types';
import { uuid, nowSec, err, getExtFromMime } from '../utils';
import { getRoomAndValidate, getPost } from '../db';
import { authorizeRoomManage } from '../roomManageAuth';
import {
  generatePresignedPutUrl,
  generatePresignedGetUrl,
  envSupportsPresignedPut,
  requiresDirectR2Upload,
} from '../r2';
import { buildCdnCgiImageUrl } from '../image-transformations';
import { resolveEventMode } from '../eventMode';
import {
  createUploadBodyToken,
  verifyUploadBodyToken,
  createViewFileToken,
  verifyViewFileToken,
} from '../uploadBodyToken';

type ParamRoomId = { roomId: string };
type ParamPost = { roomId: string; postId: string };

function isHeicFamilyMime(mime: string | null | undefined): boolean {
  const m = (mime ?? '').toLowerCase();
  return m === 'image/heic' || m === 'image/heif';
}

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
    uploadType?: 'original' | 'display' | 'thumbnail';
    postId?: string;
    postPurpose?: 'slideshow' | 'album' | 'video';
    participantId?: string;
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

    if (envSupportsPresignedPut(c.env)) {
      try {
        uploadUrl = await generatePresignedPutUrl(c.env, fileKey, 'image/webp', expirySeconds);
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

  // Thumbnail upload: signs a URL for {roomId}/thumbnails/{postId}.{ext}
  if (body.uploadType === 'thumbnail') {
    if (!body.postId) return err('postId is required for thumbnail uploads');
    if (!['image/webp', 'image/jpeg'].includes(body.mimeType)) return err('thumbnail uploads must be image/webp or image/jpeg');
    if (body.fileSize > MAX_IMAGE_SIZE) return err('File too large (max 20MB)');

    const post = await getPost(c.env.DB, body.postId);
    if (!post || post.room_id !== roomId) return err('Post not found', 404);

    const ext = body.mimeType === 'image/jpeg' ? 'jpg' : 'webp';
    const fileKey = `${roomId}/thumbnails/${body.postId}.${ext}`;
    let uploadUrl: string;

    if (envSupportsPresignedPut(c.env)) {
      try {
        uploadUrl = await generatePresignedPutUrl(c.env, fileKey, body.mimeType, expirySeconds);
      } catch (e) {
        console.error('Failed to generate presigned thumbnail upload URL', { roomId, postId: body.postId, error: e });
        return err('Failed to generate upload URL', 500);
      }
    } else {
      const secret = c.env.UPLOAD_BODY_SIGNING_SECRET;
      if (!secret) return err('UPLOAD_BODY_SIGNING_SECRET is required for local upload proxy', 500);
      const exp = now + expirySeconds;
      const token = await createUploadBodyToken(secret, { postId: body.postId, roomId, fileKey, mimeType: body.mimeType, exp });
      uploadUrl = `/api/rooms/${roomId}/posts/${body.postId}/upload-display?token=${encodeURIComponent(token)}`;
    }

    return c.json({ uploadUrl, fileKey, postId: body.postId }, 200);
  }

  // Original upload (image or video)
  if (!body.nickname || body.nickname.trim() === '') return err('nickname is required');

  const isVideo = (ALLOWED_VIDEO_MIMES as readonly string[]).includes(body.mimeType);
  const isImage = (ALLOWED_IMAGE_MIMES as readonly string[]).includes(body.mimeType);
  if (!isImage && !isVideo) return err(`mimeType not allowed: ${body.mimeType}`);

  const maxSize = isVideo ? MAX_VIDEO_SIZE : MAX_IMAGE_SIZE;
  if (body.fileSize > maxSize) return err(`File too large (max ${maxSize / 1024 / 1024}MB)`);

  if (requiresDirectR2Upload(body.fileSize, isVideo) && !envSupportsPresignedPut(c.env)) {
    return err(
      '動画・大容量ファイルのアップロードには R2 直接アップロード設定が必要です。Worker に R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY を secret として設定してください。',
      503
    );
  }

  const fileType = isVideo ? 'video' : 'image';

  // Determine post_purpose: videos are always 'video', images default to 'album'
  const postPurpose: 'slideshow' | 'album' | 'video' = isVideo ? 'video'
    : body.postPurpose === 'slideshow' ? 'slideshow'
    : 'album';

  // Event mode enforcement (server-side — UI alone is not sufficient)
  const { room } = roomResult;
  const eventMode = resolveEventMode(room, now);
  if (postPurpose === 'slideshow' && eventMode !== 'event_live') {
    return err('Slideshow upload is not available in current room mode', 403);
  }
  if ((postPurpose === 'album' || postPurpose === 'video') && eventMode !== 'archive') {
    return err('Photo/video upload is not available in current room mode', 403);
  }

  // Enforce 10-image slideshow limit per participant
  let slideshowParticipantId: string | null = null;
  if (postPurpose === 'slideshow') {
    if (!body.participantId) return err('participantId is required for slideshow uploads');
    slideshowParticipantId = body.participantId;
    const cntRow = await c.env.DB.prepare(
      `SELECT COUNT(*) as cnt FROM posts WHERE room_id = ? AND participant_id = ? AND post_purpose = 'slideshow' AND upload_status != 'failed'`
    ).bind(roomId, slideshowParticipantId).first<{ cnt: number }>();
    if ((cntRow?.cnt ?? 0) >= 10) return err('Slideshow limit reached (max 10 per participant)', 409);
  }

  const postId = uuid();
  const ext = getExtFromMime(body.mimeType);
  const fileKey = `${roomId}/images/${postId}.${ext}`;

  await c.env.DB.prepare(
    `INSERT INTO posts (id, room_id, nickname, file_key, file_type, mime_type, file_size, status, upload_status, post_purpose, participant_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'visible', 'pending', ?, ?, ?)`
  )
    .bind(postId, roomId, body.nickname.trim(), fileKey, fileType, body.mimeType, body.fileSize, postPurpose, slideshowParticipantId, now)
    .run();

  let uploadUrl: string;
  if (envSupportsPresignedPut(c.env)) {
    try {
      uploadUrl = await generatePresignedPutUrl(c.env, fileKey, body.mimeType, expirySeconds);
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
    const limit = post.file_type === 'video' ? MAX_VIDEO_SIZE : MAX_IMAGE_SIZE;
    if (!Number.isFinite(n) || n > limit) {
      return err(`File too large (max ${limit / 1024 / 1024}MB)`, 413);
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

  type CompleteBody = {
    participantId?: string;
    displayFileKey?: string;
    displayMimeType?: string;
    thumbnailFileKey?: string;
    thumbnailMimeType?: string;
  };
  let body: CompleteBody = {};
  try { body = await c.req.json<CompleteBody>(); } catch { /* empty body ok */ }

  const now = nowSec();

  // Update post: mark as uploaded, save participant and display key (backward compat)
  await c.env.DB.prepare(
    "UPDATE posts SET upload_status = 'uploaded', uploaded_at = ?, participant_id = ?, display_file_key = ?, display_mime_type = ? WHERE id = ?"
  )
    .bind(now, body.participantId ?? null, body.displayFileKey ?? null, body.displayMimeType ?? null, postId)
    .run();

  // Insert media_derivative for display image if one was generated (R2 WebP)
  if (body.displayFileKey) {
    await c.env.DB.prepare(
      `INSERT INTO media_derivatives (id, post_id, type, file_key, mime_type, status, created_at)
       VALUES (?, ?, 'display_image', ?, ?, 'ready', ?)`
    )
      .bind(uuid(), postId, body.displayFileKey, body.displayMimeType ?? 'image/webp', now)
      .run();
  } else if (isHeicFamilyMime(post.mime_type)) {
    // No R2 display asset: display is via Image Transformations (cdn-cgi) in view-urls, not Images Upload API.
    // Row marks intent for ops / SQL; file_key stays NULL.
    await c.env.DB.prepare(
      `INSERT INTO media_derivatives (id, post_id, type, file_key, mime_type, status, provider, created_at)
       VALUES (?, ?, 'display_image', NULL, ?, 'ready', 'cloudflare_images', ?)`
    )
      .bind(uuid(), postId, post.mime_type, now)
      .run();
  }

  // Register thumbnail derivative (video thumbnail or image thumbnail)
  if (body.thumbnailFileKey) {
    await c.env.DB.prepare(
      `INSERT INTO media_derivatives (id, post_id, type, file_key, mime_type, status, created_at)
       VALUES (?, ?, 'thumbnail', ?, ?, 'ready', ?)`
    )
      .bind(uuid(), postId, body.thumbnailFileKey, body.thumbnailMimeType ?? 'image/webp', now)
      .run();
  }

  // Register slideshow_image derivative only for slideshow-purpose posts.
  // file_key stores the source image (display WebP if present, else original).
  // The actual cdn-cgi URL is built on-demand in view-urls.
  if (post.post_purpose === 'slideshow' && c.env.IMAGE_TRANSFORMATIONS_ORIGIN) {
    const slideshowSourceKey = body.displayFileKey ?? post.file_key;
    await c.env.DB.prepare(
      `INSERT INTO media_derivatives (id, post_id, type, file_key, mime_type, status, created_at, provider)
       VALUES (?, ?, 'slideshow_image', ?, 'image/webp', 'ready', ?, 'cloudflare_images')`
    )
      .bind(uuid(), postId, slideshowSourceKey, now)
      .run();
  }

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
  const requestedLimit = parseInt(c.req.query('limit') ?? '50', 10);
  const requestedOffset = parseInt(c.req.query('offset') ?? '0', 10);
  const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 100) : 50;
  const offset = Number.isFinite(requestedOffset) ? Math.max(requestedOffset, 0) : 0;
  const purposeFilter = c.req.query('post_purpose');
  const cursor = c.req.query('cursor');
  const useUploadedAtCursor = cursor === 'uploaded_at';

  type Row = {
    id: string; nickname: string; file_type: string; file_key: string;
    mime_type: string; file_size: number; created_at: number; sort_order: number | null;
    participant_id: string | null; display_file_key: string | null; post_purpose: string;
  };

  let results: Row[];
  const purposeClause = purposeFilter ? ' AND post_purpose = ?' : '';

  if (since) {
    const sinceValue = parseInt(since, 10);
    if (!Number.isFinite(sinceValue)) return err('since must be a unix timestamp');
    const cursorClause = useUploadedAtCursor
      ? ' AND uploaded_at IS NOT NULL AND uploaded_at >= ?'
      : ' AND created_at > ?';
    const orderBy = useUploadedAtCursor ? 'uploaded_at ASC, created_at ASC' : 'created_at ASC';
    const stmt = c.env.DB.prepare(
      `SELECT id, nickname, file_type, file_key, mime_type, file_size, created_at, sort_order, participant_id, display_file_key, post_purpose
       FROM posts
       WHERE room_id = ? AND upload_status = 'uploaded' AND status = 'visible'${cursorClause}${purposeClause}
       ORDER BY ${orderBy}
       LIMIT ? OFFSET ?`
    );
    const bound = purposeFilter
      ? stmt.bind(roomId, sinceValue, purposeFilter, limit, offset)
      : stmt.bind(roomId, sinceValue, limit, offset);
    const { results: rows } = await bound.all<Row>();
    results = rows;
  } else {
    const stmt = c.env.DB.prepare(
      `SELECT id, nickname, file_type, file_key, mime_type, file_size, created_at, sort_order, participant_id, display_file_key, post_purpose
       FROM posts
       WHERE room_id = ? AND upload_status = 'uploaded' AND status = 'visible'${purposeClause}
       ORDER BY created_at ASC
       LIMIT ? OFFSET ?`
    );
    const bound = purposeFilter
      ? stmt.bind(roomId, purposeFilter, limit, offset)
      : stmt.bind(roomId, limit, offset);
    const { results: rows } = await bound.all<Row>();
    results = rows;
  }

  const serverTime = nowSec();
  return c.json({ posts: results, serverTime });
});

posts.get('/slideshow-count', async (c) => {
  const { roomId } = c.req.param() as ParamRoomId;
  const roomResult = await getRoomAndValidate(c.env.DB, roomId);
  if ('error' in roomResult) return err(roomResult.error, roomResult.status);

  const participantId = c.req.query('participantId');
  if (!participantId) return err('participantId is required', 400);

  const row = await c.env.DB.prepare(
    `SELECT COUNT(*) as cnt FROM posts WHERE room_id = ? AND participant_id = ? AND post_purpose = 'slideshow' AND upload_status != 'failed'`
  ).bind(roomId, participantId).first<{ cnt: number }>();

  return c.json({ count: row?.cnt ?? 0 });
});

posts.post('/view-urls', async (c) => {
  const { roomId } = c.req.param() as ParamRoomId;
  const roomResult = await getRoomAndValidate(c.env.DB, roomId);
  if ('error' in roomResult) return err(roomResult.error, roomResult.status);

  const body = await c.req.json<{
    postIds?: string[];
    preferDisplay?: boolean;
    purpose?: 'display' | 'slideshow' | 'thumbnail';
  }>();
  if (!Array.isArray(body.postIds) || body.postIds.length === 0) {
    return err('postIds must be a non-empty array');
  }
  if (body.postIds.length > 50) {
    return err('postIds too many (max 50)');
  }

  // purpose takes priority over legacy preferDisplay flag
  const purpose: 'display' | 'slideshow' | 'thumbnail' | null =
    body.purpose ?? (body.preferDisplay ? 'display' : null);

  const expirySeconds = parseInt(c.env.SIGNED_URL_EXPIRY_VIEW ?? '3600', 10);
  const usePresigned = envSupportsPresignedPut(c.env);
  const proxySecret = c.env.UPLOAD_BODY_SIGNING_SECRET;

  if (!usePresigned && !proxySecret) {
    return err('UPLOAD_BODY_SIGNING_SECRET is required for local view URL proxy', 501);
  }

  const placeholders = body.postIds.map(() => '?').join(',');

  // Fetch post file keys + mime (HEIC handling for display)
  type PostRow = { id: string; file_key: string; display_file_key: string | null; mime_type: string };
  const { results: postRows } = await c.env.DB.prepare(
    `SELECT id, file_key, display_file_key, mime_type FROM posts
     WHERE room_id = ? AND upload_status = 'uploaded' AND status = 'visible'
     AND id IN (${placeholders})`
  )
    .bind(roomId, ...body.postIds)
    .all<PostRow>();

  const viewUrls: Record<string, string> = {};
  const exp = nowSec() + expirySeconds;
  const transformOrigin = c.env.IMAGE_TRANSFORMATIONS_ORIGIN?.trim();

  // ── Slideshow: use slideshow_image derivatives only, build Transformations URL ──
  if (purpose === 'slideshow') {
    type SlideshowDerivRow = { post_id: string; file_key: string | null; provider: string };
    const { results: slideshowRows } = await c.env.DB.prepare(
      `SELECT post_id, file_key, provider FROM media_derivatives
       WHERE post_id IN (${placeholders}) AND type = 'slideshow_image' AND status = 'ready'`
    )
      .bind(...body.postIds)
      .all<SlideshowDerivRow>();
    const slideshowMap: Record<string, SlideshowDerivRow> = {};
    slideshowRows.forEach((r) => { slideshowMap[r.post_id] = r; });

    await Promise.all(
      postRows.map(async (row) => {
        const deriv = slideshowMap[row.id];
        if (!deriv) return; // no slideshow_image, omit

        if (deriv.provider === 'cloudflare_images' && deriv.file_key && transformOrigin && proxySecret) {
          try {
            const token = await createViewFileToken(proxySecret, {
              postId: row.id, roomId, fileKey: deriv.file_key, exp,
            });
            const base = transformOrigin.replace(/\/$/, '');
            const inner = `${base}/api/rooms/${roomId}/posts/${row.id}/view-file?token=${encodeURIComponent(token)}`;
            viewUrls[row.id] = buildCdnCgiImageUrl(transformOrigin, inner, { width: 2048 });
          } catch (_e) { /* skip */ }
          return;
        }

        // R2-backed slideshow file (future-proof)
        if (deriv.file_key) {
          try {
            if (usePresigned) {
              viewUrls[row.id] = await generatePresignedGetUrl(c.env.STORAGE, deriv.file_key, expirySeconds);
            } else if (proxySecret) {
              const token = await createViewFileToken(proxySecret, {
                postId: row.id, roomId, fileKey: deriv.file_key, exp,
              });
              viewUrls[row.id] = `/api/rooms/${roomId}/posts/${row.id}/view-file?token=${encodeURIComponent(token)}`;
            }
          } catch (_e) { /* skip */ }
        }
      })
    );

    return c.json({ viewUrls, expiresAt: exp });
  }

  // ── Display: display_image derivatives for images ──
  if (purpose === 'display') {
    type DerivRow = { post_id: string; file_key: string | null; provider: string };
    const { results: derivRows } = await c.env.DB.prepare(
      `SELECT post_id, file_key, provider FROM media_derivatives
       WHERE post_id IN (${placeholders}) AND type = 'display_image' AND status = 'ready'
       AND (file_key IS NOT NULL OR provider = 'cloudflare_images')`
    )
      .bind(...body.postIds)
      .all<DerivRow>();
    const derivativeMap: Record<string, DerivRow> = {};
    derivRows.forEach((r) => { derivativeMap[r.post_id] = r; });

    await Promise.all(
      postRows.map(async (row) => {
        const deriv = derivativeMap[row.id];
        const displayKey = deriv?.file_key ?? row.display_file_key ?? null;
        const heicTransformViaDerivative = deriv?.provider === 'cloudflare_images' && !deriv.file_key;

        if (displayKey) {
          try {
            if (usePresigned) {
              viewUrls[row.id] = await generatePresignedGetUrl(c.env.STORAGE, displayKey, expirySeconds);
            } else {
              const token = await createViewFileToken(proxySecret!, {
                postId: row.id, roomId, fileKey: displayKey, exp,
              });
              viewUrls[row.id] = `/api/rooms/${roomId}/posts/${row.id}/view-file?token=${encodeURIComponent(token)}`;
            }
          } catch (_e) { /* skip */ }
          return;
        }

        // HEIC/HEIF without R2 display WebP: Transformations wrapping view-file
        if (isHeicFamilyMime(row.mime_type) || heicTransformViaDerivative) {
          if (transformOrigin && proxySecret) {
            try {
              const token = await createViewFileToken(proxySecret, {
                postId: row.id, roomId, fileKey: row.file_key, exp,
              });
              const base = transformOrigin.replace(/\/$/, '');
              const inner = `${base}/api/rooms/${roomId}/posts/${row.id}/view-file?token=${encodeURIComponent(token)}`;
              viewUrls[row.id] = buildCdnCgiImageUrl(transformOrigin, inner);
            } catch (_e) { /* skip */ }
          }
          return;
        }

        // Other images (JPEG/PNG/WebP): sign original; videos omitted
        if (!row.mime_type.startsWith('video/')) {
          try {
            if (usePresigned) {
              viewUrls[row.id] = await generatePresignedGetUrl(c.env.STORAGE, row.file_key, expirySeconds);
            } else {
              const token = await createViewFileToken(proxySecret!, {
                postId: row.id, roomId, fileKey: row.file_key, exp,
              });
              viewUrls[row.id] = `/api/rooms/${roomId}/posts/${row.id}/view-file?token=${encodeURIComponent(token)}`;
            }
          } catch (_e) { /* skip */ }
        }
      })
    );

    return c.json({ viewUrls, expiresAt: exp });
  }

  // ── Thumbnail: thumbnail derivative first, then display_image fallback for images only ──
  if (purpose === 'thumbnail') {
    type ThumbRow = { post_id: string; file_key: string | null; provider: string; type: string };
    const { results: thumbRows } = await c.env.DB.prepare(
      `SELECT post_id, file_key, provider, type FROM media_derivatives
       WHERE post_id IN (${placeholders}) AND type IN ('thumbnail', 'display_image') AND status = 'ready'
       AND (file_key IS NOT NULL OR provider = 'cloudflare_images')`
    )
      .bind(...body.postIds)
      .all<ThumbRow>();

    const thumbMap: Record<string, ThumbRow> = {};
    const displayMap: Record<string, ThumbRow> = {};
    thumbRows.forEach((r) => {
      if (r.type === 'thumbnail') thumbMap[r.post_id] = r;
      else if (r.type === 'display_image' && !displayMap[r.post_id]) displayMap[r.post_id] = r;
    });

    async function signKey(postId: string, fileKey: string): Promise<string | null> {
      try {
        if (usePresigned) return await generatePresignedGetUrl(c.env.STORAGE, fileKey, expirySeconds);
        if (proxySecret) {
          const token = await createViewFileToken(proxySecret, { postId, roomId, fileKey, exp });
          return `/api/rooms/${roomId}/posts/${postId}/view-file?token=${encodeURIComponent(token)}`;
        }
      } catch (_e) { /* skip */ }
      return null;
    }

    await Promise.all(
      postRows.map(async (row) => {
        const isVideo = row.mime_type.startsWith('video/');

        // 1. Thumbnail derivative (video thumbnails and image thumbnails)
        const thumb = thumbMap[row.id];
        if (thumb?.file_key) {
          const url = await signKey(row.id, thumb.file_key);
          if (url) viewUrls[row.id] = url;
          return;
        }

        // 2. Videos without thumbnail: omit (never expose original video URL as display)
        if (isVideo) return;

        // 3. Image fallback: display_image derivative
        const display = displayMap[row.id];
        const displayKey = display?.file_key ?? row.display_file_key ?? null;
        const heicTransform = display?.provider === 'cloudflare_images' && !display.file_key;

        if (displayKey) {
          const url = await signKey(row.id, displayKey);
          if (url) viewUrls[row.id] = url;
          return;
        }

        if (isHeicFamilyMime(row.mime_type) || heicTransform) {
          if (transformOrigin && proxySecret) {
            try {
              const token = await createViewFileToken(proxySecret, { postId: row.id, roomId, fileKey: row.file_key, exp });
              const base = transformOrigin.replace(/\/$/, '');
              const inner = `${base}/api/rooms/${roomId}/posts/${row.id}/view-file?token=${encodeURIComponent(token)}`;
              viewUrls[row.id] = buildCdnCgiImageUrl(transformOrigin, inner);
            } catch (_e) { /* skip */ }
          }
          return;
        }

        // 4. JPEG/PNG/WebP without display_image: sign original
        const url = await signKey(row.id, row.file_key);
        if (url) viewUrls[row.id] = url;
      })
    );

    return c.json({ viewUrls, expiresAt: exp });
  }

  // ── Download: always original file ──
  await Promise.all(
    postRows.map(async (row) => {
      try {
        if (usePresigned) {
          viewUrls[row.id] = await generatePresignedGetUrl(c.env.STORAGE, row.file_key, expirySeconds);
        } else {
          const token = await createViewFileToken(proxySecret!, {
            postId: row.id, roomId, fileKey: row.file_key, exp,
          });
          viewUrls[row.id] = `/api/rooms/${roomId}/posts/${row.id}/view-file?token=${encodeURIComponent(token)}`;
        }
      } catch (_e) { /* skip */ }
    })
  );

  return c.json({ viewUrls, expiresAt: exp });
});

// ---- Admin endpoints (X-Host-Token required) ----

posts.get('/admin', async (c) => {
  const { roomId } = c.req.param() as ParamRoomId;
  const roomResult = await getRoomAndValidate(c.env.DB, roomId);
  if ('error' in roomResult) return err(roomResult.error, roomResult.status);
  const { room } = roomResult;

  if (!(await authorizeRoomManage(c.env, room, c.req.header('X-Host-Token'), c.req.header('Cookie')))) {
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

  if (!(await authorizeRoomManage(c.env, room, c.req.header('X-Host-Token'), c.req.header('Cookie')))) {
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

  if (!(await authorizeRoomManage(c.env, room, c.req.header('X-Host-Token'), c.req.header('Cookie')))) {
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

  // Also delete associated media_derivatives from R2
  const { results: derivatives } = await c.env.DB.prepare(
    "SELECT file_key FROM media_derivatives WHERE post_id = ? AND file_key IS NOT NULL"
  )
    .bind(postId)
    .all<{ file_key: string }>();

  await Promise.allSettled(
    derivatives.map((d) => c.env.STORAGE.delete(d.file_key))
  );

  await c.env.DB.prepare('DELETE FROM media_derivatives WHERE post_id = ?').bind(postId).run();
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

  // Accept original, legacy display_file_key, or any derivative key in this room for this post
  const keyIsValid =
    post.file_key === payload.fileKey ||
    (post.display_file_key !== null && post.display_file_key === payload.fileKey) ||
    (payload.fileKey.startsWith(`${roomId}/`) && payload.fileKey.includes(`/${postId}.`));
  if (!keyIsValid) return err('Token does not match post', 403);

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

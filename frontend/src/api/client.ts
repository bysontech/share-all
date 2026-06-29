function getApiOrigin(): string {
  return import.meta.env.VITE_API_BASE?.trim().replace(/\/$/, '') ?? '';
}

/** JSON API 用プレフィックス（例: /api または https://host/api） */
const API_PREFIX = getApiOrigin() ? `${getApiOrigin()}/api` : '/api';

/**
 * 表示・ダウンロード用。API が返す絶対 URL（R2 署名・Transformations）はそのまま。
 * `/api/...` のサイト相対パスで、別オリジン API のときは VITE_API_BASE を前置する。
 */
export function resolvePublicMediaUrl(url: string | undefined | null): string {
  if (url == null || url === '') return '';
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  const origin = getApiOrigin();
  if (url.startsWith('/') && origin) return `${origin}${url}`;
  return url;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const { headers: hdr, ...rest } = init ?? {};
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(hdr as Record<string, string> | undefined),
  };

  const res = await fetch(`${API_PREFIX}${path}`, {
    credentials: 'include',
    ...rest,
    headers,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new ApiError(res.status, (body as { error?: string }).error ?? 'Unknown error');
  }
  return res.json() as Promise<T>;
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export interface CreateRoomResponse {
  roomId: string;
  hostToken: string;
  participantUrl: string;
}

export interface RoomInfo {
  roomId: string;
  name: string;
  hasPasscode: boolean;
  description: string | null;
}

export interface SlideshowSettings {
  intervalSeconds: number;
  showNickname: boolean;
  orderMode: string;
}

export interface UploadUrlResponse {
  uploadUrl: string;
  fileKey: string;
  postId: string;
}

export interface Post {
  id: string;
  nickname: string;
  file_type: string;
  file_key: string;
  mime_type: string;
  file_size: number;
  created_at: number;
  sort_order: number | null;
  participant_id: string | null;
  display_file_key: string | null;
  post_purpose: string; // 'slideshow' | 'album' | 'video'
}

export interface AdminPost {
  id: string;
  nickname: string;
  file_type: string;
  file_key: string;
  mime_type: string;
  file_size: number;
  status: string;
  upload_status: string;
  created_at: number;
  uploaded_at: number | null;
  sort_order: number | null;
}

export interface PostsResponse {
  posts: Post[];
  serverTime: number;
}

export interface ViewUrlsResponse {
  viewUrls: Record<string, string>;
  expiresAt: number;
}

export interface ThemeSettings {
  title: string | null;
  message: string | null;
  mainVisualKey: string | null;
  mainVisualDisplayKey: string | null;
  mainVisualDisplayMimeType: string | null;
  backgroundImageKey: string | null;
  backgroundDisplayImageKey: string | null;
  backgroundDisplayMimeType: string | null;
  themeColor: string | null;
  animationMode: string;
}

export interface BootstrapTheme {
  title: string | null;
  message: string | null;
  themeColor: string | null;
  animationMode: string;
  mainVisualUrl: string | null;
  backgroundDisplayUrl: string | null;
}

export type EventMode = 'draft' | 'event_live' | 'archive';

export interface EventModeSettings {
  eventMode: EventMode;
  manualMode: string | null;
  slideshowOpenAt: number | null;
  slideshowCloseAt: number | null;
  galleryOpenAt: number | null;
  videoOpenAt: number | null;
  nextTransitionAt: number | null;
}

export interface BootstrapResponse {
  room: RoomInfo;
  theme: BootstrapTheme;
  eventMode: EventMode;
  nextTransitionAt: number | null;
}

export interface RoomFeedbackSummary {
  counts: {
    ok: number;
    line: number;
  };
}

export interface RoomFeedbackResponse {
  kind: 'ok' | 'line' | null;
}

export interface ThemeViewUrls {
  viewUrls: Record<string, string>;
  expiresAt?: number;
}

export interface ThemeUploadUrlResponse {
  uploadUrl: string;
  fileKey: string;
}

export const api = {
  createRoom: (body: { name: string; passcode?: string; description?: string }) =>
    request<CreateRoomResponse>('/rooms', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  getRoom: (roomId: string) => request<RoomInfo>(`/rooms/${roomId}`),

  getSlideshowSettings: (roomId: string) =>
    request<SlideshowSettings>(`/rooms/${roomId}/slideshow-settings`),

  updateSlideshowSettings: (roomId: string, settings: SlideshowSettings, hostToken?: string) =>
    request<SlideshowSettings>(`/rooms/${roomId}/slideshow-settings`, {
      method: 'PUT',
      body: JSON.stringify(settings),
      ...(hostToken ? { headers: { 'X-Host-Token': hostToken } } : {}),
    }),

  getUploadUrl: (
    roomId: string,
    body: {
      nickname: string;
      fileName: string;
      mimeType: string;
      fileSize: number;
      uploadType?: 'original' | 'display' | 'thumbnail';
      postId?: string;
      postPurpose?: 'slideshow' | 'album' | 'video';
      participantId?: string;
    }
  ) =>
    request<UploadUrlResponse>(`/rooms/${roomId}/posts/upload-url`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  completeUpload: (
    roomId: string,
    postId: string,
    extra?: {
      participantId?: string;
      displayFileKey?: string;
      displayMimeType?: string;
      thumbnailFileKey?: string;
      thumbnailMimeType?: string;
    }
  ) =>
    request<{ ok: boolean }>(`/rooms/${roomId}/posts/${postId}/complete`, {
      method: 'POST',
      body: JSON.stringify(extra ?? {}),
    }),

  failUpload: (roomId: string, postId: string) =>
    request<{ ok: boolean }>(`/rooms/${roomId}/posts/${postId}/fail`, {
      method: 'POST',
      body: '{}',
    }),

  getPosts: (
    roomId: string,
    since?: number,
    postPurpose?: 'slideshow' | 'album' | 'video',
    cursor?: 'created_at' | 'uploaded_at',
    limit?: number,
    offset?: number
  ) => {
    const params = new URLSearchParams();
    if (since != null) params.set('since', String(since));
    if (postPurpose) params.set('post_purpose', postPurpose);
    if (cursor) params.set('cursor', cursor);
    if (limit != null) params.set('limit', String(limit));
    if (offset != null) params.set('offset', String(offset));
    const qs = params.size > 0 ? `?${params}` : '';
    return request<PostsResponse>(`/rooms/${roomId}/posts${qs}`);
  },

  getSlideshowCount: (roomId: string, participantId: string) =>
    request<{ count: number }>(`/rooms/${roomId}/posts/slideshow-count?participantId=${encodeURIComponent(participantId)}`),

  getViewUrls: (
    roomId: string,
    postIds: string[],
    preferDisplay?: boolean,
    purpose?: 'display' | 'slideshow' | 'thumbnail'
  ) =>
    request<ViewUrlsResponse>(`/rooms/${roomId}/posts/view-urls`, {
      method: 'POST',
      body: JSON.stringify({
        postIds,
        ...(purpose ? { purpose } : preferDisplay ? { preferDisplay: true } : {}),
      }),
    }),

  // Theme APIs
  getTheme: (roomId: string) => request<ThemeSettings>(`/rooms/${roomId}/theme`),

  updateTheme: (roomId: string, settings: Partial<ThemeSettings>, hostToken?: string) =>
    request<ThemeSettings>(`/rooms/${roomId}/theme`, {
      method: 'PUT',
      body: JSON.stringify(settings),
      ...(hostToken ? { headers: { 'X-Host-Token': hostToken } } : {}),
    }),

  getThemeViewUrls: (roomId: string) =>
    request<ThemeViewUrls>(`/rooms/${roomId}/theme/view-urls`, { method: 'POST', body: '{}' }),

  getBootstrap: (roomId: string) => request<BootstrapResponse>(`/rooms/${roomId}/bootstrap`),

  getEventMode: (roomId: string) =>
    request<EventModeSettings>(`/rooms/${roomId}/event-mode`),

  getRoomFeedback: (roomId: string, participantId: string) =>
    request<RoomFeedbackResponse>(`/rooms/${roomId}/feedback?participantId=${encodeURIComponent(participantId)}`),

  submitRoomFeedback: (roomId: string, kind: 'ok' | 'line', participantId: string) =>
    request<{ kind: 'ok' | 'line'; previousKind: 'ok' | 'line' | null; changed: boolean }>(`/rooms/${roomId}/feedback`, {
      method: 'POST',
      body: JSON.stringify({ kind, participantId }),
    }),

  getRoomFeedbackSummary: (roomId: string, hostToken?: string) =>
    request<RoomFeedbackSummary>(`/rooms/${roomId}/feedback-summary`, {
      ...(hostToken ? { headers: { 'X-Host-Token': hostToken } } : {}),
    }),

  updateEventMode: (
    roomId: string,
    body: {
      manualMode?: string | null;
      slideshowOpenAt?: number | null;
      slideshowCloseAt?: number | null;
      galleryOpenAt?: number | null;
      videoOpenAt?: number | null;
    },
    hostToken?: string
  ) =>
    request<EventModeSettings>(`/rooms/${roomId}/event-mode`, {
      method: 'PUT',
      body: JSON.stringify(body),
      ...(hostToken ? { headers: { 'X-Host-Token': hostToken } } : {}),
    }),

  getThemeUploadUrl: (
    roomId: string,
    imageType: 'main_visual' | 'main_visual_display' | 'background' | 'background_display',
    mimeType: string,
    fileSize: number,
    hostToken?: string
  ) =>
    request<ThemeUploadUrlResponse>(`/rooms/${roomId}/theme/upload-url`, {
      method: 'POST',
      body: JSON.stringify({ imageType, mimeType, fileSize }),
      ...(hostToken ? { headers: { 'X-Host-Token': hostToken } } : {}),
    }),

  // Admin APIs
  getAdminPosts: (roomId: string, hostToken?: string) =>
    request<{ posts: AdminPost[] }>(`/rooms/${roomId}/posts/admin`, {
      ...(hostToken ? { headers: { 'X-Host-Token': hostToken } } : {}),
    }),

  updatePostStatus: (
    roomId: string,
    postId: string,
    status: 'visible' | 'hidden',
    hostToken?: string
  ) =>
    request<{ id: string; status: string }>(`/rooms/${roomId}/posts/${postId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
      ...(hostToken ? { headers: { 'X-Host-Token': hostToken } } : {}),
    }),

  deletePost: (roomId: string, postId: string, hostToken?: string) =>
    request<{ ok: boolean }>(`/rooms/${roomId}/posts/${postId}`, {
      method: 'DELETE',
      ...(hostToken ? { headers: { 'X-Host-Token': hostToken } } : {}),
    }),
};

// ── Multipart Upload API (large video) ──

export interface MultipartStartResponse {
  uploadId: string;
  fileKey: string;
  postId: string;
}

export interface MultipartPartUrlResponse {
  uploadUrl: string;
  partNumber: number;
}

export const multipartApi = {
  start: (roomId: string, body: { nickname: string; fileName: string; mimeType: string; fileSize: number }) =>
    request<MultipartStartResponse>(`/rooms/${roomId}/posts/multipart/start`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  partUrl: (roomId: string, body: { postId: string; fileKey: string; uploadId: string; partNumber: number }) =>
    request<MultipartPartUrlResponse>(`/rooms/${roomId}/posts/multipart/part-url`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  complete: (
    roomId: string,
    body: { postId: string; fileKey: string; uploadId: string; parts: { partNumber: number; etag: string }[] }
  ) =>
    request<{ ok: boolean }>(`/rooms/${roomId}/posts/multipart/complete`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  abort: (roomId: string, body: { postId: string; fileKey: string; uploadId: string }) =>
    request<{ ok: boolean }>(`/rooms/${roomId}/posts/multipart/abort`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
};

// ── Admin API (credentials: 'include') ──

async function adminRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_PREFIX}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    credentials: 'include',
    ...init,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new ApiError(res.status, (body as { error?: string }).error ?? 'Unknown error');
  }
  return res.json() as Promise<T>;
}

export interface AdminRoomItem {
  roomId: string;
  name: string;
  description: string | null;
  createdAt: number;
  participantUrl: string;
  adminUrl: string;
  postCount: number;
  imageCount: number;
  videoCount: number;
}

export interface AdminCreateRoomResponse {
  roomId: string;
  hostToken: string;
  participantUrl: string;
  adminUrl: string;
}

export const adminApi = {
  me: () => adminRequest<{ ok: boolean }>('/admin/me'),

  login: (password: string) =>
    adminRequest<{ ok: boolean }>('/admin/login', {
      method: 'POST',
      body: JSON.stringify({ password }),
    }),

  logout: () => adminRequest<{ ok: boolean }>('/admin/logout', { method: 'POST' }),

  getRooms: () => adminRequest<{ rooms: AdminRoomItem[] }>('/admin/rooms'),

  createRoom: (body: { name: string; description?: string; passcode?: string }) =>
    adminRequest<AdminCreateRoomResponse>('/admin/rooms', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  deleteRoom: (roomId: string) =>
    adminRequest<{ ok: boolean; deletedPosts: number }>(`/admin/rooms/${roomId}`, {
      method: 'DELETE',
    }),

  /** Returns 200 if admin_entry cookie is valid; throws ApiError(404) otherwise. */
  entryCheck: () => adminRequest<{ ok: boolean }>('/admin/entry-check'),
};

export function putToR2(
  uploadUrl: string,
  data: File | Blob,
  onProgress?: (loaded: number, total: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', resolvePublicMediaUrl(uploadUrl));
    xhr.setRequestHeader('Content-Type', data.type);

    if (onProgress) {
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) onProgress(e.loaded, e.total);
      });
    }

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`R2 PUT failed: ${xhr.status}`));
    });
    xhr.addEventListener('error', () => reject(new Error('ネットワークエラーが発生しました')));
    xhr.addEventListener('abort', () => reject(new Error('アップロードが中断されました')));

    xhr.send(data);
  });
}

/**
 * PUTs a single multipart-upload part directly to its presigned R2 URL and resolves
 * with the response's ETag (required by the Complete Multipart Upload call). Requires
 * the R2 bucket CORS policy to include ETag in ExposeHeaders, otherwise the browser
 * cannot read it and this rejects.
 */
export function putPartToR2(
  uploadUrl: string,
  data: Blob,
  onProgress?: (loaded: number, total: number) => void,
  onXhrReady?: (xhr: XMLHttpRequest) => void
): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', resolvePublicMediaUrl(uploadUrl));
    onXhrReady?.(xhr);

    if (onProgress) {
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) onProgress(e.loaded, e.total);
      });
    }

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const etag = xhr.getResponseHeader('ETag')?.trim();
        if (!etag) {
          reject(new Error('ETagを取得できませんでした（R2バケットのCORS設定を確認してください）'));
          return;
        }
        resolve(etag);
      } else {
        reject(new Error(`R2 PUT failed: ${xhr.status}`));
      }
    });
    xhr.addEventListener('error', () => reject(new Error('ネットワークエラーが発生しました')));
    xhr.addEventListener('abort', () => reject(new Error('アップロードが中断されました')));

    xhr.send(data);
  });
}

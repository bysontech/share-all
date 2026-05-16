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
  expiresAt: number;
}

export interface RoomInfo {
  roomId: string;
  name: string;
  hasPasscode: boolean;
  description: string | null;
  expiresAt: number;
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
  backgroundImageKey: string | null;
  themeColor: string | null;
  animationMode: string;
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

  getPosts: (roomId: string, since?: number) => {
    const qs = since != null ? `?since=${since}` : '';
    return request<PostsResponse>(`/rooms/${roomId}/posts${qs}`);
  },

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

  getThemeUploadUrl: (
    roomId: string,
    imageType: 'main_visual' | 'background',
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
  expiresAt: number;
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
  expiresAt: number;
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
};

export async function putToR2(uploadUrl: string, data: File | Blob): Promise<void> {
  // Worker は proxy モードで /api/... の相対 URL を返す。別オリジン時は VITE_API_BASE 前置が必要
  const res = await fetch(resolvePublicMediaUrl(uploadUrl), {
    method: 'PUT',
    body: data,
    headers: { 'Content-Type': data.type },
  });
  if (!res.ok) throw new Error(`R2 PUT failed: ${res.status}`);
}

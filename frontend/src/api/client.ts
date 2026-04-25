const BASE = '/api';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    ...init,
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
  created_at: number;
  sort_order: number | null;
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

  updateSlideshowSettings: (roomId: string, hostToken: string, settings: SlideshowSettings) =>
    request<SlideshowSettings>(`/rooms/${roomId}/slideshow-settings`, {
      method: 'PUT',
      headers: { 'X-Host-Token': hostToken },
      body: JSON.stringify(settings),
    }),

  getUploadUrl: (
    roomId: string,
    body: { nickname: string; fileName: string; mimeType: string; fileSize: number }
  ) =>
    request<UploadUrlResponse>(`/rooms/${roomId}/posts/upload-url`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  completeUpload: (roomId: string, postId: string) =>
    request<{ ok: boolean }>(`/rooms/${roomId}/posts/${postId}/complete`, {
      method: 'POST',
      body: '{}',
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

  getViewUrls: (roomId: string, postIds: string[]) =>
    request<ViewUrlsResponse>(`/rooms/${roomId}/posts/view-urls`, {
      method: 'POST',
      body: JSON.stringify({ postIds }),
    }),

  // Theme APIs
  getTheme: (roomId: string) => request<ThemeSettings>(`/rooms/${roomId}/theme`),

  updateTheme: (roomId: string, hostToken: string, settings: Partial<ThemeSettings>) =>
    request<ThemeSettings>(`/rooms/${roomId}/theme`, {
      method: 'PUT',
      headers: { 'X-Host-Token': hostToken },
      body: JSON.stringify(settings),
    }),

  getThemeViewUrls: (roomId: string) =>
    request<ThemeViewUrls>(`/rooms/${roomId}/theme/view-urls`, { method: 'POST', body: '{}' }),

  getThemeUploadUrl: (
    roomId: string,
    hostToken: string,
    imageType: 'main_visual' | 'background',
    mimeType: string,
    fileSize: number
  ) =>
    request<ThemeUploadUrlResponse>(`/rooms/${roomId}/theme/upload-url`, {
      method: 'POST',
      headers: { 'X-Host-Token': hostToken },
      body: JSON.stringify({ imageType, mimeType, fileSize }),
    }),

  // Admin APIs
  getAdminPosts: (roomId: string, hostToken: string) =>
    request<{ posts: AdminPost[] }>(`/rooms/${roomId}/posts/admin`, {
      headers: { 'X-Host-Token': hostToken },
    }),

  updatePostStatus: (roomId: string, postId: string, hostToken: string, status: 'visible' | 'hidden') =>
    request<{ id: string; status: string }>(`/rooms/${roomId}/posts/${postId}`, {
      method: 'PATCH',
      headers: { 'X-Host-Token': hostToken },
      body: JSON.stringify({ status }),
    }),

  deletePost: (roomId: string, postId: string, hostToken: string) =>
    request<{ ok: boolean }>(`/rooms/${roomId}/posts/${postId}`, {
      method: 'DELETE',
      headers: { 'X-Host-Token': hostToken },
    }),
};

export async function putToR2(uploadUrl: string, file: File): Promise<void> {
  const res = await fetch(uploadUrl, {
    method: 'PUT',
    body: file,
    headers: { 'Content-Type': file.type },
  });
  if (!res.ok) throw new Error(`R2 PUT failed: ${res.status}`);
}

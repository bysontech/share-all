export interface Env {
  DB: D1Database;
  STORAGE: R2Bucket;
  FRONTEND_URL: string;
  SIGNED_URL_EXPIRY_UPLOAD: string;
  SIGNED_URL_EXPIRY_VIEW: string;
  /** HMAC secret for Worker PUT/GET proxy when local Miniflare R2 has no createPresignedUrl */
  UPLOAD_BODY_SIGNING_SECRET?: string;
  R2_ACCOUNT_ID?: string;
  R2_ACCESS_KEY_ID?: string;
  R2_SECRET_ACCESS_KEY?: string;
  /**
   * Public origin of this Worker (same zone as Image Transformations), e.g. https://api.example.com
   * When set, HEIC/HEIF display uses /cdn-cgi/image/... wrapping view-file URLs (no Images Upload API).
   */
  IMAGE_TRANSFORMATIONS_ORIGIN?: string;
  /** SHA-256 hex digest of the admin password. Set via wrangler secret. */
  ADMIN_PASSWORD_HASH?: string;
  /** HMAC-SHA256 key for signing admin session cookies. Set via wrangler secret. */
  ADMIN_SESSION_SECRET?: string;
  /** Max-Age in seconds for the admin session cookie (default: 86400). */
  ADMIN_SESSION_MAX_AGE?: string;
  /** SHA-256 hex of the admin entry token. Set via wrangler secret. */
  ADMIN_ENTRY_TOKEN_HASH?: string;
  /** HMAC-SHA256 key for signing admin entry cookies. Set via wrangler secret. */
  ADMIN_ENTRY_SESSION_SECRET?: string;
  /** Max-Age in seconds for the admin entry cookie (default: 1800 = 30 min). */
  ADMIN_ENTRY_SESSION_MAX_AGE?: string;
}

export interface Room {
  id: string;
  name: string;
  passcode: string | null;
  host_token: string;
  description: string | null;
  /** Legacy NOT NULL column; not used for access control (see ROOM_EXPIRES_AT_PLACEHOLDER_SEC). */
  expires_at: number;
  created_at: number;
}

export interface Post {
  id: string;
  room_id: string;
  nickname: string;
  file_key: string;
  file_type: string;
  mime_type: string;
  file_size: number;
  status: string;
  sort_order: number | null;
  upload_status: string;
  uploaded_at: number | null;
  created_at: number;
  participant_id: string | null;
  display_file_key: string | null;
  display_mime_type: string | null;
  post_purpose: string; // 'slideshow' | 'album' | 'video'
}

export interface MediaDerivative {
  id: string;
  post_id: string;
  type: string;
  file_key: string | null;
  mime_type: string | null;
  status: string;
  created_at: number;
}

export const ALLOWED_IMAGE_MIMES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
] as const;

export const ALLOWED_VIDEO_MIMES = [
  'video/mp4',
  'video/quicktime',
] as const;

export const MAX_IMAGE_SIZE = 20 * 1024 * 1024;  // 20MB
export const MAX_VIDEO_SIZE = 200 * 1024 * 1024; // 200MB

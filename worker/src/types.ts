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
}

export interface Room {
  id: string;
  name: string;
  passcode: string | null;
  host_token: string;
  description: string | null;
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

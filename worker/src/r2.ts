import { AwsClient } from 'aws4fetch';
import type { R2Bucket } from '@cloudflare/workers-types';
import type { Env } from './types';

type R2WithPresign = R2Bucket & {
  createPresignedUrl?: (
    method: string,
    key: string,
    opts: { expiresIn: number; httpMetadata?: { contentType?: string } }
  ) => Promise<string>;
};

type R2PresignConfig = Pick<Env, 'R2_ACCOUNT_ID' | 'R2_ACCESS_KEY_ID' | 'R2_SECRET_ACCESS_KEY' | 'R2_BUCKET_NAME'>;

/** Worker proxy uploads stall on large bodies; direct R2 PUT is required beyond this size. */
export const PROXY_UPLOAD_MAX_BYTES = 10 * 1024 * 1024;

function hasS3PresignConfig(config: R2PresignConfig): boolean {
  return missingPresignConfigKeys(config).length === 0;
}

/** Which R2 S3 presign env keys are unset (for error messages). */
export function missingPresignConfigKeys(config: R2PresignConfig): string[] {
  const missing: string[] = [];
  if (!config.R2_ACCOUNT_ID?.trim()) missing.push('R2_ACCOUNT_ID');
  if (!config.R2_ACCESS_KEY_ID?.trim()) missing.push('R2_ACCESS_KEY_ID');
  if (!config.R2_SECRET_ACCESS_KEY?.trim()) missing.push('R2_SECRET_ACCESS_KEY');
  if (!config.R2_BUCKET_NAME?.trim()) missing.push('R2_BUCKET_NAME');
  return missing;
}

export function r2SupportsPresignedPut(target: R2Bucket | R2PresignConfig): boolean {
  if (hasS3PresignConfig(target as R2PresignConfig)) return true;
  return typeof (target as R2WithPresign).createPresignedUrl === 'function';
}

export function envSupportsPresignedPut(env: Env): boolean {
  return r2SupportsPresignedPut(env);
}

export function envSupportsPresignedGet(env: Env): boolean {
  return r2SupportsPresignedPut(env);
}

/** Prefer S3 API credentials; fall back to the R2 bucket binding. */
export function resolvePresignTarget(env: Env): R2Bucket | R2PresignConfig {
  if (hasS3PresignConfig(env)) return env;
  return env.STORAGE;
}

export function requiresDirectR2Upload(fileSize: number, isVideo: boolean): boolean {
  return isVideo || fileSize > PROXY_UPLOAD_MAX_BYTES;
}

function encodeObjectKey(fileKey: string): string {
  return fileKey.split('/').map(encodeURIComponent).join('/');
}

async function generateS3PresignedPutUrl(
  config: R2PresignConfig,
  fileKey: string,
  mimeType: string,
  expirySeconds: number
): Promise<string> {
  if (!hasS3PresignConfig(config)) {
    throw new TypeError('R2 S3 presign config is incomplete');
  }

  const accountId = config.R2_ACCOUNT_ID!.trim();
  const accessKeyId = config.R2_ACCESS_KEY_ID!.trim();
  const secretAccessKey = config.R2_SECRET_ACCESS_KEY!.trim();
  const bucketName = config.R2_BUCKET_NAME!.trim();

  const client = new AwsClient({
    accessKeyId,
    secretAccessKey,
    service: 's3',
    region: 'auto',
  });

  const objectUrl = `https://${accountId}.r2.cloudflarestorage.com/${bucketName}/${encodeObjectKey(fileKey)}?X-Amz-Expires=${expirySeconds}`;
  const signed = await client.sign(
    new Request(objectUrl, {
      method: 'PUT',
      headers: { 'Content-Type': mimeType },
    }),
    { aws: { signQuery: true } }
  );
  return signed.url.toString();
}

async function generateS3PresignedGetUrl(
  config: R2PresignConfig,
  fileKey: string,
  expirySeconds: number
): Promise<string> {
  if (!hasS3PresignConfig(config)) {
    throw new TypeError('R2 S3 presign config is incomplete');
  }

  const accountId = config.R2_ACCOUNT_ID!.trim();
  const accessKeyId = config.R2_ACCESS_KEY_ID!.trim();
  const secretAccessKey = config.R2_SECRET_ACCESS_KEY!.trim();
  const bucketName = config.R2_BUCKET_NAME!.trim();

  const client = new AwsClient({
    accessKeyId,
    secretAccessKey,
    service: 's3',
    region: 'auto',
  });

  const objectUrl = `https://${accountId}.r2.cloudflarestorage.com/${bucketName}/${encodeObjectKey(fileKey)}?X-Amz-Expires=${expirySeconds}`;
  const signed = await client.sign(
    new Request(objectUrl, { method: 'GET' }),
    { aws: { signQuery: true } }
  );
  return signed.url.toString();
}

export async function generatePresignedPutUrl(
  target: R2Bucket | R2PresignConfig,
  fileKey: string,
  mimeType: string,
  expirySeconds: number
): Promise<string> {
  const config = target as R2PresignConfig;
  if (hasS3PresignConfig(config)) {
    return generateS3PresignedPutUrl(config, fileKey, mimeType, expirySeconds);
  }

  const b = target as R2WithPresign;
  const create = b.createPresignedUrl;
  if (typeof create !== 'function') {
    throw new TypeError('R2Bucket.createPresignedUrl is not available');
  }
  const url = await create.call(b, 'PUT', fileKey, {
    expiresIn: expirySeconds,
    httpMetadata: { contentType: mimeType },
  });
  return url;
}

export async function generatePresignedGetUrl(
  target: R2Bucket | R2PresignConfig,
  fileKey: string,
  expirySeconds: number
): Promise<string> {
  const config = target as R2PresignConfig;
  if (hasS3PresignConfig(config)) {
    return generateS3PresignedGetUrl(config, fileKey, expirySeconds);
  }

  const b = target as R2WithPresign;
  const create = b.createPresignedUrl;
  if (typeof create !== 'function') {
    throw new TypeError('R2Bucket.createPresignedUrl is not available');
  }
  const url = await create.call(b, 'GET', fileKey, { expiresIn: expirySeconds });
  return url;
}

// ── Multipart Upload (large video) ──
// Create/Complete/Abort are server-to-server calls the Worker makes directly against
// R2's S3-compatible API. UploadPart is never called by the Worker — only a presigned
// PUT URL is handed back so the browser can PUT each part straight to R2, keeping the
// video body out of the Worker entirely. Only the S3-credential path supports this
// (the R2-binding presign fallback used for local dev has no multipart equivalent).
export function envSupportsMultipart(env: Env): boolean {
  return hasS3PresignConfig(env);
}

function s3Client(config: R2PresignConfig): AwsClient {
  return new AwsClient({
    accessKeyId: config.R2_ACCESS_KEY_ID!.trim(),
    secretAccessKey: config.R2_SECRET_ACCESS_KEY!.trim(),
    service: 's3',
    region: 'auto',
  });
}

function r2ObjectUrl(config: R2PresignConfig, fileKey: string): string {
  const accountId = config.R2_ACCOUNT_ID!.trim();
  const bucketName = config.R2_BUCKET_NAME!.trim();
  return `https://${accountId}.r2.cloudflarestorage.com/${bucketName}/${encodeObjectKey(fileKey)}`;
}

export async function createMultipartUpload(
  config: R2PresignConfig,
  fileKey: string,
  mimeType: string
): Promise<string> {
  if (!hasS3PresignConfig(config)) throw new TypeError('R2 S3 presign config is incomplete');
  const res = await s3Client(config).fetch(`${r2ObjectUrl(config, fileKey)}?uploads`, {
    method: 'POST',
    headers: { 'Content-Type': mimeType },
  });
  if (!res.ok) {
    throw new Error(`R2 CreateMultipartUpload failed: ${res.status} ${await res.text().catch(() => '')}`);
  }
  const xml = await res.text();
  const match = xml.match(/<UploadId>([^<]+)<\/UploadId>/);
  if (!match) throw new Error('R2 CreateMultipartUpload response missing UploadId');
  return match[1];
}

export async function generatePresignedUploadPartUrl(
  config: R2PresignConfig,
  fileKey: string,
  uploadId: string,
  partNumber: number,
  expirySeconds: number
): Promise<string> {
  if (!hasS3PresignConfig(config)) throw new TypeError('R2 S3 presign config is incomplete');
  const url = `${r2ObjectUrl(config, fileKey)}?partNumber=${partNumber}&uploadId=${encodeURIComponent(uploadId)}&X-Amz-Expires=${expirySeconds}`;
  const signed = await s3Client(config).sign(new Request(url, { method: 'PUT' }), { aws: { signQuery: true } });
  return signed.url.toString();
}

function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Defensive backstop: parts must be a contiguous 1..N sequence, each with a non-empty ETag. */
function assertContiguousParts(parts: { partNumber: number; etag: string }[]): void {
  for (let i = 0; i < parts.length; i++) {
    const expected = i + 1;
    if (parts[i].partNumber !== expected) {
      throw new Error(
        `R2 CompleteMultipartUpload: part sequence is not contiguous (expected partNumber ${expected}, got ${parts[i].partNumber})`
      );
    }
    if (!parts[i].etag || !parts[i].etag.trim()) {
      throw new Error(`R2 CompleteMultipartUpload: part ${expected} is missing an ETag`);
    }
  }
}

export async function completeMultipartUpload(
  config: R2PresignConfig,
  fileKey: string,
  uploadId: string,
  parts: { partNumber: number; etag: string }[]
): Promise<void> {
  if (!hasS3PresignConfig(config)) throw new TypeError('R2 S3 presign config is incomplete');
  const sortedParts = [...parts].sort((a, b) => a.partNumber - b.partNumber);
  assertContiguousParts(sortedParts);
  const body = `<CompleteMultipartUpload>${sortedParts
    .map((p) => `<Part><PartNumber>${p.partNumber}</PartNumber><ETag>${escapeXml(p.etag)}</ETag></Part>`)
    .join('')}</CompleteMultipartUpload>`;
  const res = await s3Client(config).fetch(`${r2ObjectUrl(config, fileKey)}?uploadId=${encodeURIComponent(uploadId)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/xml' },
    body,
  });
  if (!res.ok) {
    throw new Error(`R2 CompleteMultipartUpload failed: ${res.status} ${await res.text().catch(() => '')}`);
  }
}

export async function abortMultipartUpload(
  config: R2PresignConfig,
  fileKey: string,
  uploadId: string
): Promise<void> {
  if (!hasS3PresignConfig(config)) throw new TypeError('R2 S3 presign config is incomplete');
  const res = await s3Client(config).fetch(`${r2ObjectUrl(config, fileKey)}?uploadId=${encodeURIComponent(uploadId)}`, {
    method: 'DELETE',
  });
  if (!res.ok && res.status !== 404) {
    throw new Error(`R2 AbortMultipartUpload failed: ${res.status} ${await res.text().catch(() => '')}`);
  }
}

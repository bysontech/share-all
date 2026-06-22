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
  return !!(
    config.R2_ACCOUNT_ID?.trim() &&
    config.R2_ACCESS_KEY_ID?.trim() &&
    config.R2_SECRET_ACCESS_KEY?.trim() &&
    config.R2_BUCKET_NAME?.trim()
  );
}

export function r2SupportsPresignedPut(target: R2Bucket | R2PresignConfig): boolean {
  if (hasS3PresignConfig(target as R2PresignConfig)) return true;
  return typeof (target as R2WithPresign).createPresignedUrl === 'function';
}

export function envSupportsPresignedPut(env: Env): boolean {
  return r2SupportsPresignedPut(env);
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
  bucket: R2Bucket,
  fileKey: string,
  expirySeconds: number
): Promise<string> {
  const b = bucket as R2WithPresign;
  const create = b.createPresignedUrl;
  if (typeof create !== 'function') {
    throw new TypeError('R2Bucket.createPresignedUrl is not available');
  }
  const url = await create.call(b, 'GET', fileKey, { expiresIn: expirySeconds });
  return url;
}

import type { R2Bucket } from '@cloudflare/workers-types';

type R2WithPresign = R2Bucket & {
  createPresignedUrl?: (
    method: string,
    key: string,
    opts: { expiresIn: number; httpMetadata?: { contentType?: string } }
  ) => Promise<string>;
};

export function r2SupportsPresignedPut(bucket: R2Bucket): boolean {
  return typeof (bucket as R2WithPresign).createPresignedUrl === 'function';
}

export async function generatePresignedPutUrl(
  bucket: R2Bucket,
  fileKey: string,
  mimeType: string,
  expirySeconds: number
): Promise<string> {
  const b = bucket as R2WithPresign;
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

import type { R2Bucket } from '@cloudflare/workers-types';

export async function generatePresignedPutUrl(
  bucket: R2Bucket,
  fileKey: string,
  mimeType: string,
  expirySeconds: number
): Promise<string> {
  // @ts-ignore – createPresignedUrl is available in Workers runtime
  const url = await bucket.createPresignedUrl('PUT', fileKey, {
    expiresIn: expirySeconds,
    httpMetadata: { contentType: mimeType },
  });
  return url;
}

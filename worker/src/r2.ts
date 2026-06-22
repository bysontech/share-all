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

const SERVICE = 's3';
const REGION = 'auto';
const UNSIGNED_PAYLOAD = 'UNSIGNED-PAYLOAD';

function hasS3PresignConfig(config: R2PresignConfig): boolean {
  return !!(
    config.R2_ACCOUNT_ID?.trim() &&
    config.R2_ACCESS_KEY_ID?.trim() &&
    config.R2_SECRET_ACCESS_KEY?.trim() &&
    config.R2_BUCKET_NAME?.trim()
  );
}

export function r2SupportsPresignedPut(target: R2Bucket | R2PresignConfig): boolean {
  if ('R2_ACCOUNT_ID' in target) return hasS3PresignConfig(target);
  return typeof (target as R2WithPresign).createPresignedUrl === 'function';
}

function toHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function encodePathSegment(segment: string): string {
  return encodeURIComponent(segment).replace(/[!'()*]/g, (c) =>
    `%${c.charCodeAt(0).toString(16).toUpperCase()}`
  );
}

function encodeQueryValue(value: string): string {
  return encodePathSegment(value).replace(/%7E/g, '~');
}

async function hmacRaw(key: ArrayBuffer | Uint8Array, data: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  return crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(data));
}

async function hmacHex(key: ArrayBuffer | Uint8Array, data: string): Promise<string> {
  return toHex(await hmacRaw(key, data));
}

async function sha256Hex(data: string): Promise<string> {
  return toHex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data)));
}

async function getSigningKey(secretAccessKey: string, dateStamp: string): Promise<ArrayBuffer> {
  const kDate = await hmacRaw(new TextEncoder().encode(`AWS4${secretAccessKey}`), dateStamp);
  const kRegion = await hmacRaw(kDate, REGION);
  const kService = await hmacRaw(kRegion, SERVICE);
  return hmacRaw(kService, 'aws4_request');
}

function formatAmzDate(now = new Date()): { amzDate: string; dateStamp: string } {
  const iso = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  return {
    amzDate: iso,
    dateStamp: iso.slice(0, 8),
  };
}

async function generateS3PresignedPutUrl(
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
  const host = `${accountId}.r2.cloudflarestorage.com`;
  const { amzDate, dateStamp } = formatAmzDate();
  const credentialScope = `${dateStamp}/${REGION}/${SERVICE}/aws4_request`;
  const credential = `${accessKeyId}/${credentialScope}`;
  const canonicalUri = `/${encodePathSegment(bucketName)}/${fileKey.split('/').map(encodePathSegment).join('/')}`;

  const params: [string, string][] = [
    ['X-Amz-Algorithm', 'AWS4-HMAC-SHA256'],
    ['X-Amz-Content-Sha256', UNSIGNED_PAYLOAD],
    ['X-Amz-Credential', credential],
    ['X-Amz-Date', amzDate],
    ['X-Amz-Expires', String(expirySeconds)],
    ['X-Amz-SignedHeaders', 'host'],
  ];
  const canonicalQueryString = params
    .map(([k, v]) => `${encodeQueryValue(k)}=${encodeQueryValue(v)}`)
    .sort()
    .join('&');
  const canonicalHeaders = `host:${host}\n`;
  const canonicalRequest = [
    'PUT',
    canonicalUri,
    canonicalQueryString,
    canonicalHeaders,
    'host',
    UNSIGNED_PAYLOAD,
  ].join('\n');
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    await sha256Hex(canonicalRequest),
  ].join('\n');
  const signingKey = await getSigningKey(secretAccessKey, dateStamp);
  const signature = await hmacHex(signingKey, stringToSign);

  return `https://${host}${canonicalUri}?${canonicalQueryString}&X-Amz-Signature=${signature}`;
}

export async function generatePresignedPutUrl(
  target: R2Bucket | R2PresignConfig,
  fileKey: string,
  mimeType: string,
  expirySeconds: number
): Promise<string> {
  if ('R2_ACCOUNT_ID' in target) {
    return generateS3PresignedPutUrl(target, fileKey, expirySeconds);
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

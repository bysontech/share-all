/**
 * Cloudflare Image Transformations (cdn-cgi/image) URL builder.
 * Source must be an absolute HTTPS URL reachable by the zone (e.g. Worker view-file with token).
 * Does not use Cloudflare Images Storage / Upload API.
 */
export function buildCdnCgiImageUrl(
  zoneOrigin: string,
  sourceAbsoluteUrl: string,
  opts: { width?: number; format?: string } = {}
): string {
  const width = opts.width ?? 1600;
  const format = opts.format ?? 'webp';
  const base = zoneOrigin.replace(/\/$/, '');
  const options = `width=${width},format=${format},fit=scale-down`;
  return `${base}/cdn-cgi/image/${options}/${encodeURIComponent(sourceAbsoluteUrl)}`;
}

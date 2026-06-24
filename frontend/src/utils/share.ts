/** True when the Web Share API is available on this browser. */
export function isShareSupported(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.share === 'function';
}

/**
 * Fetches the media at `url`, then offers it through the native share sheet.
 * Returns true if the share sheet was opened (including if the user cancelled
 * it) or false if sharing isn't possible here, so callers can fall back to a
 * normal download.
 */
export async function shareMedia(url: string, filename: string, mimeType: string): Promise<boolean> {
  if (!isShareSupported()) return false;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('fetch failed');
    const blob = await res.blob();
    const file = new File([blob], filename, { type: mimeType });
    const shareData: ShareData = { files: [file] };
    if (navigator.canShare && !navigator.canShare(shareData)) return false;
    await navigator.share(shareData);
    return true;
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return true;
    return false;
  }
}

/**
 * Shares a URL via the Web Share API instead of a File — used for video, where
 * fetching the file into a Blob would hit CORS on R2 presigned URLs and be slow
 * for large files. The shared link is a presigned R2 URL, so it expires; that's
 * an accepted tradeoff rather than something this function can fix.
 */
export async function shareVideoUrl(url: string, title: string): Promise<boolean> {
  if (!isShareSupported()) return false;
  try {
    const shareData: ShareData = { title, url };
    if (navigator.canShare && !navigator.canShare(shareData)) return false;
    await navigator.share(shareData);
    return true;
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return true;
    return false;
  }
}

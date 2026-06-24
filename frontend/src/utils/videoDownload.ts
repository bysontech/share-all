/**
 * Opens a (typically R2 presigned) URL directly in a new tab so the browser/OS
 * handles the actual save. Video files must never be fetched into a Blob here —
 * presigned R2 URLs aren't CORS-enabled for cross-origin fetch, and large video
 * files would be slow/memory-heavy to buffer client-side anyway.
 */
export function openVideoUrl(url: string): void {
  const a = document.createElement('a');
  a.href = url;
  a.target = '_blank';
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

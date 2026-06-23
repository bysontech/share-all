export function isMobileDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  if (/iPhone|iPod|iPad|Android/i.test(ua)) return true;
  // iPadOS 13+ Safari reports a Mac-like UA string; detect via touch support.
  if (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1) return true;
  return false;
}

export function isDesktopDevice(): boolean {
  return !isMobileDevice();
}

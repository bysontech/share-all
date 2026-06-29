const VIDEO_THUMB_DIM = 480;
const VIDEO_THUMB_TIMEOUT_MS = 15_000;

/** Generates a WebP thumbnail from a video file via a hidden <video> + canvas frame grab. */
export function generateVideoThumbnail(file: File): Promise<{ blob: Blob; mimeType: string } | null> {
  return new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'metadata';

    let settled = false;
    function finish(result: { blob: Blob; mimeType: string } | null) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      URL.revokeObjectURL(objectUrl);
      video.src = '';
      resolve(result);
    }

    const timer = setTimeout(() => finish(null), VIDEO_THUMB_TIMEOUT_MS);

    video.addEventListener('error', () => finish(null));

    video.addEventListener('loadedmetadata', () => {
      // seek to 1 s, or 10 % of duration if shorter
      const seekTo = video.duration > 0 ? Math.min(1, video.duration * 0.1) : 0;
      video.currentTime = seekTo;
    });

    video.addEventListener('seeked', () => {
      try {
        const vw = video.videoWidth;
        const vh = video.videoHeight;
        if (!vw || !vh) { finish(null); return; }

        let w = vw;
        let h = vh;
        if (w > VIDEO_THUMB_DIM || h > VIDEO_THUMB_DIM) {
          const scale = VIDEO_THUMB_DIM / Math.max(w, h);
          w = Math.round(w * scale);
          h = Math.round(h * scale);
        }

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) { finish(null); return; }
        ctx.drawImage(video, 0, 0, w, h);

        canvas.toBlob(
          (blob) => finish(blob ? { blob, mimeType: 'image/webp' } : null),
          'image/webp',
          0.8
        );
      } catch {
        finish(null);
      }
    });

    video.src = objectUrl;
  });
}

import JSZip from 'jszip';

/** At or above this count, PC downloads switch from individual files to a single ZIP. */
export const ZIP_THRESHOLD = 10;
/** Maximum number of photos that can be saved at once (individually or via ZIP). */
export const ZIP_MAX_COUNT = 100;

export type ZipPhase = 'fetching' | 'zipping' | 'done';

export interface ZipProgress {
  phase: ZipPhase;
  current: number;
  total: number;
}

export interface ZipTarget {
  url: string;
  filename: string;
}

/** Fetches each target as a Blob, packs them into a ZIP, and triggers a single download. */
export async function downloadAsZip(
  targets: ZipTarget[],
  zipFilename: string,
  onProgress?: (progress: ZipProgress) => void
): Promise<{ succeeded: number; failed: number }> {
  const zip = new JSZip();
  let succeeded = 0;
  let failed = 0;

  for (const [index, target] of targets.entries()) {
    onProgress?.({ phase: 'fetching', current: index, total: targets.length });
    try {
      const res = await fetch(target.url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      zip.file(target.filename, blob);
      succeeded++;
    } catch {
      failed++;
    }
  }
  onProgress?.({ phase: 'fetching', current: targets.length, total: targets.length });

  onProgress?.({ phase: 'zipping', current: 0, total: 1 });
  const content = await zip.generateAsync({ type: 'blob' });

  const a = document.createElement('a');
  a.href = URL.createObjectURL(content);
  a.download = zipFilename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(a.href);

  onProgress?.({ phase: 'done', current: 1, total: 1 });
  return { succeeded, failed };
}

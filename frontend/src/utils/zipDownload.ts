import JSZip from 'jszip';

/** At or above this count, PC downloads switch from individual files to a single ZIP. */
export const ZIP_THRESHOLD = 10;
/** Maximum number of photos that can be saved at once (individually or via ZIP). */
export const ZIP_MAX_COUNT = 100;

export type ZipPhase = 'preparing' | 'fetching' | 'zipping' | 'done' | 'error';

export interface ZipProgress {
  phase: ZipPhase;
  current: number;
  total: number;
  percent?: number;
}

export interface ZipTarget {
  url: string;
  filename: string;
}

/** Page-level save progress; `phase` is optional to support the bare per-file counter used outside ZIP flows. */
export interface SaveProgress {
  phase?: ZipPhase;
  current: number;
  total: number;
  percent?: number;
  cancellable?: boolean;
}

/** Renders a single human-readable status line for any SaveProgress/ZipProgress state. */
export function formatSaveProgress(p: SaveProgress): string {
  switch (p.phase) {
    case 'preparing': return '保存準備中...';
    case 'fetching': return `画像を取得中 ${p.current} / ${p.total}`;
    case 'zipping': return p.percent != null ? `ZIPを作成中... ${p.percent}%` : 'ZIPを作成中...';
    case 'done': return '保存を開始しました';
    case 'error': return '保存に失敗しました。もう一度お試しください。';
    default: return `保存中... ${p.current} / ${p.total}`;
  }
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

  onProgress?.({ phase: 'zipping', current: 0, total: 1, percent: 0 });
  let content: Blob;
  try {
    content = await zip.generateAsync({ type: 'blob' }, (metadata) => {
      onProgress?.({ phase: 'zipping', current: 0, total: 1, percent: Math.round(metadata.percent) });
    });
  } catch {
    onProgress?.({ phase: 'error', current: 0, total: 1 });
    return { succeeded: 0, failed: targets.length };
  }

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

import { useState, useCallback, useRef } from 'react';
import { api, putToR2, ApiError } from '../api/client';
import type { Post } from '../api/client';
import { generateVideoThumbnail } from '../utils/videoThumbnail';

export type UploadItemStatus = 'pending' | 'uploading' | 'completing' | 'done' | 'error';

export interface QueueItem {
  id: string;
  file: File;
  status: UploadItemStatus;
  error?: string;
  postId?: string;
  uploadUrl?: string;
  retryCount: number;
  uploadedBytes: number;
  totalBytes: number;
}

export const MAX_RETRIES = 3;
const MAX_CONCURRENT = 3;
const MAX_VIDEO_CONCURRENT = 1;
const MAX_DISPLAY_DIM = 2048;

// ── Canvas-based display WebP for images ──
async function generateDisplayWebP(file: File): Promise<{ blob: Blob; mimeType: string } | null> {
  try {
    let bitmap: ImageBitmap;
    try {
      bitmap = await createImageBitmap(file);
    } catch {
      return null; // HEIC or other unsupported format
    }

    let { width, height } = bitmap;
    if (width > MAX_DISPLAY_DIM || height > MAX_DISPLAY_DIM) {
      const scale = MAX_DISPLAY_DIM / Math.max(width, height);
      width = Math.round(width * scale);
      height = Math.round(height * scale);
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) { bitmap.close(); return null; }
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    return new Promise((resolve) => {
      canvas.toBlob(
        (blob) => resolve(blob ? { blob, mimeType: 'image/webp' } : null),
        'image/webp',
        0.85
      );
    });
  } catch {
    return null;
  }
}

interface UseUploadQueueOptions {
  roomId: string;
  nickname: string;
  participantId?: string;
  postPurpose?: 'slideshow' | 'album' | 'video';
  onPostComplete?: (post: Post) => void;
}

export function useUploadQueue({ roomId, nickname, participantId, postPurpose, onPostComplete }: UseUploadQueueOptions) {
  const [items, setItems] = useState<QueueItem[]>([]);
  const runningRef = useRef(0);
  const runningVideosRef = useRef(0);
  const queueRef = useRef<string[]>([]);
  const itemsRef = useRef<Map<string, QueueItem>>(new Map());

  const updateItem = useCallback((id: string, patch: Partial<QueueItem>) => {
    setItems((prev) => {
      const next = prev.map((it) => (it.id === id ? { ...it, ...patch } : it));
      const updated = next.find((it) => it.id === id);
      if (updated) itemsRef.current.set(id, updated);
      return next;
    });
  }, []);

  // drainQueue is declared via ref so processItem can call it without a closure cycle
  const drainQueueRef = useRef<() => void>(() => {});

  const processItem = useCallback(
    async (id: string) => {
      const item = itemsRef.current.get(id);
      if (!item || item.status !== 'pending') return;

      const isVideo = item.file.type.startsWith('video/');
      runningRef.current += 1;
      if (isVideo) runningVideosRef.current += 1;
      updateItem(id, { status: 'uploading' });

      let postId = item.postId;
      try {
        let uploadUrl = item.uploadUrl;

        if (!uploadUrl || !postId) {
          const res = await api.getUploadUrl(roomId, {
            nickname,
            fileName: item.file.name,
            mimeType: item.file.type,
            fileSize: item.file.size,
            postPurpose,
            participantId: postPurpose === 'slideshow' ? participantId : undefined,
          });
          postId = res.postId;
          uploadUrl = res.uploadUrl;
          updateItem(id, { postId, uploadUrl });
        }

        await putToR2(uploadUrl, item.file, (loaded, total) => {
          updateItem(id, { uploadedBytes: loaded, totalBytes: total });
        });

        // HEIC/HEIF: display is handled server-side via Image Transformations
        const isHeicUpload = item.file.type === 'image/heic' || item.file.type === 'image/heif';

        // Display WebP for non-HEIC images
        let displayFileKey: string | undefined;
        let displayMimeType: string | undefined;
        if (postId && !isHeicUpload && !isVideo) {
          const display = await generateDisplayWebP(item.file);
          if (display) {
            try {
              const displayRes = await api.getUploadUrl(roomId, {
                nickname,
                fileName: `${postId}.webp`,
                mimeType: display.mimeType,
                fileSize: display.blob.size,
                uploadType: 'display',
                postId,
              });
              await putToR2(displayRes.uploadUrl, display.blob);
              displayFileKey = displayRes.fileKey;
              displayMimeType = display.mimeType;
            } catch {
              // non-fatal: display WebP failure does not block the upload
            }
          }
        }

        // Video thumbnail generation
        let thumbnailFileKey: string | undefined;
        let thumbnailMimeType: string | undefined;
        if (postId && isVideo) {
          try {
            const thumb = await generateVideoThumbnail(item.file);
            if (thumb) {
              const thumbRes = await api.getUploadUrl(roomId, {
                nickname,
                fileName: `${postId}.webp`,
                mimeType: thumb.mimeType,
                fileSize: thumb.blob.size,
                uploadType: 'thumbnail',
                postId,
              });
              await putToR2(thumbRes.uploadUrl, thumb.blob);
              thumbnailFileKey = thumbRes.fileKey;
              thumbnailMimeType = thumb.mimeType;
            }
          } catch {
            // non-fatal: thumbnail failure does not block the upload
          }
        }

        updateItem(id, { status: 'completing' });
        await api.completeUpload(roomId, postId!, {
          participantId,
          displayFileKey,
          displayMimeType,
          thumbnailFileKey,
          thumbnailMimeType,
        });

        updateItem(id, { status: 'done' });
        onPostComplete?.({
          id: postId!,
          nickname,
          file_type: isVideo ? 'video' : 'image',
          file_key: '',
          mime_type: item.file.type,
          file_size: item.file.size,
          created_at: Math.floor(Date.now() / 1000),
          sort_order: null,
          participant_id: participantId ?? null,
          display_file_key: displayFileKey ?? null,
          post_purpose: postPurpose ?? 'album',
        });
      } catch (e) {
        const msg = e instanceof ApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : 'アップロードに失敗しました';
        updateItem(id, { status: 'error', error: msg });
        if (postId) {
          await api.failUpload(roomId, postId).catch(() => {});
        }
      } finally {
        runningRef.current -= 1;
        if (isVideo) runningVideosRef.current -= 1;
        drainQueueRef.current();
      }
    },
    [roomId, nickname, participantId, postPurpose, onPostComplete, updateItem]
  );

  const drainQueue = useCallback(() => {
    // Scan the queue in order; skip a video item if the video slot is full
    let i = 0;
    while (runningRef.current < MAX_CONCURRENT && i < queueRef.current.length) {
      const nextId = queueRef.current[i];
      const item = itemsRef.current.get(nextId);
      const isVideoItem = item?.file.type.startsWith('video/') ?? false;

      if (isVideoItem && runningVideosRef.current >= MAX_VIDEO_CONCURRENT) {
        // Video slot full; look past this item for a non-video item
        i++;
        continue;
      }

      queueRef.current.splice(i, 1);
      processItem(nextId);
      // don't increment i — item was removed
    }
  }, [processItem]);

  // Keep the ref in sync so processItem's finally block can call the latest drainQueue
  drainQueueRef.current = drainQueue;

  const addFiles = useCallback(
    (files: File[]) => {
      const newItems: QueueItem[] = files.map((file) => ({
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        file,
        status: 'pending',
        retryCount: 0,
        uploadedBytes: 0,
        totalBytes: file.size,
      }));

      // itemsRef must be updated before drainQueue so processItem can find the items
      newItems.forEach((it) => itemsRef.current.set(it.id, it));
      setItems((prev) => [...prev, ...newItems]);

      newItems.forEach((it) => queueRef.current.push(it.id));
      drainQueue();
    },
    [drainQueue]
  );

  const retryItem = useCallback(
    (id: string) => {
      const item = itemsRef.current.get(id);
      if (!item || item.status !== 'error') return;
      if (item.retryCount >= MAX_RETRIES) return;
      const newRetryCount = item.retryCount + 1;
      const reset: QueueItem = {
        ...item,
        status: 'pending',
        error: undefined,
        postId: undefined,
        uploadUrl: undefined,
        retryCount: newRetryCount,
        uploadedBytes: 0,
      };
      itemsRef.current.set(id, reset);
      updateItem(id, { status: 'pending', error: undefined, postId: undefined, uploadUrl: undefined, retryCount: newRetryCount, uploadedBytes: 0 });
      queueRef.current.push(id);
      drainQueue();
    },
    [updateItem, drainQueue]
  );

  const clearDone = useCallback(() => {
    setItems((prev) => {
      const next = prev.filter((it) => it.status !== 'done');
      next.forEach((it) => itemsRef.current.set(it.id, it));
      return next;
    });
  }, []);

  const cancelPending = useCallback(() => {
    const pendingIds = new Set(queueRef.current);
    queueRef.current = [];
    setItems((prev) => {
      const next = prev.filter((it) => !pendingIds.has(it.id));
      pendingIds.forEach((id) => itemsRef.current.delete(id));
      return next;
    });
  }, []);

  const summary = {
    total: items.length,
    pending: items.filter((it) => it.status === 'pending').length,
    active: items.filter((it) => ['uploading', 'completing'].includes(it.status)).length,
    done: items.filter((it) => it.status === 'done').length,
    error: items.filter((it) => it.status === 'error').length,
    uploadedBytes: items.reduce((sum, it) => sum + it.uploadedBytes, 0),
    totalBytes: items.reduce((sum, it) => sum + it.totalBytes, 0),
  };

  return { items, addFiles, retryItem, clearDone, cancelPending, summary };
}

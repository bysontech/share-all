import { useState, useCallback, useRef } from 'react';
import { api, putToR2 } from '../api/client';
import type { Post } from '../api/client';

export type UploadItemStatus = 'pending' | 'uploading' | 'completing' | 'done' | 'error';

export interface QueueItem {
  id: string;
  file: File;
  status: UploadItemStatus;
  error?: string;
  postId?: string;
  uploadUrl?: string;
}

const MAX_CONCURRENT = 3;
const MAX_DISPLAY_DIM = 2048;

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
  onPostComplete?: (post: Post) => void;
}

export function useUploadQueue({ roomId, nickname, participantId, onPostComplete }: UseUploadQueueOptions) {
  const [items, setItems] = useState<QueueItem[]>([]);
  const runningRef = useRef(0);
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

  const processItem = useCallback(
    async (id: string) => {
      const item = itemsRef.current.get(id);
      if (!item || item.status !== 'pending') return;

      runningRef.current += 1;
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
          });
          postId = res.postId;
          uploadUrl = res.uploadUrl;
          updateItem(id, { postId, uploadUrl });
        }

        await putToR2(uploadUrl, item.file);

        // Try generating and uploading display WebP (non-fatal)
        let displayFileKey: string | undefined;
        let displayMimeType: string | undefined;
        if (postId) {
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

        updateItem(id, { status: 'completing' });
        await api.completeUpload(roomId, postId!, {
          participantId,
          displayFileKey,
          displayMimeType,
        });

        updateItem(id, { status: 'done' });
        onPostComplete?.({
          id: postId!,
          nickname,
          file_type: 'image',
          file_key: '',
          mime_type: item.file.type,
          created_at: Math.floor(Date.now() / 1000),
          sort_order: null,
          participant_id: participantId ?? null,
          display_file_key: displayFileKey ?? null,
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'アップロードに失敗しました';
        updateItem(id, { status: 'error', error: msg });
        if (postId) {
          await api.failUpload(roomId, postId).catch(() => {});
        }
      } finally {
        runningRef.current -= 1;
        drainQueue();
      }
    },
    [roomId, nickname, participantId, onPostComplete, updateItem]
  );

  const drainQueue = useCallback(() => {
    while (runningRef.current < MAX_CONCURRENT && queueRef.current.length > 0) {
      const nextId = queueRef.current.shift()!;
      processItem(nextId);
    }
  }, [processItem]);

  const addFiles = useCallback(
    (files: File[]) => {
      const newItems: QueueItem[] = files.map((file) => ({
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        file,
        status: 'pending',
      }));

      // itemsRef は setItems の updater より先に同期する。遅れると drainQueue → processItem が
      // itemsRef にアイテムを見つけられず return し、キューからは既に shift 済みで永久に待機中のままになる。
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
      const reset: QueueItem = {
        ...item,
        status: 'pending',
        error: undefined,
        postId: undefined,
        uploadUrl: undefined,
      };
      itemsRef.current.set(id, reset);
      updateItem(id, { status: 'pending', error: undefined, postId: undefined, uploadUrl: undefined });
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

  const summary = {
    total: items.length,
    pending: items.filter((it) => it.status === 'pending').length,
    active: items.filter((it) => ['uploading', 'completing'].includes(it.status)).length,
    done: items.filter((it) => it.status === 'done').length,
    error: items.filter((it) => it.status === 'error').length,
  };

  return { items, addFiles, retryItem, clearDone, summary };
}

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

interface UseUploadQueueOptions {
  roomId: string;
  nickname: string;
  onPostComplete?: (post: Post) => void;
}

export function useUploadQueue({ roomId, nickname, onPostComplete }: UseUploadQueueOptions) {
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

        updateItem(id, { status: 'completing' });
        await api.completeUpload(roomId, postId);

        updateItem(id, { status: 'done' });
        onPostComplete?.({
          id: postId,
          nickname,
          file_type: 'image',
          file_key: '',
          mime_type: item.file.type,
          created_at: Math.floor(Date.now() / 1000),
          sort_order: null,
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
    [roomId, nickname, onPostComplete, updateItem]
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

      setItems((prev) => {
        const next = [...prev, ...newItems];
        newItems.forEach((it) => itemsRef.current.set(it.id, it));
        return next;
      });

      newItems.forEach((it) => queueRef.current.push(it.id));
      drainQueue();
    },
    [drainQueue]
  );

  const retryItem = useCallback(
    (id: string) => {
      const item = itemsRef.current.get(id);
      if (!item || item.status !== 'error') return;
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

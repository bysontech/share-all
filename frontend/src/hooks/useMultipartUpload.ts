import { useCallback, useRef, useState } from 'react';
import { api, multipartApi, putToR2, putPartToR2, ApiError } from '../api/client';
import type { Post } from '../api/client';
import { generateVideoThumbnail } from '../utils/videoThumbnail';

/** Cycle-27 spec: fixed implementation parameters (distinct from MAX_LARGE_VIDEO_SIZE_MB, which is server-side/env-driven). */
const PART_SIZE = 100 * 1024 * 1024; // 100MB per part
const MAX_PARALLEL_PARTS = 4;
const MAX_PART_RETRIES = 3;

const LARGE_VIDEO_MIMES = ['video/mp4', 'video/quicktime'] as const;

export type MultipartPartStatus = 'pending' | 'uploading' | 'retrying' | 'done' | 'error';

export interface MultipartPart {
  partNumber: number;
  start: number;
  end: number;
  size: number;
  status: MultipartPartStatus;
  uploadedBytes: number;
  retryCount: number;
  etag?: string;
}

export type MultipartItemStatus = 'pending' | 'uploading' | 'completing' | 'done' | 'error' | 'cancelled';

export interface MultipartItem {
  id: string;
  file: File;
  status: MultipartItemStatus;
  error?: string;
  postId?: string;
  fileKey?: string;
  uploadId?: string;
  parts: MultipartPart[];
  uploadedBytes: number;
  totalBytes: number;
}

class CancelledError extends Error {
  constructor() {
    super('cancelled');
  }
}

function splitParts(fileSize: number): MultipartPart[] {
  const parts: MultipartPart[] = [];
  let start = 0;
  let partNumber = 1;
  while (start < fileSize) {
    const end = Math.min(start + PART_SIZE, fileSize);
    parts.push({ partNumber, start, end, size: end - start, status: 'pending', uploadedBytes: 0, retryCount: 0 });
    start = end;
    partNumber++;
  }
  return parts;
}

export interface CompletedPart {
  partNumber: number;
  etag: string;
}

/**
 * partNumbers in 1..totalParts missing from a completed-parts map. This is the only
 * completion check in the hook — it reads a local Map, never React state, since a
 * fast XHR `load` can resolve before the corresponding setState has propagated back
 * through itemsRef.
 */
function findMissingPartNumbers(completedParts: Map<number, string>, totalParts: number): number[] {
  const missing: number[] = [];
  for (let partNumber = 1; partNumber <= totalParts; partNumber++) {
    const etag = completedParts.get(partNumber);
    if (!etag || !etag.trim()) missing.push(partNumber);
  }
  return missing;
}

interface UseMultipartUploadOptions {
  roomId: string;
  nickname: string;
  participantId?: string;
  onPostComplete?: (post: Post) => void;
}

export function useMultipartUpload({ roomId, nickname, participantId, onPostComplete }: UseMultipartUploadOptions) {
  const [items, setItems] = useState<MultipartItem[]>([]);
  const itemsRef = useRef<Map<string, MultipartItem>>(new Map());
  const queueRef = useRef<string[]>([]);
  const runningRef = useRef(false);
  const cancelledRef = useRef<Set<string>>(new Set());
  const activeXhrsRef = useRef<Map<string, Set<XMLHttpRequest>>>(new Map());
  const drainQueueRef = useRef<() => void>(() => {});

  const updateItem = useCallback((id: string, patch: Partial<MultipartItem>) => {
    setItems((prev) => {
      const next = prev.map((it) => (it.id === id ? { ...it, ...patch } : it));
      const updated = next.find((it) => it.id === id);
      if (updated) itemsRef.current.set(id, updated);
      return next;
    });
  }, []);

  const updatePart = useCallback((itemId: string, partNumber: number, patch: Partial<MultipartPart>) => {
    setItems((prev) => {
      const next = prev.map((it) => {
        if (it.id !== itemId) return it;
        const parts = it.parts.map((p) => (p.partNumber === partNumber ? { ...p, ...patch } : p));
        const uploadedBytes = parts.reduce((sum, p) => sum + p.uploadedBytes, 0);
        const updated = { ...it, parts, uploadedBytes };
        itemsRef.current.set(itemId, updated);
        return updated;
      });
      return next;
    });
  }, []);

  const registerXhr = useCallback((id: string, xhr: XMLHttpRequest) => {
    let set = activeXhrsRef.current.get(id);
    if (!set) {
      set = new Set();
      activeXhrsRef.current.set(id, set);
    }
    set.add(xhr);
  }, []);

  const unregisterXhr = useCallback((id: string, xhr: XMLHttpRequest) => {
    activeXhrsRef.current.get(id)?.delete(xhr);
  }, []);

  const uploadOnePart = useCallback(
    async (id: string, postId: string, fileKey: string, uploadId: string, partNumber: number): Promise<string> => {
      const item = itemsRef.current.get(id);
      const part = item?.parts.find((p) => p.partNumber === partNumber);
      if (!item || !part) throw new Error(`パート${partNumber}の情報が見つかりません`);
      const blob = item.file.slice(part.start, part.end);
      const maxAttempts = MAX_PART_RETRIES + 1;
      let lastError: Error = new Error('Part upload failed');

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        if (cancelledRef.current.has(id)) throw new CancelledError();
        updatePart(id, partNumber, {
          status: attempt > 1 ? 'retrying' : 'uploading',
          uploadedBytes: 0,
          retryCount: attempt - 1,
        });

        let xhrRef: XMLHttpRequest | undefined;
        try {
          const { uploadUrl } = await multipartApi.partUrl(roomId, { postId, fileKey, uploadId, partNumber });
          if (cancelledRef.current.has(id)) throw new CancelledError();

          const etag = await putPartToR2(
            uploadUrl,
            blob,
            (loaded) => updatePart(id, partNumber, { uploadedBytes: loaded }),
            (xhr) => {
              xhrRef = xhr;
              registerXhr(id, xhr);
            }
          );

          // This setState is for UI display only. The returned etag (not this state
          // update) is what the caller treats as the completion source of truth.
          updatePart(id, partNumber, { status: 'done', uploadedBytes: part.size, etag });
          return etag;
        } catch (e) {
          if (e instanceof CancelledError) throw e;
          lastError = e instanceof Error ? e : new Error('Part upload failed');
        } finally {
          if (xhrRef) unregisterXhr(id, xhrRef);
        }
      }

      updatePart(id, partNumber, { status: 'error' });
      throw lastError;
    },
    [roomId, updatePart, registerXhr, unregisterXhr]
  );

  const uploadAllParts = useCallback(
    async (id: string, postId: string, fileKey: string, uploadId: string): Promise<Map<number, string>> => {
      const item = itemsRef.current.get(id);
      if (!item) return new Map();
      const totalParts = item.parts.length;
      // Completion source of truth: a plain local Map written synchronously the moment
      // each part's upload promise resolves. React state (parts/itemsRef) is UI display
      // only — a fast XHR `load` can resolve before the corresponding setState has
      // propagated back through itemsRef, so completion must never be read back from state.
      const completedParts = new Map<number, string>();
      let cursor = 0;
      let firstError: Error | null = null;

      async function worker() {
        while (true) {
          if (cancelledRef.current.has(id) || firstError) return;
          const idx = cursor++;
          if (idx >= totalParts) return;
          const partNumber = idx + 1;
          try {
            const etag = await uploadOnePart(id, postId, fileKey, uploadId, partNumber);
            completedParts.set(partNumber, etag);
          } catch (e) {
            if (e instanceof CancelledError) return;
            if (!firstError) firstError = e instanceof Error ? e : new Error('Part upload failed');
          }
        }
      }

      const workerCount = Math.min(MAX_PARALLEL_PARTS, totalParts);
      await Promise.all(Array.from({ length: workerCount }, () => worker()));

      if (cancelledRef.current.has(id)) throw new CancelledError();
      if (firstError) throw firstError;

      const missing = findMissingPartNumbers(completedParts, totalParts);
      if (missing.length > 0) {
        console.error('[multipart] uploadAllParts: parts missing from local map', { id, missing });
        throw new Error(`アップロードが未完了のパートがあります: ${missing.join(', ')}`);
      }

      return completedParts;
    },
    [uploadOnePart]
  );

  const processItem = useCallback(
    async (id: string) => {
      const item = itemsRef.current.get(id);
      if (!item || item.status !== 'pending') return;
      runningRef.current = true;
      updateItem(id, { status: 'uploading' });

      let postId = item.postId;
      let fileKey = item.fileKey;
      let uploadId = item.uploadId;

      try {
        if (!postId || !fileKey || !uploadId) {
          const res = await multipartApi.start(roomId, {
            nickname,
            fileName: item.file.name,
            mimeType: item.file.type,
            fileSize: item.file.size,
          });
          postId = res.postId;
          fileKey = res.fileKey;
          uploadId = res.uploadId;
          updateItem(id, { postId, fileKey, uploadId });
        }

        if (cancelledRef.current.has(id)) throw new CancelledError();

        const completedEtags = await uploadAllParts(id, postId, fileKey, uploadId);

        if (cancelledRef.current.has(id)) throw new CancelledError();

        // Completion is decided purely from the local completedEtags map returned by
        // uploadAllParts — never from React state — since concurrent XHR completions can
        // outrun the setState/re-render that itemsRef mirrors. Never advance to 'completing'
        // (and never call multipart/complete) while any partNumber is missing from the map.
        const totalParts = item.parts.length;
        const parts: CompletedPart[] = [];
        for (let partNumber = 1; partNumber <= totalParts; partNumber++) {
          const etag = completedEtags.get(partNumber);
          if (!etag) {
            console.error('[multipart] complete blocked: part missing from local map', { id, partNumber });
            throw new Error(`未完了のパートがあります: ${partNumber}`);
          }
          parts.push({ partNumber, etag });
        }

        updateItem(id, { status: 'completing' });

        await multipartApi.complete(roomId, { postId, fileKey, uploadId, parts });

        // Video thumbnail: best-effort, same flow as normal video upload — failure does not block.
        let thumbnailFileKey: string | undefined;
        let thumbnailMimeType: string | undefined;
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
          // non-fatal
        }

        // Existing /complete endpoint: same DB finalization as normal video upload.
        await api.completeUpload(roomId, postId, { participantId, thumbnailFileKey, thumbnailMimeType });

        updateItem(id, { status: 'done' });
        onPostComplete?.({
          id: postId,
          nickname,
          file_type: 'video',
          file_key: fileKey,
          mime_type: item.file.type,
          file_size: item.file.size,
          created_at: Math.floor(Date.now() / 1000),
          sort_order: null,
          participant_id: participantId ?? null,
          display_file_key: null,
          post_purpose: 'video',
        });
      } catch (e) {
        if (e instanceof CancelledError || cancelledRef.current.has(id)) {
          updateItem(id, { status: 'cancelled' });
        } else {
          const msg = e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'アップロードに失敗しました';
          updateItem(id, { status: 'error', error: msg });
        }
        // Best-effort: free the R2-side multipart session so it doesn't linger.
        if (postId && fileKey && uploadId) {
          multipartApi.abort(roomId, { postId, fileKey, uploadId }).catch(() => {});
        }
      } finally {
        cancelledRef.current.delete(id);
        activeXhrsRef.current.delete(id);
        runningRef.current = false;
        drainQueueRef.current();
      }
    },
    [roomId, nickname, participantId, onPostComplete, updateItem, uploadAllParts]
  );

  const drainQueue = useCallback(() => {
    if (runningRef.current) return;
    const nextId = queueRef.current.shift();
    if (!nextId) return;
    processItem(nextId);
  }, [processItem]);

  drainQueueRef.current = drainQueue;

  const addFiles = useCallback(
    (files: File[]) => {
      const accepted = files.filter(
        (f) => f.size > 0 && (LARGE_VIDEO_MIMES as readonly string[]).includes(f.type)
      );
      if (!accepted.length) return;

      const newItems: MultipartItem[] = accepted.map((file) => ({
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        file,
        status: 'pending',
        parts: splitParts(file.size),
        uploadedBytes: 0,
        totalBytes: file.size,
      }));

      newItems.forEach((it) => itemsRef.current.set(it.id, it));
      setItems((prev) => [...prev, ...newItems]);
      newItems.forEach((it) => queueRef.current.push(it.id));
      drainQueue();
    },
    [drainQueue]
  );

  const cancelItem = useCallback((id: string) => {
    const item = itemsRef.current.get(id);
    if (!item) return;
    if (item.status === 'done' || item.status === 'cancelled' || item.status === 'completing') return;

    cancelledRef.current.add(id);
    queueRef.current = queueRef.current.filter((qid) => qid !== id);

    const xhrs = activeXhrsRef.current.get(id);
    if (xhrs) {
      xhrs.forEach((xhr) => xhr.abort());
      xhrs.clear();
    }

    if (item.status === 'pending') {
      updateItem(id, { status: 'cancelled' });
    }
    // 'uploading' items are caught by processItem's cancellation checks, which mark
    // the item cancelled and call multipart/abort once the in-flight await unwinds.
  }, [updateItem]);

  const clearDone = useCallback(() => {
    setItems((prev) => {
      const next = prev.filter((it) => it.status !== 'done' && it.status !== 'cancelled');
      next.forEach((it) => itemsRef.current.set(it.id, it));
      return next;
    });
  }, []);

  const summary = {
    total: items.length,
    pending: items.filter((it) => it.status === 'pending').length,
    active: items.filter((it) => it.status === 'uploading' || it.status === 'completing').length,
    done: items.filter((it) => it.status === 'done').length,
    error: items.filter((it) => it.status === 'error').length,
    cancelled: items.filter((it) => it.status === 'cancelled').length,
    uploadedBytes: items.reduce((sum, it) => sum + it.uploadedBytes, 0),
    totalBytes: items.reduce((sum, it) => sum + it.totalBytes, 0),
  };

  return { items, addFiles, cancelItem, clearDone, summary };
}

/// <reference types="vite/client" />
import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../api/client';
import type { Post } from '../api/client';

// Backoff steps (ms): reset to 5s on new posts, step up when idle
const BACKOFF_STEPS_MS = [5_000, 10_000, 15_000, 30_000];
const TAB_HIDDEN_MS = 60_000;

export function usePostsPolling(roomId: string | undefined) {
  const [posts, setPosts] = useState<Post[]>([]);
  const [error, setError] = useState('');
  const serverTimeRef = useRef<number | undefined>(undefined);
  const idSetRef = useRef<Set<string>>(new Set());
  const backoffStepRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelledRef = useRef(false);
  const fetchingRef = useRef(false);

  // Returns true when at least one new post was added
  const mergePosts = useCallback((incoming: Post[]): boolean => {
    const newOnes = incoming.filter((p) => !idSetRef.current.has(p.id));
    if (newOnes.length === 0) return false;
    newOnes.forEach((p) => idSetRef.current.add(p.id));
    setPosts((prev) => [...prev, ...newOnes].sort((a, b) => a.created_at - b.created_at));
    return true;
  }, []);

  const addPost = useCallback((post: Post) => {
    if (idSetRef.current.has(post.id)) return;
    idSetRef.current.add(post.id);
    setPosts((prev) => [...prev, post].sort((a, b) => a.created_at - b.created_at));
  }, []);

  useEffect(() => {
    if (!roomId) return;

    cancelledRef.current = false;
    fetchingRef.current = false;
    backoffStepRef.current = 0;
    serverTimeRef.current = undefined;

    function nextDelay(): number {
      if (document.visibilityState === 'hidden') return TAB_HIDDEN_MS;
      return BACKOFF_STEPS_MS[Math.min(backoffStepRef.current, BACKOFF_STEPS_MS.length - 1)];
    }

    async function fetchPosts() {
      if (cancelledRef.current || fetchingRef.current) return;
      fetchingRef.current = true;
      const t0 = Date.now();
      try {
        const res = await api.getPosts(roomId!, serverTimeRef.current);
        if (cancelledRef.current) return;

        const hadNew = mergePosts(res.posts);
        serverTimeRef.current = res.serverTime;
        setError('');

        if (hadNew) {
          backoffStepRef.current = 0;
        } else {
          backoffStepRef.current = Math.min(backoffStepRef.current + 1, BACKOFF_STEPS_MS.length - 1);
        }

        if (import.meta.env.DEV) {
          const elapsed = Date.now() - t0;
          const delay = nextDelay();
          console.debug(`[poll] ${elapsed}ms, next=${delay / 1000}s, step=${backoffStepRef.current}, new=${hadNew}`);
        }
      } catch (_e) {
        if (!cancelledRef.current) {
          setError('投稿一覧の取得に失敗しました（次回自動更新で再試行します）');
        }
      } finally {
        fetchingRef.current = false;
      }

      if (!cancelledRef.current) {
        timerRef.current = setTimeout(fetchPosts, nextDelay());
      }
    }

    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') {
        // Tab revealed: cancel pending timer, reset backoff, fetch immediately
        if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
        backoffStepRef.current = 0;
        fetchPosts();
      } else {
        // Tab hidden: extend pending timer to 60s to reduce background load
        if (timerRef.current) {
          clearTimeout(timerRef.current);
          timerRef.current = setTimeout(fetchPosts, TAB_HIDDEN_MS);
        }
      }
    }

    // Kick off first fetch immediately
    fetchPosts();
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      cancelledRef.current = true;
      if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [roomId, mergePosts]);

  return { posts, error, addPost };
}

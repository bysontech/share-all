import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../api/client';
import type { Post } from '../api/client';

const POLL_INTERVAL_MS = 5000;

export function usePostsPolling(roomId: string | undefined) {
  const [posts, setPosts] = useState<Post[]>([]);
  const [error, setError] = useState('');
  const serverTimeRef = useRef<number | undefined>(undefined);
  const idSetRef = useRef<Set<string>>(new Set());

  const mergePosts = useCallback((incoming: Post[]) => {
    const newOnes = incoming.filter((p) => !idSetRef.current.has(p.id));
    if (newOnes.length === 0) return;
    newOnes.forEach((p) => idSetRef.current.add(p.id));
    setPosts((prev) => [...prev, ...newOnes].sort((a, b) => a.created_at - b.created_at));
  }, []);

  const addPost = useCallback(
    (post: Post) => {
      if (idSetRef.current.has(post.id)) return;
      idSetRef.current.add(post.id);
      setPosts((prev) => [...prev, post].sort((a, b) => a.created_at - b.created_at));
    },
    []
  );

  useEffect(() => {
    if (!roomId) return;

    let cancelled = false;

    async function fetchPosts(since?: number) {
      if (!roomId || cancelled) return;
      try {
        const res = await api.getPosts(roomId, since);
        if (!cancelled) {
          mergePosts(res.posts);
          serverTimeRef.current = res.serverTime;
          setError('');
        }
      } catch (_e) {
        if (!cancelled) setError('投稿一覧の取得に失敗しました（次回自動更新で再試行します）');
      }
    }

    fetchPosts();

    const timer = setInterval(() => {
      fetchPosts(serverTimeRef.current);
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [roomId, mergePosts]);

  return { posts, error, addPost };
}

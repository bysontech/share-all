import type { Post } from '../api/client';

/** Posts newer than this are considered "Fresh"; older posts are "Archive". */
export const FRESH_WINDOW_SEC = 30 * 60;
/** Target probability of drawing from the Fresh pool on each pick. */
export const FRESH_RATIO = 0.7;
/** How many recently-shown post ids to remember and avoid repeating. */
export const RECENTLY_DISPLAYED_LIMIT = 50;
/** How many recent participants to remember and avoid showing back-to-back. */
export const RECENT_PARTICIPANT_LIMIT = 3;
/** Width of the "top candidates" window used for light randomization within a pool. */
const RANDOM_TOP_K = 3;

export interface DisplayHistory {
  recentlyDisplayedIds: string[];
  recentParticipantIds: (string | null)[];
}

export function createDisplayHistory(): DisplayHistory {
  return { recentlyDisplayedIds: [], recentParticipantIds: [] };
}

export function recordDisplayed(history: DisplayHistory, post: Post): DisplayHistory {
  return {
    recentlyDisplayedIds: [...history.recentlyDisplayedIds, post.id].slice(-RECENTLY_DISPLAYED_LIMIT),
    recentParticipantIds: [...history.recentParticipantIds, post.participant_id].slice(
      -RECENT_PARTICIPANT_LIMIT
    ),
  };
}

export function partitionFreshArchive(
  posts: Post[],
  nowSec: number
): { fresh: Post[]; archive: Post[] } {
  const fresh: Post[] = [];
  const archive: Post[] = [];
  for (const p of posts) {
    if (nowSec - p.created_at <= FRESH_WINDOW_SEC) fresh.push(p);
    else archive.push(p);
  }
  return { fresh, archive };
}

/** Picks one post out of a pool already filtered to a tier, with light randomization. */
function pickFiltered(pool: Post[], filter: (p: Post) => boolean, orderMode: string): Post | null {
  const tier = pool.filter(filter);
  if (tier.length === 0) return null;
  const sorted = [...tier].sort((a, b) =>
    orderMode === 'desc' ? b.created_at - a.created_at : a.created_at - b.created_at
  );
  const k = Math.min(RANDOM_TOP_K, sorted.length);
  return sorted[Math.floor(Math.random() * k)];
}

/**
 * Draws the next post to display from the full candidate pool, biased
 * ~70/30 toward Fresh (created within the last 30 min) over Archive.
 *
 * Candidates are filtered through progressively looser tiers — (1) not
 * recently shown and not a recent participant, (2) not recently shown,
 * (3) not the immediately-previous post, (4) anything — trying the
 * preferred pool then the other pool *within each tier* before relaxing.
 * This keeps the immediate-repeat guard effective even when the preferred
 * pool only has one item (e.g. exactly one Fresh post), since the other
 * pool is checked before falling back to a literal repeat.
 */
export function drawNextPost(
  candidates: Post[],
  orderMode: string,
  history: DisplayHistory,
  nowSec: number = Math.floor(Date.now() / 1000)
): Post | null {
  if (candidates.length === 0) return null;
  const { fresh, archive } = partitionFreshArchive(candidates, nowSec);
  const preferFresh = Math.random() < FRESH_RATIO;
  const primary = preferFresh ? fresh : archive;
  const secondary = preferFresh ? archive : fresh;

  const recentSet = new Set(history.recentlyDisplayedIds);
  const recentParticipants = new Set(
    history.recentParticipantIds.filter((id): id is string => id != null)
  );
  const lastId = history.recentlyDisplayedIds[history.recentlyDisplayedIds.length - 1];

  const tierFilters: ((p: Post) => boolean)[] = [
    (p) => !recentSet.has(p.id) && !(p.participant_id && recentParticipants.has(p.participant_id)),
    (p) => !recentSet.has(p.id),
    (p) => p.id !== lastId,
    () => true,
  ];

  for (const filter of tierFilters) {
    const pick = pickFiltered(primary, filter, orderMode) ?? pickFiltered(secondary, filter, orderMode);
    if (pick) return pick;
  }
  return null;
}

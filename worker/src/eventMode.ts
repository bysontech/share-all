export type EventMode = 'draft' | 'event_live' | 'archive';

const VALID_MODES: ReadonlySet<string> = new Set(['draft', 'event_live', 'archive']);

export interface RoomSchedule {
  event_mode: string | null;
  slideshow_open_at: number | null;
  slideshow_close_at: number | null;
  gallery_open_at: number | null;
  video_open_at: number | null;
}

export function resolveEventMode(room: RoomSchedule, now: number): EventMode {
  // Priority 1: explicit manual override
  if (room.event_mode != null && VALID_MODES.has(room.event_mode)) {
    return room.event_mode as EventMode;
  }

  // Priority 2: time-based auto
  const open = room.slideshow_open_at;
  // Archive starts at the earliest of: slideshow_close_at, gallery_open_at, video_open_at
  const archiveCandidates = [room.slideshow_close_at, room.gallery_open_at, room.video_open_at]
    .filter((t): t is number => t !== null);
  const archiveTrigger = archiveCandidates.length > 0 ? Math.min(...archiveCandidates) : null;

  if (open !== null && now < open) return 'draft';
  if (archiveTrigger !== null && now >= archiveTrigger) return 'archive';
  if (open !== null && now >= open) return 'event_live';

  // Default: backward compat — existing rooms without any schedule config
  return 'event_live';
}

export function computeNextTransitionAt(room: RoomSchedule, now: number): number | null {
  const mode = resolveEventMode(room, now);
  if (mode === 'draft') return room.slideshow_open_at;
  if (mode === 'event_live') {
    const candidates = [room.slideshow_close_at, room.gallery_open_at, room.video_open_at]
      .filter((t): t is number => t !== null);
    return candidates.length > 0 ? Math.min(...candidates) : null;
  }
  return null;
}

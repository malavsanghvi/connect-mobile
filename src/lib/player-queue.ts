/**
 * The app-wide audio queue's rules (src/providers/player.tsx): where a queue
 * starts, what "next" and "previous" do, and what happens when a track ends.
 * Items that cannot play here — videos, and stavans or podcasts that live on
 * YouTube or a web page — stay in the list (the screen shows "Watch" or
 * "Open") but are always skipped. Pure, unit-tested in
 * src/lib/__tests__/player-queue.test.ts.
 */

/** One entry of the queue. `path` is a content-bucket key (signed before playing), `url` a direct https link. */
export type QueueItem = {
  id: string;
  title: string;
  subtitle: string | null;
  /** stavan · podcast · video · audio_lesson */
  kind: string;
  /** False for videos and anything without audio the player can use: skipped by next, previous and auto-advance. */
  playable: boolean;
  path: string | null;
  url: string | null;
};

type Entry = Pick<QueueItem, 'id' | 'playable'>;

/** First playable index at or after `from`, or -1. */
export function firstPlayable(items: readonly Entry[], from = 0): number {
  for (let i = Math.max(0, from); i < items.length; i += 1) if (items[i].playable) return i;
  return -1;
}

/** The next playable index after `current`, or -1 at the end of the queue. */
export function nextPlayable(items: readonly Entry[], current: number): number {
  return firstPlayable(items, current + 1);
}

/** The playable index before `current`, or -1 at the start. */
export function previousPlayable(items: readonly Entry[], current: number): number {
  for (let i = Math.min(current, items.length) - 1; i >= 0; i -= 1) if (items[i].playable) return i;
  return -1;
}

/**
 * Where a new queue starts: the chosen item when it can play; else the next
 * playable one after it; else the first playable one in the list. -1 when
 * nothing in the list can play.
 */
export function startIndex(items: readonly Entry[], startId?: string | null): number {
  const chosen = startId ? items.findIndex((i) => i.id === startId) : -1;
  if (chosen >= 0) {
    const fromChosen = firstPlayable(items, chosen);
    if (fromChosen >= 0) return fromChosen;
  }
  return firstPlayable(items, 0);
}

/** Seconds into a track after which "previous" restarts it instead of going back. */
export const RESTART_AFTER_SECONDS = 3;

/** "Previous": restart the track when it is a few seconds in or nothing playable comes before it; else go back one. */
export function previousAction(items: readonly Entry[], current: number, positionSeconds: number): { kind: 'restart' } | { kind: 'go'; index: number } {
  const prev = previousPlayable(items, current);
  if (prev < 0 || positionSeconds > RESTART_AFTER_SECONDS) return { kind: 'restart' };
  return { kind: 'go', index: prev };
}

/** Move one entry up (-1) or down (+1), e.g. reordering My playlist; out-of-range moves return the list unchanged (a copy). */
export function moveItem<T>(list: readonly T[], index: number, delta: -1 | 1): T[] {
  const to = index + delta;
  const out = [...list];
  if (index < 0 || index >= list.length || to < 0 || to >= list.length) return out;
  [out[index], out[to]] = [out[to], out[index]];
  return out;
}

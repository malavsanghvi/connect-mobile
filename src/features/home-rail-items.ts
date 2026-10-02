/**
 * The tiles of each Home rail, built from the data the rail loads (pure: no
 * React, no Supabase; unit-tested in src/features/__tests__/home-rail-items.test.ts).
 * Which rails show and how big their tiles are: src/lib/home-rails.ts.
 */
import { onlineAlbumUrl } from '@/lib/album-open';
import { onlyFullyJain, type MediaItem } from '@/lib/media-library';

import { albumDate } from './event-rules';
import { fromAmountCents, opportunityKind } from './give/rules';

/** At most this many tiles in a rail ("See all" has the rest). */
export const RAIL_LIMIT = 12;

/** Photos shows fewer: each album's cover is a request of its own (api/photos listAlbumPreviews). */
export const PHOTO_TILES = 8;

// ---------------------------------------------------------------------------
// Continue learning (Gyan Path)
// ---------------------------------------------------------------------------

/** One Gyan Path goal with the member's progress (api/gyan goalProgress, lastActivityByGoal). */
export type LearningGoalInput = {
  id: string;
  name: string;
  tint: string | null;
  /** The goal's mark (learning.ts goalMark). */
  mark: string;
  recommended: boolean;
  levelsDone: number;
  levelsTotal: number;
  stepsDone: number;
  stepsTotal: number;
  complete: boolean;
  /** The first unfinished level (levels unlock in order). */
  currentLevel: { id: string; name: string } | null;
  /** When the member last finished a step of this goal (ISO), null when not started. */
  lastActivity: string | null;
};

export type LearningTile = {
  key: string;
  goalId: string;
  /** The level the tile opens (the next one to do). */
  levelId: string;
  goalName: string;
  levelName: string;
  /** 1-based number of that level. */
  levelNumber: number;
  levelsTotal: number;
  /** Steps done of the whole goal, 0…1 (the bar along the tile). */
  progress: number;
  started: boolean;
  recommended: boolean;
  tint: string | null;
  mark: string;
};

/**
 * "Continue learning": the member's unfinished goals, each opening its next
 * level. The goals they are working on come first, the most recent first
 * (so the first tile is the level the old Learn shortcut opened: api/gyan
 * nextGyanLevel), then the recommended ones, then the rest in the
 * community's order. Finished goals, and goals without levels yet, are left
 * out; with nothing left the rail is hidden.
 */
export function learningTiles(goals: readonly LearningGoalInput[], limit = RAIL_LIMIT): LearningTile[] {
  const open = goals
    .map((g, at) => ({ g, at }))
    .filter(({ g }) => !g.complete && g.levelsTotal > 0 && g.currentLevel !== null);
  const rank = (g: LearningGoalInput) => (g.lastActivity ? 0 : g.recommended ? 1 : 2);
  return open
    .sort((a, b) => rank(a.g) - rank(b.g) || (b.g.lastActivity ?? '').localeCompare(a.g.lastActivity ?? '') || a.at - b.at)
    .slice(0, Math.max(0, limit))
    .map(({ g }) => {
      const level = g.currentLevel as { id: string; name: string };
      return {
        key: `goal:${g.id}`,
        goalId: g.id,
        levelId: level.id,
        goalName: g.name,
        levelName: level.name,
        levelNumber: Math.min(g.levelsTotal, g.levelsDone + 1),
        levelsTotal: g.levelsTotal,
        progress: g.stepsTotal > 0 ? Math.max(0, Math.min(1, g.stepsDone / g.stepsTotal)) : 0,
        started: g.stepsDone > 0 || !!g.lastActivity,
        recommended: g.recommended,
        tint: g.tint,
        mark: g.mark,
      };
    });
}

// ---------------------------------------------------------------------------
// Upcoming events
// ---------------------------------------------------------------------------

/** The event fields a tile is built from (app.events). */
export type EventTileFields = {
  id: string;
  name: string;
  venue: string | null;
  starts_at: string | null;
  ends_at: string | null;
  status: string;
  flyer_path: string | null;
};

export type EventTile = {
  key: string;
  eventId: string;
  name: string;
  venue: string | null;
  startsAt: string | null;
  /** events.flyer_path, trimmed; null for the designed tile. */
  flyerPath: string | null;
  live: boolean;
};

/**
 * "Upcoming events", soonest first (the order listUpcomingEvents returns):
 * an event on now (live, or started and not over yet) or still to come.
 * Finished events are left out, as are any the list still carries from the
 * last twelve hours. RLS has already narrowed a guest's list to public events.
 */
export function eventTiles(events: readonly EventTileFields[], now: Date, limit = RAIL_LIMIT): EventTile[] {
  const t = now.getTime();
  const at = (s: string | null) => (s ? new Date(s).getTime() : NaN);
  return events
    .filter((e) => {
      if (e.status === 'completed' || e.status === 'cancelled' || e.status === 'draft') return false;
      if (e.status === 'live') return true;
      const start = at(e.starts_at);
      const end = at(e.ends_at);
      return (Number.isFinite(start) && start >= t) || (Number.isFinite(end) && end >= t);
    })
    .slice(0, Math.max(0, limit))
    .map((e) => ({
      key: `event:${e.id}`,
      eventId: e.id,
      name: e.name,
      venue: e.venue?.trim() || null,
      startsAt: e.starts_at,
      flyerPath: e.flyer_path?.trim() || null,
      live: e.status === 'live',
    }));
}

/** What the family's RSVP says on an event's poster. */
export type EventMark = 'going' | 'waitlisted' | null;

/** "You're going" for an RSVP that is in (rsvpd, confirmed or attended), "waitlisted" on the waitlist; nothing for no RSVP, a cancelled one or an invitation not yet answered. */
export function eventMark(rsvpStatus: string | null | undefined): EventMark {
  if (rsvpStatus === 'rsvpd' || rsvpStatus === 'confirmed' || rsvpStatus === 'attended') return 'going';
  return rsvpStatus === 'waitlisted' ? 'waitlisted' : null;
}

/** Whether the family has tickets to open (any RSVP that is not cancelled, as the Events tab decides): the tile then opens the tickets, else the event, to RSVP. */
export function opensTickets(rsvpStatus: string | null | undefined): boolean {
  return !!rsvpStatus && rsvpStatus !== 'cancelled';
}

// ---------------------------------------------------------------------------
// Listen
// ---------------------------------------------------------------------------

export type ListenTile = {
  key: string;
  item: MediaItem;
  /** Which queue a tap plays: the member's playlist, or the stavans and podcasts after it. */
  queue: 'playlist' | 'library';
};

/**
 * "Listen": My playlist first, in the member's order, then the community's
 * newest stavans and podcasts that are not on it. Each tile plays its own
 * queue from that tile (a playlist tile carries on through the playlist).
 */
export function listenTiles(playlist: readonly MediaItem[], library: readonly MediaItem[], limit = RAIL_LIMIT): ListenTile[] {
  const seen = new Set<string>();
  const out: ListenTile[] = [];
  const add = (item: MediaItem, queue: ListenTile['queue']) => {
    if (seen.has(item.id) || out.length >= limit) return;
    seen.add(item.id);
    out.push({ key: `${queue}:${item.id}`, item, queue });
  };
  for (const item of playlist) if (item.kind !== 'recipe') add(item, 'playlist');
  for (const item of library) if (item.kind === 'stavan' || item.kind === 'podcast') add(item, 'library');
  return out;
}

// ---------------------------------------------------------------------------
// Give
// ---------------------------------------------------------------------------

/** The fields of an open opportunity (with its published campaign) a tile is built from. */
export type GivingOpportunity = {
  id: string;
  name: string;
  kind: string;
  options: unknown;
  amount_cents: number | null;
  min_amount_cents: number | null;
  subtitle?: string | null;
  campaign: { name: string } | null;
};

export type GiveTile = {
  key: string;
  /** The opportunity the tile opens: always the one it names. */
  opportunityId: string;
  title: string;
  /** The opportunity's subtitle, else its campaign. */
  detail: string | null;
  /** The Give list's "From $X" amount (cents); null for any amount. */
  fromCents: number | null;
  /** An any-amount opportunity with suggested amounts shows "From $25" without cents, as the Give list does. */
  compact: boolean;
};

/**
 * "Give": every open opportunity in the portal's order, one tile each,
 * showing the amount the Give list shows (fromAmountCents).
 */
export function giveTiles(opps: readonly GivingOpportunity[], limit = RAIL_LIMIT): GiveTile[] {
  return opps.slice(0, Math.max(0, limit)).map((opp) => {
    const from = fromAmountCents(opp);
    return {
      key: `opportunity:${opp.id}`,
      opportunityId: opp.id,
      title: opp.name,
      detail: opp.subtitle?.trim() || opp.campaign?.name?.trim() || null,
      fromCents: typeof from === 'number' && from > 0 ? from : null,
      compact: opportunityKind(opp.kind) === 'amount',
    };
  });
}

// ---------------------------------------------------------------------------
// Photos
// ---------------------------------------------------------------------------

/** The fields of an album a tile is built from (api/photos AlbumPreview). */
export type AlbumPreviewFields = {
  album: { id: string; title: string; created_at: string; external_url: string | null };
  event: { starts_at: string | null; ends_at: string | null } | null;
  /** The album has an approved photo or video here. */
  hasMedia: boolean;
  /** The first photo's storage path for the cover, null for the album's colour. */
  coverPath: string | null;
};

export type PhotoTile = {
  key: string;
  albumId: string;
  title: string;
  coverPath: string | null;
  /** The online album (Google Photos, https) the tile opens when its photos live there; null opens the album here. */
  onlineUrl: string | null;
  /** "Sep 12, 2026" (event-rules albumDate). */
  date: string;
};

/**
 * "Photos": the newest albums, in the Photos grid's order, each with its
 * first photo as the cover. An album with nothing to open (no photo here and
 * no online album to go to) is left out: a tile must lead somewhere.
 */
export function photoTiles(albums: readonly AlbumPreviewFields[], tz: string | null, limit = PHOTO_TILES): PhotoTile[] {
  return albums
    .map((a) => ({ a, onlineUrl: onlineAlbumUrl({ album: a.album, photos: a.hasMedia ? 1 : 0, videos: 0 }) }))
    .filter(({ a, onlineUrl }) => a.hasMedia || onlineUrl !== null)
    .slice(0, Math.max(0, limit))
    .map(({ a, onlineUrl }) => ({
      key: `album:${a.album.id}`,
      albumId: a.album.id,
      title: a.album.title,
      coverPath: a.coverPath,
      onlineUrl,
      date: albumDate(a.event?.starts_at, a.event?.ends_at, a.album.created_at, tz),
    }));
}

// ---------------------------------------------------------------------------
// Recipes
// ---------------------------------------------------------------------------

/** "Recipes": fully Jain recipes only (no root vegetables, onion, garlic…), in the order given (newest first). */
export function recipeTiles(items: readonly MediaItem[], limit = RAIL_LIMIT): MediaItem[] {
  return onlyFullyJain(items.filter((i) => i.kind === 'recipe')).slice(0, Math.max(0, limit));
}

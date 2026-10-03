/**
 * The tiles of each Home row, built from the data the row loads (pure: no
 * React, no Supabase; unit-tested in src/features/__tests__/home-rail-items.test.ts).
 * Which rows show and how big their tiles are: src/lib/home-rails.ts.
 */
import type { Translate } from '@/i18n';
import { albumLeadsSomewhere, onlineAlbumUrl } from '@/lib/album-open';
import type { SpecialDay } from '@/lib/api/family';
import type { FamilyMember } from '@/lib/api/member';
import { needsResign } from '@/lib/flyer';
import { formatDate, formatDay, monthName, parseISODate, zonedParts } from '@/lib/format';
import { goalProgress, lastActivityByGoal, type ProgressMark } from '@/lib/gyan-progress';
import type { LearnListenTile } from '@/lib/home-rails';
import { goalMark } from '@/lib/learning';
import { onlyFullyJain, type MediaItem } from '@/lib/media-library';

import { albumDate, turnsAge } from './event-rules';
import { fromAmountCents, opportunityKind } from './give/rules';
import { listDisplayName, WHEN_COUNTS_DAYS_BELOW, whenText } from './special-days';

/** At most this many tiles in a row ("See all" has the rest). */
export const RAIL_LIMIT = 12;

/** Plan a special day shows the days of the next two calendar months (home-rules.ts upcomingSpecialDays), at most this many. */
export const SPECIAL_DAY_LIMIT = 10;
export const SPECIAL_DAY_WINDOW_MONTHS = 2;

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

/** The goals of Gyan Path as the full load (api/gyan loadGyan) or the summary Home reads (loadGyanSummary) has them: the same answers from either. */
export type GyanGoalsLike = {
  goals: readonly { id: string; name: string; tint: string | null; mark: string | null; recommended: boolean; levels: readonly { id: string; name: string; steps: readonly { id: string }[] }[] }[];
  progress: readonly ProgressMark[];
};

/** Each goal with the person's progress and when they last finished a step of it: what Continue learning is built from. */
export function learningGoalInputs(g: GyanGoalsLike, personId: string): LearningGoalInput[] {
  const last = lastActivityByGoal(g, personId);
  return g.goals.map((goal) => {
    const p = goalProgress(goal, g.progress, personId);
    return {
      id: goal.id,
      name: goal.name,
      tint: goal.tint,
      mark: goalMark(goal),
      recommended: goal.recommended,
      levelsDone: p.levelsDone,
      levelsTotal: p.levelsTotal,
      stepsDone: p.stepsDone,
      stepsTotal: p.stepsTotal,
      complete: p.complete,
      currentLevel: p.currentLevel ? { id: p.currentLevel.id, name: p.currentLevel.name } : null,
      lastActivity: last.get(goal.id) ?? null,
    };
  });
}

/**
 * "Continue learning": the member's unfinished goals, each opening its next
 * level. The goals they are working on come first, the most recent first
 * (so the first one is the level the old Learn shortcut opened: api/gyan
 * nextGyanLevel), then the recommended ones, then the rest in the
 * community's order. Finished goals, and goals without levels yet, are left
 * out. The Learn & listen row shows the first one (learningState says what it
 * shows when there is none).
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

/**
 * What Continue learning has: the goals still to do (its tiles) and, when there are none, whether that is because
 * every goal is finished. The old Learn shortcut then still opened Gyan Path (the list of goals, from where another goal
 * can be chosen), so the tile stays for it, saying so, instead of vanishing. A community whose goals have no levels yet has
 * nothing to open and no tile.
 */
export type LearningState = { tiles: LearningTile[]; allDone: boolean };

export function learningState(goals: readonly LearningGoalInput[], limit = RAIL_LIMIT): LearningState {
  const tiles = learningTiles(goals, limit);
  return { tiles, allDone: tiles.length === 0 && goals.some((g) => g.complete) };
}

// ---------------------------------------------------------------------------
// Plan a special day
// ---------------------------------------------------------------------------

/** "Malav turns 45" for a birthday of a family member whose date of birth is known, else the day's own name ("Anya's birthday", the label the family gave it). */
export function specialDayTitle(t: Translate, day: Pick<SpecialDay, 'label' | 'person_id' | 'kind' | 'calendar_date' | 'tithi'>, next: string, members: FamilyMember[]): string {
  const person = day.person_id ? (members.find((m) => m.person.id === day.person_id)?.person ?? null) : null;
  const age = day.kind === 'birthday' && person ? turnsAge(person.date_of_birth, next) : null;
  return person && age != null ? t('home.turns', { name: person.preferred_name || person.first_name, age }) : listDisplayName(t, day, members);
}

/**
 * "Thu, Oct 22 · in 20 days": the date, with how far off it is while that is counted in days (whenText counts up to
 * WHEN_COUNTS_DAYS_BELOW; a day just inside the two-month window can be 61 or 62 days off and shows the date alone,
 * as whenText would name it again).
 */
export function specialDayWhen(t: Translate, today: string, next: string, inDays: number): string {
  return inDays < WHEN_COUNTS_DAYS_BELOW ? `${formatDay(next)} · ${whenText(t, today, next)}` : formatDay(next);
}

// ---------------------------------------------------------------------------
// Events, with the family's RSVP
// ---------------------------------------------------------------------------

/** Why an RSVP cannot be made right now (api/events rsvpBlockReason), or null when it can. */
export type RsvpBlock = 'not_open_yet' | 'closed' | 'past' | null;

/** The event fields a tile is built from (app.events, plus the RSVP block that api/events rsvpBlockReason works out). */
export type EventTileFields = {
  id: string;
  name: string;
  venue: string | null;
  starts_at: string | null;
  ends_at: string | null;
  status: string;
  flyer_path: string | null;
  rsvp_block: RsvpBlock;
  /** When RSVPs open: "RSVP opens Oct 12" while they have not opened yet. */
  rsvp_opens_at: string | null;
  /** How long before the start the family is asked "Still coming?" (hours). */
  confirmation_hours_before: number;
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
  rsvpBlock: RsvpBlock;
  rsvpOpensAt: string | null;
  confirmHoursBefore: number;
};

/**
 * The events the row can show, soonest first (the order listUpcomingEvents
 * returns): an event on now (live, or started and not over yet) or still to
 * come. Finished events are left out, as are any the list still carries from
 * the last twelve hours. RLS has already narrowed a guest's list to public
 * events. The row's own cap comes after the RSVPs are known (eventCards).
 */
export function eventTiles(events: readonly EventTileFields[], now: Date): EventTile[] {
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
    .map((e) => ({
      key: `event:${e.id}`,
      eventId: e.id,
      name: e.name,
      venue: e.venue?.trim() || null,
      startsAt: e.starts_at,
      flyerPath: e.flyer_path?.trim() || null,
      live: e.status === 'live',
      rsvpBlock: e.rsvp_block,
      rsvpOpensAt: e.rsvp_opens_at,
      confirmHoursBefore: e.confirmation_hours_before,
    }));
}

/** A signed flyer link and when it was signed (ms since 1970). */
export type SignedFlyer = { url: string; signedAt: number };

/**
 * The flyers that need a signed link now: those with none kept, or one too old
 * to rely on (flyer.ts needsResign). The flyer behind a path never changes, so a
 * link that is still fresh is kept rather than signed again: a new token makes
 * a browser download the whole image again on every reload of the row
 * (expo-image's cacheKey only works on a phone). Each path once.
 */
export function flyersToSign(tiles: readonly Pick<EventTile, 'flyerPath'>[], kept: ReadonlyMap<string, SignedFlyer>, now: number): string[] {
  const paths = new Set<string>();
  for (const { flyerPath } of tiles) {
    if (!flyerPath) continue;
    const link = kept.get(flyerPath);
    if (!link || needsResign(link.signedAt, now)) paths.add(flyerPath);
  }
  return [...paths];
}

/** The household's RSVP to one event: its status (app.rsvps.status) and how many people are on it (attendees not cancelled). */
export type RsvpFacts = { status: string; count: number };

/**
 * What the family's RSVP says on an event's tile:
 *
 * - `rsvp`: no reply yet and RSVPs are open (an invitation not answered counts as no reply); the highlighted chip;
 * - `confirm`: RSVP made, and the event is inside its confirmation window (the old Up next "Please confirm"). Only
 *   for an adult: it is the call to action of the confirm screen, which asks a child to ask a parent. These tiles
 *   come first (eventCards);
 * - `going` (with the number of people), `waitlisted`, `notGoing`, `attended`;
 * - `opens` (RSVPs not open yet) and `closed` for no RSVP when none can be made;
 * - `adultsOnly`: a child's login with no RSVP; RSVPs are made by an adult in the family.
 */
export type EventChip =
  | { kind: 'rsvp' | 'confirm' | 'waitlisted' | 'notGoing' | 'attended' | 'closed' | 'adultsOnly' }
  | { kind: 'going'; count: number }
  | { kind: 'opens'; on: string | null };

export type EventChipKind = EventChip['kind'];

/** Whether the event starts within its confirmation window (more than 0 and at most `confirmHoursBefore` hours away). */
export function inConfirmWindow(tile: Pick<EventTile, 'startsAt' | 'confirmHoursBefore'>, now: Date): boolean {
  if (!tile.startsAt) return false;
  const hoursLeft = (new Date(tile.startsAt).getTime() - now.getTime()) / 3600000;
  return Number.isFinite(hoursLeft) && hoursLeft > 0 && hoursLeft <= tile.confirmHoursBefore;
}

export function eventChip(tile: EventTile, rsvp: RsvpFacts | null, who: { now: Date; adult: boolean }): EventChip {
  switch (rsvp?.status) {
    case 'waitlisted':
      return { kind: 'waitlisted' };
    case 'cancelled':
    case 'no_show':
      return { kind: 'notGoing' };
    case 'attended':
      return { kind: 'attended' };
    case 'confirmed':
      return { kind: 'going', count: rsvp.count };
    case 'rsvpd':
      // A child sees the family's status, not the call to action: the confirm screen is for an adult.
      return who.adult && inConfirmWindow(tile, who.now) ? { kind: 'confirm' } : { kind: 'going', count: rsvp.count };
    default:
      if (tile.rsvpBlock === 'not_open_yet') return { kind: 'opens', on: tile.rsvpOpensAt };
      if (tile.rsvpBlock === 'closed' || tile.rsvpBlock === 'past') return { kind: 'closed' };
      return { kind: who.adult ? 'rsvp' : 'adultsOnly' };
  }
}

/** "Oct 12" at the center: the date alone, where formatDate also names the weekday and a small chip has no room for it. */
function monthDay(ts: string | null | undefined, tz: string | null): string {
  if (!ts) return '';
  const p = parseISODate(zonedParts(new Date(ts), tz).iso);
  return p ? `${monthName(p.m)} ${p.d}` : '';
}

/** The chip on an event tile: "RSVP", "Confirm", "Going · 3", "Waitlisted", "Not going", "You attended", "RSVPs closed", "RSVP opens Oct 12", "Ask a parent". */
export function eventChipText(t: Translate, chip: EventChip, tz: string | null): string {
  switch (chip.kind) {
    case 'rsvp':
      return t('home.event.rsvp');
    case 'confirm':
      return t('home.event.confirm');
    case 'going':
      return chip.count > 0 ? t('home.event.going', { n: chip.count }) : t('home.event.goingNone');
    case 'waitlisted':
      return t('home.event.waitlisted');
    case 'notGoing':
      return t('home.event.notGoing');
    case 'attended':
      return t('home.event.attended');
    case 'closed':
      return t('home.event.closed');
    case 'opens':
      return chip.on ? t('home.event.opens', { date: monthDay(chip.on, tz) }) : t('home.event.opensSoon');
    case 'adultsOnly':
      return t('home.event.adultsOnly');
  }
}

/** The same chip as a sentence for a screen reader ("Your family is going, 3 people"), so the tile is read with its status. */
export function eventChipSpoken(t: Translate, chip: EventChip, tz: string | null): string {
  switch (chip.kind) {
    case 'rsvp':
      return t('home.event.rsvpSpoken');
    case 'confirm':
      return t('home.event.confirmSpoken');
    case 'going':
      return chip.count > 0 ? t('home.event.goingSpoken', { people: chip.count === 1 ? t('home.person') : t('home.people', { n: chip.count }) }) : t('home.event.goingNoneSpoken');
    case 'waitlisted':
      return t('home.event.waitlistedSpoken');
    case 'notGoing':
      return t('home.event.notGoingSpoken');
    case 'attended':
      return t('home.event.attendedSpoken');
    case 'closed':
      return t('home.event.closedSpoken');
    case 'opens':
      return chip.on ? t('home.event.opensSpoken', { date: formatDate(chip.on, tz) }) : t('home.event.opensSoon');
    case 'adultsOnly':
      return t('home.event.adultsOnlySpoken');
  }
}

/**
 * Where an event tile goes, so a tap does what its chip says: the confirm screen while a reply to "Still coming?" is wanted
 * (Confirm), the family's tickets once the RSVP is in (Going, Waitlisted, You attended), else the event page, to RSVP (RSVP,
 * Not going, RSVPs closed or not open yet, Ask a parent) or to read (a guest, who has no chip).
 */
export type EventTarget = 'event' | 'tickets' | 'confirm';

export function eventTarget(chip: EventChip | null): EventTarget {
  switch (chip?.kind) {
    case 'confirm':
      return 'confirm';
    case 'going':
    case 'waitlisted':
    case 'attended':
      return 'tickets';
    default:
      return 'event';
  }
}

export type EventCard = {
  tile: EventTile;
  /** null for a guest: no RSVP status. */
  chip: EventChip | null;
};

/** Whether the family is asked "Still coming?" on this tile: the only tiles that are moved to the front. */
export function needsConfirmation(chip: EventChip | null): boolean {
  return chip?.kind === 'confirm';
}

/**
 * The cards of the Events row, in date order (soonest first, as listUpcomingEvents returns them): the owner asked for
 * the events with their RSVP status, not for a new order. The one exception is an event the family must still confirm
 * (an adult's Confirm chip: it is inside its confirmation window), which comes to the front, as the old Up next put "Please
 * confirm" above the rest. A signed-in member (`who`) gets the family's RSVP status on every tile; a guest (`who` null, no
 * `rsvps`) gets the public events with no status. At most `limit` cards, counted after moving the Confirm tiles up.
 */
export function eventCards(tiles: readonly EventTile[], rsvps: Readonly<Record<string, RsvpFacts>> | null, who: { now: Date; adult: boolean } | null, limit = RAIL_LIMIT): EventCard[] {
  const cards = tiles.map((tile): EventCard => ({ tile, chip: who ? eventChip(tile, rsvps?.[tile.eventId] ?? null, who) : null }));
  const first = cards.filter((c) => needsConfirmation(c.chip));
  const rest = cards.filter((c) => !needsConfirmation(c.chip));
  return [...first, ...rest].slice(0, Math.max(0, limit));
}

// ---------------------------------------------------------------------------
// Giving opportunities
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
 * "Giving opportunities": every open opportunity in the portal's order, one
 * tile each, showing the amount the Give list shows (fromAmountCents).
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
// Learn & listen
// ---------------------------------------------------------------------------

/**
 * What a tap on the My playlist tile queues: the whole of My playlist in the member's order, as Play all on
 * the playlist screen does (videos stay in, the player skips them; recipes are not part of it). It comes from
 * the full list the row loaded, not from any smaller set of tiles.
 */
export function playlistQueue(playlist: readonly MediaItem[]): MediaItem[] {
  return playlist.filter((item) => item.kind !== 'recipe');
}

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
  /** The online album (Google Photos, https) when its photos live there; null when the album opens here. */
  onlineUrl: string | null;
  /** "Sep 12, 2026" (event-rules albumDate). */
  date: string;
};

/**
 * The newest albums, in the Photos grid's order, each with its first photo
 * as the cover. An album with nothing to open (no photo here and no online
 * album to go to) is left out. The Learn & listen row shows the first one.
 */
export function photoTiles(albums: readonly AlbumPreviewFields[], tz: string | null, limit = 1): PhotoTile[] {
  return albums
    .map((a) => ({ a, like: { album: a.album, photos: a.hasMedia ? 1 : 0, videos: 0 } }))
    .filter(({ like }) => albumLeadsSomewhere(like))
    .slice(0, Math.max(0, limit))
    .map(({ a, like }) => ({
      key: `album:${a.album.id}`,
      albumId: a.album.id,
      title: a.album.title,
      coverPath: a.coverPath,
      onlineUrl: onlineAlbumUrl(like),
      date: albumDate(a.event?.starts_at, a.event?.ends_at, a.album.created_at, tz),
    }));
}

/** Fully Jain recipes only (no root vegetables, onion, garlic…), in the order given (newest first). */
export function recipeTiles(items: readonly MediaItem[], limit = RAIL_LIMIT): MediaItem[] {
  return onlyFullyJain(items.filter((i) => i.kind === 'recipe')).slice(0, Math.max(0, limit));
}

/** What one of the row's loads found: its value, or that it could not be had. A load that was not asked for (its tile is not shown) is absent. */
export type Part<T> = { ok: true; value: T } | { ok: false };

export type LearnListenParts = {
  /** learningState(…): the goals to continue, or that every goal is done. */
  learning?: Part<LearningState>;
  /** My playlist, in the member's order; `fallback` says the library has something to play when it is empty (the playlist screen offers the most-liked stavans then). */
  playlist?: Part<{ items: MediaItem[]; fallback: boolean }>;
  /** The community's podcasts, newest first. */
  podcasts?: Part<MediaItem[]>;
  /** The community's recipes, newest first (the fully Jain ones are picked here). */
  recipes?: Part<MediaItem[]>;
  /** photoTiles(…): the newest album that opens somewhere. */
  photos?: Part<PhotoTile[]>;
};

export type LearnListenCard =
  /** `tile` null: every goal is done, and the card opens the list of goals. */
  | { kind: 'learning'; key: string; tile: LearningTile | null }
  | { kind: 'playlist'; key: string; count: number | null }
  | { kind: 'podcasts'; key: string; latest: MediaItem | null }
  | { kind: 'recipes'; key: string; latest: MediaItem | null }
  | { kind: 'photos'; key: string; latest: PhotoTile | null };

/**
 * The cards of the Learn & listen row, for the tiles this person may use (`order`, from learnListenTiles).
 * A tile with nothing behind it is left out: no goal at all to continue (every goal finished is not that: the tile stays and
 * opens the goals), no podcast, no fully Jain recipe, no album, and no playlist when it is empty and the library has nothing
 * to offer instead.
 * A load that failed never takes its tile away (a feature is not hidden because of our own error, and the row
 * says what went wrong): the tile shows without the details it could not get. Continue learning is the one
 * exception, because without the goals there is no level to open; the row's notice carries the error.
 */
export function learnListenCards(order: readonly LearnListenTile[], parts: LearnListenParts): LearnListenCard[] {
  const out: LearnListenCard[] = [];
  for (const kind of order) {
    switch (kind) {
      case 'learning': {
        const l = parts.learning;
        if (l?.ok) {
          const tile = l.value.tiles[0];
          if (tile) out.push({ kind, key: 'learning', tile });
          else if (l.value.allDone) out.push({ kind, key: 'learning', tile: null });
        }
        break;
      }
      case 'playlist': {
        const p = parts.playlist;
        if (p?.ok) {
          const count = playlistQueue(p.value.items).length;
          if (count > 0 || p.value.fallback) out.push({ kind, key: 'playlist', count });
        } else out.push({ kind, key: 'playlist', count: null });
        break;
      }
      case 'podcasts': {
        const p = parts.podcasts;
        if (p?.ok) {
          const latest = p.value.find((i) => i.kind === 'podcast') ?? null;
          if (latest) out.push({ kind, key: 'podcasts', latest });
        } else out.push({ kind, key: 'podcasts', latest: null });
        break;
      }
      case 'recipes': {
        const p = parts.recipes;
        if (p?.ok) {
          const latest = recipeTiles(p.value, 1)[0] ?? null;
          if (latest) out.push({ kind, key: 'recipes', latest });
        } else out.push({ kind, key: 'recipes', latest: null });
        break;
      }
      case 'photos': {
        const p = parts.photos;
        if (p?.ok) {
          const latest = p.value[0] ?? null;
          if (latest) out.push({ kind, key: 'photos', latest });
        } else out.push({ kind, key: 'photos', latest: null });
        break;
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// My Jain Way tile
// ---------------------------------------------------------------------------

/** What the spoken label of the My Jain Way tile says (the numbers the navy card shows). */
export type JainWayWords = {
  done: number;
  total: number;
  points: number;
  community: string;
  /** The streak, in words ("2-day streak"). */
  streak: string;
  /** The first practice not done yet, with its time ("Navkar Mantra on waking"), or null. */
  next: string | null;
};

/** "My Jain Way. 0 of 2 done. 264 JSH points. 2-day streak. Next: Navkar Mantra on waking." */
export function jainWayLabel(t: Translate, w: JainWayWords): string {
  const status = w.total === 0 ? t('home.choosePractices') : w.next ? t('home.nextPractice', { name: w.next }) : t('home.allDone');
  return [t('home.myWay'), t('home.doneOf', { done: w.done, n: w.total }), t('home.centerPoints', { points: w.points.toLocaleString('en-US'), center: w.community }), w.streak, status].join('. ');
}

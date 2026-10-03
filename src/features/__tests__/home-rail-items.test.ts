import { describe, expect, it } from '@jest/globals';

import { translate, type Translate } from '@/i18n';
import type { FamilyMember } from '@/lib/api/member';
import { FLYER_RESIGN_AFTER_MS } from '@/lib/flyer';
import { railView } from '@/lib/home-rails';
import { parseMediaRow, type MediaItem } from '@/lib/media-library';

import {
  eventCards,
  eventChip,
  eventChipSpoken,
  eventChipText,
  eventTarget,
  eventTiles,
  flyersToSign,
  giveTiles,
  inConfirmWindow,
  jainWayLabel,
  learningTiles,
  learnListenCards,
  needsReply,
  opensTickets,
  photoTiles,
  playlistQueue,
  RAIL_LIMIT,
  recipeTiles,
  specialDayTitle,
  specialDayWhen,
  type AlbumPreviewFields,
  type EventChip,
  type EventTile,
  type EventTileFields,
  type GivingOpportunity,
  type LearningGoalInput,
  type LearningTile,
  type LearnListenParts,
  type PhotoTile,
  type RsvpFacts,
} from '../home-rail-items';

const t: Translate = (key, vars) => translate('en', key, vars);

describe('learningTiles (Continue learning)', () => {
  const goal = (id: string, over: Partial<LearningGoalInput> = {}): LearningGoalInput => ({
    id,
    name: `Goal ${id}`,
    tint: '#1B2C5C',
    mark: id.toUpperCase(),
    recommended: false,
    levelsDone: 0,
    levelsTotal: 4,
    stepsDone: 0,
    stepsTotal: 12,
    complete: false,
    currentLevel: { id: `${id}-l1`, name: `Level one of ${id}` },
    lastActivity: null,
    ...over,
  });

  it('puts the goals in progress first, the most recent first, then the recommended one, then the rest in order', () => {
    const tiles = learningTiles([
      goal('a'),
      goal('b', { recommended: true }),
      goal('c', { lastActivity: '2026-09-20T10:00:00Z', stepsDone: 3 }),
      goal('d', { lastActivity: '2026-10-01T10:00:00Z', stepsDone: 1 }),
      goal('e'),
    ]);
    expect(tiles.map((x) => x.goalId)).toEqual(['d', 'c', 'b', 'a', 'e']);
  });
  it("opens each goal's next level and shows the level number and how far the goal is", () => {
    const [tile] = learningTiles([goal('a', { levelsDone: 1, stepsDone: 6, currentLevel: { id: 'a-l2', name: 'Navkar part 2' }, lastActivity: '2026-10-01T10:00:00Z' })]);
    expect(tile).toEqual({
      key: 'goal:a',
      goalId: 'a',
      levelId: 'a-l2',
      goalName: 'Goal a',
      levelName: 'Navkar part 2',
      levelNumber: 2,
      levelsTotal: 4,
      progress: 0.5,
      started: true,
      recommended: false,
      tint: '#1B2C5C',
      mark: 'A',
    });
  });
  it('leaves out finished goals and goals without levels yet (the tile is left out when nothing is left)', () => {
    expect(learningTiles([goal('done', { complete: true, levelsDone: 4, currentLevel: null }), goal('empty', { levelsTotal: 0, stepsTotal: 0, currentLevel: null })])).toEqual([]);
    expect(learningTiles([])).toEqual([]);
  });
  it('keeps the progress between 0 and 1, and 0 for a goal without steps', () => {
    expect(learningTiles([goal('a', { stepsDone: 20, stepsTotal: 12 })])[0].progress).toBe(1);
    expect(learningTiles([goal('a', { stepsTotal: 0 })])[0].progress).toBe(0);
    expect(learningTiles([goal('a')])[0].started).toBe(false);
  });
  it('shows at most the limit', () => {
    const many = Array.from({ length: 20 }, (_, i) => goal(`g${i}`));
    expect(learningTiles(many)).toHaveLength(RAIL_LIMIT);
    expect(learningTiles(many, 3)).toHaveLength(3);
  });
});

describe('eventTiles (the events the row can show)', () => {
  const NOW = new Date('2026-10-02T15:00:00Z');
  const ev = (id: string, over: Partial<EventTileFields> = {}): EventTileFields => ({
    id,
    name: `Event ${id}`,
    venue: 'Jain Center Hall',
    starts_at: '2026-10-10T23:00:00Z',
    ends_at: '2026-10-11T03:00:00Z',
    status: 'published',
    flyer_path: null,
    rsvp_block: null,
    rsvp_opens_at: null,
    confirmation_hours_before: 24,
    ...over,
  });

  it('keeps events still to come and events on now, in the order given (soonest first)', () => {
    const tiles = eventTiles(
      [
        ev('ended', { starts_at: '2026-10-02T04:00:00Z', ends_at: '2026-10-02T08:00:00Z' }),
        ev('on-now', { starts_at: '2026-10-02T13:00:00Z', ends_at: '2026-10-02T18:00:00Z' }),
        ev('live', { starts_at: '2026-10-02T09:00:00Z', ends_at: null, status: 'live' }),
        ev('soon'),
      ],
      NOW,
    );
    expect(tiles.map((x) => x.eventId)).toEqual(['on-now', 'live', 'soon']);
    expect(tiles.find((x) => x.eventId === 'live')?.live).toBe(true);
    expect(tiles.find((x) => x.eventId === 'soon')?.live).toBe(false);
  });
  it('leaves out completed events and events with no date at all', () => {
    expect(eventTiles([ev('c', { status: 'completed' }), ev('nodate', { starts_at: null, ends_at: null })], NOW)).toEqual([]);
  });
  it('keeps an event whose RSVPs have closed (it is still to come)', () => {
    expect(eventTiles([ev('closed', { status: 'rsvp_closed', rsvp_block: 'closed' })], NOW).map((x) => x.eventId)).toEqual(['closed']);
  });
  it('carries the flyer for a poster tile, and the designed tile when there is none', () => {
    const [withFlyer, without] = eventTiles([ev('f', { flyer_path: '  c1/events/f/flyer.png ' }), ev('n', { flyer_path: '   ', venue: '  ' })], NOW);
    expect(withFlyer).toEqual({
      key: 'event:f',
      eventId: 'f',
      name: 'Event f',
      venue: 'Jain Center Hall',
      startsAt: '2026-10-10T23:00:00Z',
      flyerPath: 'c1/events/f/flyer.png',
      live: false,
      rsvpBlock: null,
      rsvpOpensAt: null,
      confirmHoursBefore: 24,
    });
    expect(without.flyerPath).toBeNull();
    expect(without.venue).toBeNull();
  });
  it('does not cut the list: the row caps it after the RSVPs are known, so an event that wants a reply is never lost', () => {
    expect(eventTiles(Array.from({ length: 30 }, (_, i) => ev(`e${i}`)), NOW)).toHaveLength(30);
  });
});

describe('eventChip (what the family’s RSVP says on a poster)', () => {
  const NOW = new Date('2026-10-02T15:00:00Z');
  const tile = (over: Partial<EventTile> = {}): EventTile => ({
    key: 'event:e1',
    eventId: 'e1',
    name: 'Navpad Puja',
    venue: null,
    startsAt: '2026-10-10T23:00:00Z',
    flyerPath: null,
    live: false,
    rsvpBlock: null,
    rsvpOpensAt: null,
    confirmHoursBefore: 24,
    ...over,
  });
  const rsvp = (status: string, count = 3): RsvpFacts => ({ status, count });
  const chip = (e: EventTile, r: RsvpFacts | null, adult = true) => eventChip(e, r, { now: NOW, adult });

  it('asks for a reply when the family has not RSVPd and RSVPs are open: RSVP, the highlighted one', () => {
    expect(chip(tile(), null)).toEqual({ kind: 'rsvp' });
    // An invitation not answered yet is no reply either.
    expect(chip(tile(), rsvp('invited'))).toEqual({ kind: 'rsvp' });
  });
  it('says Going with the number of people for an RSVP that is in (rsvpd, confirmed)', () => {
    expect(chip(tile(), rsvp('rsvpd', 3))).toEqual({ kind: 'going', count: 3 });
    expect(chip(tile(), rsvp('confirmed', 2))).toEqual({ kind: 'going', count: 2 });
  });
  it('asks to Confirm once the event is inside its confirmation window and the RSVP is not confirmed yet (the old "RSVP to confirm")', () => {
    // 24 hours before the start, less a minute.
    const soon = tile({ startsAt: '2026-10-03T14:59:00Z' });
    expect(chip(soon, rsvp('rsvpd'))).toEqual({ kind: 'confirm' });
    // Confirmed already: Going.
    expect(chip(soon, rsvp('confirmed', 3))).toEqual({ kind: 'going', count: 3 });
    // Not yet inside the window.
    expect(chip(tile({ startsAt: '2026-10-03T15:01:00Z' }), rsvp('rsvpd'))).toEqual({ kind: 'going', count: 3 });
    // The event has started: nothing left to confirm.
    expect(chip(tile({ startsAt: '2026-10-02T14:00:00Z' }), rsvp('rsvpd'))).toEqual({ kind: 'going', count: 3 });
  });
  it('uses each event’s own confirmation window', () => {
    expect(chip(tile({ startsAt: '2026-10-04T14:00:00Z', confirmHoursBefore: 48 }), rsvp('rsvpd'))).toEqual({ kind: 'confirm' });
    expect(chip(tile({ startsAt: '2026-10-04T14:00:00Z', confirmHoursBefore: 24 }), rsvp('rsvpd'))).toEqual({ kind: 'going', count: 3 });
  });
  it('says Waitlisted, Not going and You attended for those RSVPs', () => {
    expect(chip(tile(), rsvp('waitlisted'))).toEqual({ kind: 'waitlisted' });
    expect(chip(tile(), rsvp('cancelled'))).toEqual({ kind: 'notGoing' });
    expect(chip(tile(), rsvp('no_show'))).toEqual({ kind: 'notGoing' });
    expect(chip(tile(), rsvp('attended'))).toEqual({ kind: 'attended' });
  });
  it('a cancelled RSVP says Not going even while RSVPs are still open (the event screen lets them RSVP again)', () => {
    expect(chip(tile({ rsvpBlock: null }), rsvp('cancelled'))).toEqual({ kind: 'notGoing' });
  });
  it('says when no reply can be made: RSVPs closed, or the date they open', () => {
    expect(chip(tile({ rsvpBlock: 'closed' }), null)).toEqual({ kind: 'closed' });
    expect(chip(tile({ rsvpBlock: 'past' }), null)).toEqual({ kind: 'closed' });
    expect(chip(tile({ rsvpBlock: 'not_open_yet', rsvpOpensAt: '2026-10-05T14:00:00Z' }), null)).toEqual({ kind: 'opens', on: '2026-10-05T14:00:00Z' });
    expect(chip(tile({ rsvpBlock: 'closed' }), rsvp('invited'))).toEqual({ kind: 'closed' });
  });
  it('asks a child to ask a parent instead of to RSVP (RSVPs are made by adults), but still shows the family’s status', () => {
    expect(chip(tile(), null, false)).toEqual({ kind: 'adultsOnly' });
    expect(chip(tile(), rsvp('confirmed', 4), false)).toEqual({ kind: 'going', count: 4 });
    expect(chip(tile({ rsvpBlock: 'closed' }), null, false)).toEqual({ kind: 'closed' });
  });
  it('knows the confirmation window', () => {
    expect(inConfirmWindow({ startsAt: '2026-10-03T00:00:00Z', confirmHoursBefore: 24 }, NOW)).toBe(true);
    expect(inConfirmWindow({ startsAt: '2026-10-02T15:00:00Z', confirmHoursBefore: 24 }, NOW)).toBe(false);
    expect(inConfirmWindow({ startsAt: null, confirmHoursBefore: 24 }, NOW)).toBe(false);
    expect(inConfirmWindow({ startsAt: 'not a date', confirmHoursBefore: 24 }, NOW)).toBe(false);
  });
});

describe('eventCards (the Events row: status on every tile, replies wanted first)', () => {
  const NOW = new Date('2026-10-02T15:00:00Z');
  const tile = (id: string, over: Partial<EventTile> = {}): EventTile => ({
    key: `event:${id}`,
    eventId: id,
    name: `Event ${id}`,
    venue: null,
    startsAt: '2026-10-10T23:00:00Z',
    flyerPath: null,
    live: false,
    rsvpBlock: null,
    rsvpOpensAt: null,
    confirmHoursBefore: 24,
    ...over,
  });
  const member = { now: NOW, adult: true };

  it('puts the events that want a reply first (RSVP and Confirm), each group in date order', () => {
    // In date order, as listUpcomingEvents returns them.
    const tiles = [tile('soon', { startsAt: '2026-10-03T10:00:00Z' }), tile('going1'), tile('open1'), tile('going2'), tile('open2'), tile('closed', { rsvpBlock: 'closed' })];
    const rsvps = { going1: { status: 'confirmed', count: 2 }, going2: { status: 'rsvpd', count: 4 }, soon: { status: 'rsvpd', count: 3 } };
    const cards = eventCards(tiles, rsvps, member);
    expect(cards.map((c) => [c.tile.eventId, c.chip?.kind])).toEqual([
      ['soon', 'confirm'],
      ['open1', 'rsvp'],
      ['open2', 'rsvp'],
      ['going1', 'going'],
      ['going2', 'going'],
      ['closed', 'closed'],
    ]);
  });
  it('gives every tile the family’s status, and carries the RSVP so the tile opens the tickets', () => {
    const cards = eventCards([tile('a'), tile('b')], { a: { status: 'waitlisted', count: 1 } }, member);
    expect(cards.map((c) => c.rsvpStatus)).toEqual([null, 'waitlisted']);
    expect(cards.every((c) => c.chip !== null)).toBe(true);
  });
  it('shows a guest the public events in date order with no status at all', () => {
    const cards = eventCards([tile('a'), tile('b', { rsvpBlock: 'closed' })], null, null);
    expect(cards.map((c) => c.tile.eventId)).toEqual(['a', 'b']);
    expect(cards.every((c) => c.chip === null && c.rsvpStatus === null)).toBe(true);
  });
  it('shows no status when the family’s RSVPs could not be read (a guess would say RSVP on an event they are going to)', () => {
    const cards = eventCards([tile('a')], null, null);
    expect(cards[0].chip).toBeNull();
  });
  it('shows at most the limit, counted after sorting, so a reply wanted from a later event still shows', () => {
    const tiles = Array.from({ length: 30 }, (_, i) => tile(`e${i}`));
    const rsvps = Object.fromEntries(tiles.slice(0, 29).map((x) => [x.eventId, { status: 'confirmed', count: 2 }]));
    const cards = eventCards(tiles, rsvps, member);
    expect(cards).toHaveLength(RAIL_LIMIT);
    expect(cards[0].tile.eventId).toBe('e29');
    expect(eventCards(tiles, rsvps, member, 3)).toHaveLength(3);
  });
  it('sorts a reply wanted on an event that is on now like any other', () => {
    const cards = eventCards([tile('live', { live: true, startsAt: '2026-10-02T13:00:00Z' }), tile('later')], { live: { status: 'confirmed', count: 2 } }, member);
    expect(cards.map((c) => c.tile.eventId)).toEqual(['later', 'live']);
  });
  it('knows which chips want a reply', () => {
    expect(needsReply({ kind: 'rsvp' })).toBe(true);
    expect(needsReply({ kind: 'confirm' })).toBe(true);
    for (const kind of ['waitlisted', 'notGoing', 'attended', 'closed', 'adultsOnly'] as const) expect(needsReply({ kind })).toBe(false);
    expect(needsReply({ kind: 'going', count: 2 })).toBe(false);
    expect(needsReply(null)).toBe(false);
  });
});

describe('eventTarget and opensTickets (where an event tile goes)', () => {
  it('opens the confirmation while a reply to "Still coming?" is wanted', () => {
    expect(eventTarget({ kind: 'confirm' }, 'rsvpd')).toBe('confirm');
  });
  it('opens the tickets for any RSVP that is not cancelled (as the Events tab does), else the event, to RSVP', () => {
    for (const status of ['rsvpd', 'confirmed', 'waitlisted', 'invited', 'attended']) expect(opensTickets(status)).toBe(true);
    expect(opensTickets('cancelled')).toBe(false);
    expect(opensTickets(null)).toBe(false);
    expect(opensTickets(undefined)).toBe(false);
    expect(opensTickets('')).toBe(false);
    expect(eventTarget({ kind: 'going', count: 2 }, 'confirmed')).toBe('tickets');
    expect(eventTarget({ kind: 'rsvp' }, null)).toBe('event');
    expect(eventTarget({ kind: 'notGoing' }, 'cancelled')).toBe('event');
    // A guest has no chip and no RSVP: the event.
    expect(eventTarget(null, null)).toBe('event');
  });
});

describe('eventChipText and eventChipSpoken (the chip in words, and for a screen reader)', () => {
  const text = (chip: EventChip) => eventChipText(t, chip, 'America/Chicago');
  const spoken = (chip: EventChip) => eventChipSpoken(t, chip, 'America/Chicago');

  it('writes the chips the owner asked for: RSVP, Confirm, Going · N, Waitlisted, Not going', () => {
    expect(text({ kind: 'rsvp' })).toBe('RSVP');
    expect(text({ kind: 'confirm' })).toBe('Confirm');
    expect(text({ kind: 'going', count: 3 })).toBe('Going · 3');
    expect(text({ kind: 'waitlisted' })).toBe('Waitlisted');
    expect(text({ kind: 'notGoing' })).toBe('Not going');
  });
  it('writes the rest plainly', () => {
    expect(text({ kind: 'going', count: 0 })).toBe('Going');
    expect(text({ kind: 'attended' })).toBe('You attended');
    expect(text({ kind: 'closed' })).toBe('RSVPs closed');
    expect(text({ kind: 'adultsOnly' })).toBe('Ask a parent');
    expect(text({ kind: 'opens', on: '2026-10-12T15:00:00Z' })).toBe('RSVP opens Oct 12');
    expect(text({ kind: 'opens', on: null })).toBe('RSVP opens soon');
  });
  it('reads each chip as a sentence a screen reader can use', () => {
    expect(spoken({ kind: 'rsvp' })).toBe('RSVP: your family has not replied yet');
    expect(spoken({ kind: 'confirm' })).toBe('Please confirm that your family is still coming');
    expect(spoken({ kind: 'going', count: 3 })).toBe('Your family is going, 3 people');
    expect(spoken({ kind: 'going', count: 1 })).toBe('Your family is going, 1 person');
    expect(spoken({ kind: 'going', count: 0 })).toBe('Your family is going');
    expect(spoken({ kind: 'waitlisted' })).toBe('Your family is on the waitlist');
    expect(spoken({ kind: 'notGoing' })).toBe('Your family is not going');
    expect(spoken({ kind: 'closed' })).toBe('RSVPs are closed');
    expect(spoken({ kind: 'opens', on: '2026-10-12T15:00:00Z' })).toBe('RSVPs open on Mon, Oct 12');
  });
  it('never says "bid"', () => {
    const kinds: EventChip[] = [{ kind: 'rsvp' }, { kind: 'confirm' }, { kind: 'going', count: 2 }, { kind: 'waitlisted' }, { kind: 'notGoing' }, { kind: 'attended' }, { kind: 'closed' }, { kind: 'adultsOnly' }, { kind: 'opens', on: null }];
    for (const chip of kinds) expect(`${text(chip)} ${spoken(chip)}`).not.toMatch(/\bbid/i);
  });
});

describe('flyersToSign (the row keeps a flyer link while it is fresh)', () => {
  const NOW = 50_000_000;
  const tile = (flyerPath: string | null) => ({ flyerPath });

  it('signs every flyer when no link is kept, leaving out events with no flyer', () => {
    expect(flyersToSign([tile('c1/a.png'), tile(null), tile('c1/b.png')], new Map(), NOW)).toEqual(['c1/a.png', 'c1/b.png']);
    expect(flyersToSign([tile(null)], new Map(), NOW)).toEqual([]);
    expect(flyersToSign([], new Map(), NOW)).toEqual([]);
  });
  it('keeps a link that is still fresh, so a reload does not make a browser download the flyer again', () => {
    const kept = new Map([['c1/a.png', { url: 'https://files.example/a?token=1', signedAt: NOW - 10 * 60 * 1000 }]]);
    expect(flyersToSign([tile('c1/a.png'), tile('c1/b.png')], kept, NOW)).toEqual(['c1/b.png']);
  });
  it('signs a flyer again once its link is too old to rely on (the same 50 minutes as the flyer screen)', () => {
    const at = (age: number) => new Map([['c1/a.png', { url: 'u', signedAt: NOW - age }]]);
    expect(flyersToSign([tile('c1/a.png')], at(FLYER_RESIGN_AFTER_MS - 1), NOW)).toEqual([]);
    expect(flyersToSign([tile('c1/a.png')], at(FLYER_RESIGN_AFTER_MS), NOW)).toEqual(['c1/a.png']);
    expect(flyersToSign([tile('c1/a.png')], new Map([['c1/a.png', { url: 'u', signedAt: Number.NaN }]]), NOW)).toEqual(['c1/a.png']);
  });
  it('names each path once, whatever the number of events that share it', () => {
    expect(flyersToSign([tile('c1/a.png'), tile('c1/a.png')], new Map(), NOW)).toEqual(['c1/a.png']);
  });
});

describe('specialDayTitle and specialDayWhen (a Plan a special day tile)', () => {
  const member = (id: string, first: string, dob: string | null, preferred: string | null = null) => ({ person: { id, first_name: first, preferred_name: preferred, date_of_birth: dob } }) as unknown as FamilyMember;
  const members = [member('p1', 'Malav', '1981-10-22'), member('p2', 'Anya', '2016-10-26', 'Annie')];
  const day = (over: Record<string, unknown> = {}) => ({ label: null, person_id: null, kind: 'birthday', calendar_date: '1981-10-22', tithi: null, ...over }) as never;

  it('says how old a family member turns on a birthday', () => {
    expect(specialDayTitle(t, day({ person_id: 'p1' }), '2026-10-22', members)).toBe('Malav turns 45');
    expect(specialDayTitle(t, day({ person_id: 'p2' }), '2026-10-26', members)).toBe('Annie turns 10');
  });
  it('falls back to the day’s own name: the label the family gave it, or "Anya’s birthday"', () => {
    expect(specialDayTitle(t, day({ kind: 'anniversary', label: 'Our wedding anniversary' }), '2026-11-02', members)).toBe('Our wedding anniversary');
    expect(specialDayTitle(t, day({ person_id: 'p2', kind: 'anniversary' }), '2026-11-02', members)).toBe("Annie's anniversary");
    // A date of birth that is not known cannot say an age.
    expect(specialDayTitle(t, day({ person_id: 'p3' }), '2026-10-22', [...members, member('p3', 'Priya', null)])).toBe("Priya's birthday");
  });
  it('gives the date and how far off it is while that is under two months', () => {
    expect(specialDayWhen(t, '2026-10-02', '2026-10-22', 20)).toBe('Thu, Oct 22 · in 20 days');
    expect(specialDayWhen(t, '2026-10-02', '2026-10-03', 1)).toBe('Sat, Oct 3 · Tomorrow');
    expect(specialDayWhen(t, '2026-10-02', '2026-10-02', 0)).toBe('Fri, Oct 2 · Today');
    expect(specialDayWhen(t, '2026-10-02', '2026-12-01', 60)).toBe('Tue, Dec 1');
  });
});

const media = (id: string, kind: MediaItem['kind'], metadata: Record<string, unknown> = {}): MediaItem => {
  const parsed = parseMediaRow({ id, kind, title: `${kind} ${id}`, metadata, like_count: 0 });
  if (!parsed) throw new Error('bad fixture');
  return parsed;
};

describe('playlistQueue (what a tap on the My playlist tile plays)', () => {
  // A long playlist, every fifth item a video.
  const playlist = Array.from({ length: 20 }, (_, i) => media(`pl${i + 1}`, i % 5 === 4 ? 'video' : 'stavan'));

  it('is the whole of My playlist in the member’s order, not just the few items a tile could name', () => {
    const queue = playlistQueue(playlist);
    // All 20: videos stay in (the player skips them), as in Play all on the playlist screen.
    expect(queue.map((x) => x.id)).toEqual(playlist.map((x) => x.id));
    expect(queue).toHaveLength(20);
    expect(queue.length).toBeGreaterThan(RAIL_LIMIT);
  });
  it('leaves recipes out of the queue', () => {
    expect(playlistQueue([media('s1', 'stavan'), media('r1', 'recipe'), media('s2', 'stavan')]).map((x) => x.id)).toEqual(['s1', 's2']);
  });
  it('is empty when there is nothing to play', () => {
    expect(playlistQueue([])).toEqual([]);
  });
});

describe('giveTiles (Giving opportunities)', () => {
  const opp = (id: string, extra: Partial<GivingOpportunity> = {}): GivingOpportunity => ({ id, name: `Opp ${id}`, kind: 'open', options: [], amount_cents: null, min_amount_cents: null, subtitle: null, campaign: { name: 'Paryushan' }, ...extra });

  it('makes one tile per open opportunity, in the portal order, each opening that opportunity', () => {
    const tiles = giveTiles([opp('a', { min_amount_cents: 2500 }), opp('b', { campaign: { name: 'Pathshala' } })]);
    expect(tiles.map((x) => x.opportunityId)).toEqual(['a', 'b']);
    expect(tiles[0]).toEqual({ key: 'opportunity:a', opportunityId: 'a', title: 'Opp a', detail: 'Paryushan', fromCents: 2500, compact: false });
    expect(tiles[1]).toMatchObject({ detail: 'Pathshala', fromCents: null }); // any amount
  });
  it('shows the Give list\'s "From" amount: a fixed level, the smallest tier, the first suggested amount', () => {
    expect(giveTiles([opp('gold', { kind: 'fixed', amount_cents: 500100 })])[0]).toMatchObject({ fromCents: 500100, compact: false });
    const tier = opp('t', { kind: 'tier', options: [{ key: 'p', label: 'Platinum', amount_cents: 500000 }, { key: 's', label: 'Silver', amount_cents: 100000 }] });
    expect(giveTiles([tier])[0].fromCents).toBe(100000);
    expect(giveTiles([opp('amt', { kind: 'amount', options: [5000, 2500] })])[0]).toMatchObject({ fromCents: 2500, compact: true });
  });
  it("uses the opportunity's subtitle over its campaign, and has no line without either", () => {
    expect(giveTiles([opp('a', { subtitle: '  Sponsor a day of Paryushan  ' })])[0].detail).toBe('Sponsor a day of Paryushan');
    expect(giveTiles([opp('a', { campaign: null })])[0].detail).toBeNull();
  });
  it('keeps the amounts in integer cents', () => {
    for (const tile of giveTiles([opp('a', { kind: 'fixed', amount_cents: 5100 }), opp('b', { min_amount_cents: 2500 })])) expect(tile.fromCents === null || Number.isInteger(tile.fromCents)).toBe(true);
  });
  it('is empty when nothing is open', () => {
    expect(giveTiles([])).toEqual([]);
  });
});

describe('photoTiles (the newest album for the Photos tile)', () => {
  const album = (id: string, over: Partial<AlbumPreviewFields> & { external_url?: string | null } = {}): AlbumPreviewFields => ({
    album: { id, title: `Album ${id}`, created_at: '2025-12-05T12:00:00Z', external_url: over.external_url ?? null },
    event: over.event ?? null,
    hasMedia: over.hasMedia ?? true,
    coverPath: over.coverPath === undefined ? `c1/${id}/1.jpg` : over.coverPath,
  });

  it("uses the album's first photo as the cover and the event's date", () => {
    const [tile] = photoTiles([album('a', { event: { starts_at: '2026-09-12T18:00:00Z', ends_at: null } })], 'America/Chicago');
    expect(tile).toEqual({ key: 'album:a', albumId: 'a', title: 'Album a', coverPath: 'c1/a/1.jpg', onlineUrl: null, date: 'Sep 12, 2026' });
  });
  it("dates an album by when it was made when it has no event", () => {
    expect(photoTiles([album('a')], null)[0].date).toBe('Dec 2025');
  });
  it('keeps an online album whose photos live there and none are here', () => {
    const [tile] = photoTiles([album('g', { hasMedia: false, coverPath: null, external_url: 'https://photos.app.goo.gl/abc' })], null);
    expect(tile.onlineUrl).toBe('https://photos.app.goo.gl/abc');
    expect(tile.coverPath).toBeNull();
  });
  it('leaves out an album with nothing to open: no photo here and no online album to go to', () => {
    const tiles = photoTiles(
      [
        album('empty', { hasMedia: false, coverPath: null }),
        album('real'),
        // A link that is not https is never opened, so it does not count.
        album('insecure', { hasMedia: false, coverPath: null, external_url: 'http://example.com/album' }),
        album('online', { hasMedia: false, coverPath: null, external_url: 'https://photos.app.goo.gl/abc' }),
      ],
      null,
      4,
    );
    expect(tiles.map((x) => x.albumId)).toEqual(['real', 'online']);
  });
  it('shows the newest one unless asked for more', () => {
    expect(photoTiles(Array.from({ length: 20 }, (_, i) => album(`a${i}`)), null).map((x) => x.albumId)).toEqual(['a0']);
    expect(photoTiles(Array.from({ length: 20 }, (_, i) => album(`a${i}`)), null, 4)).toHaveLength(4);
    expect(photoTiles([album('x', { hasMedia: false, coverPath: null }), album('y')], null).map((x) => x.albumId)).toEqual(['y']);
  });
});

describe('recipeTiles (Fully Jain recipes)', () => {
  it('keeps only recipes marked fully Jain', () => {
    const items = [media('r1', 'recipe', { fully_jain: true }), media('r2', 'recipe', { fully_jain: false }), media('r3', 'recipe'), media('s1', 'stavan', { fully_jain: true }), media('r4', 'recipe', { fully_jain: 'true' })];
    expect(recipeTiles(items).map((x) => x.id)).toEqual(['r1', 'r4']);
  });
  it('keeps the order given (newest first)', () => {
    expect(recipeTiles([media('r2', 'recipe', { fully_jain: true }), media('r1', 'recipe', { fully_jain: true })]).map((x) => x.id)).toEqual(['r2', 'r1']);
  });
  it('shows at most the limit', () => {
    expect(recipeTiles(Array.from({ length: 20 }, (_, i) => media(`r${i}`, 'recipe', { fully_jain: true })))).toHaveLength(RAIL_LIMIT);
    expect(recipeTiles(Array.from({ length: 20 }, (_, i) => media(`r${i}`, 'recipe', { fully_jain: true })), 1)).toHaveLength(1);
  });
});

describe('learnListenCards (the Learn & listen row from what it loaded)', () => {
  const goalTile = (id: string): LearningTile => ({ key: `goal:${id}`, goalId: id, levelId: `${id}-l1`, goalName: `Goal ${id}`, levelName: 'One', levelNumber: 1, levelsTotal: 3, progress: 0.2, started: true, recommended: false, tint: null, mark: id });
  const album = (id: string): PhotoTile => ({ key: `album:${id}`, albumId: id, title: `Album ${id}`, coverPath: null, onlineUrl: null, date: 'Sep 2026' });
  const ALL = ['learning', 'playlist', 'podcasts', 'recipes', 'photos'] as const;
  const full: LearnListenParts = {
    learning: { ok: true, value: [goalTile('a'), goalTile('b')] },
    playlist: { ok: true, value: { items: [media('s1', 'stavan'), media('v1', 'video'), media('r1', 'recipe')], fallback: false } },
    podcasts: { ok: true, value: [media('p1', 'podcast'), media('p2', 'podcast')] },
    recipes: { ok: true, value: [media('r2', 'recipe', { fully_jain: false }), media('r3', 'recipe', { fully_jain: true })] },
    photos: { ok: true, value: [album('a1')] },
  };

  it('makes one card per tile, in order: the first goal to continue, the playlist, the newest podcast, the newest fully Jain recipe, the newest album', () => {
    const cards = learnListenCards(ALL, full);
    expect(cards.map((c) => c.kind)).toEqual(['learning', 'playlist', 'podcasts', 'recipes', 'photos']);
    expect(cards[0]).toMatchObject({ kind: 'learning', tile: { goalId: 'a' } });
    // The playlist counts what a tap queues: the stavan and the video, not the recipe.
    expect(cards[1]).toEqual({ kind: 'playlist', key: 'playlist', count: 2 });
    expect(cards[2]).toMatchObject({ kind: 'podcasts', latest: { id: 'p1' } });
    expect(cards[3]).toMatchObject({ kind: 'recipes', latest: { id: 'r3' } });
    expect(cards[4]).toMatchObject({ kind: 'photos', latest: { albumId: 'a1' } });
  });
  it('only makes the cards for the tiles it is asked for', () => {
    expect(learnListenCards(['recipes', 'photos'], full).map((c) => c.kind)).toEqual(['recipes', 'photos']);
    expect(learnListenCards([], full)).toEqual([]);
  });
  it('leaves out a tile with nothing behind it: nothing to continue, no podcast, no fully Jain recipe, no album', () => {
    const empty: LearnListenParts = { learning: { ok: true, value: [] }, playlist: { ok: true, value: { items: [], fallback: false } }, podcasts: { ok: true, value: [] }, recipes: { ok: true, value: [media('r2', 'recipe', { fully_jain: false })] }, photos: { ok: true, value: [] } };
    expect(learnListenCards(ALL, empty)).toEqual([]);
    // An empty playlist stays while the library has something to play instead: the playlist screen offers the most-liked stavans.
    expect(learnListenCards(ALL, { ...empty, playlist: { ok: true, value: { items: [], fallback: true } } })).toEqual([{ kind: 'playlist', key: 'playlist', count: 0 }]);
  });
  it('never takes a tile away because a load failed (a feature is not hidden by our own error), except Continue learning, which has no level to open without it', () => {
    const failed: LearnListenParts = { learning: { ok: false }, playlist: { ok: false }, podcasts: { ok: false }, recipes: { ok: false }, photos: { ok: false } };
    const cards = learnListenCards(ALL, failed);
    expect(cards.map((c) => c.kind)).toEqual(['playlist', 'podcasts', 'recipes', 'photos']);
    expect(cards[0]).toEqual({ kind: 'playlist', key: 'playlist', count: null });
    expect(cards[1]).toMatchObject({ latest: null });
  });
  it('treats a load that was not asked for like one that failed', () => {
    expect(learnListenCards(['podcasts'], {}).map((c) => c.kind)).toEqual(['podcasts']);
  });
  it('leaves the row with nothing to draw but a message when its only tile (Continue learning) failed to load: the row is kept, not silently gone', () => {
    // ?shortcuts=learn with Gyan Path failing: no card, one error for the row to say.
    const cards = learnListenCards(['learning'], { learning: { ok: false } });
    expect(cards).toEqual([]);
    expect(railView({ tiles: cards.length, error: false, notice: true })).toBe('message');
    // Nothing failed and nothing is left to continue: the row really is left out.
    expect(railView({ tiles: learnListenCards(['learning'], { learning: { ok: true, value: [] } }).length, error: false, notice: false })).toBe('hidden');
  });
});

describe('jainWayLabel (the spoken label of the My Jain Way tile)', () => {
  const words = { done: 0, total: 2, points: 1264, community: 'JSH', streak: '2-day streak', next: 'Navkar Mantra on waking' };

  it('says the numbers the navy card shows, then what is next', () => {
    expect(jainWayLabel(t, words)).toBe('My Jain Way. 0 of 2 done. 1,264 JSH points. 2-day streak. Next: Navkar Mantra on waking');
  });
  it('says so when everything is done, and asks to choose practices when there are none', () => {
    expect(jainWayLabel(t, { ...words, done: 2, next: null })).toContain('All practices done today');
    expect(jainWayLabel(t, { ...words, total: 0, done: 0, next: null })).toContain('Choose the practices');
  });
});

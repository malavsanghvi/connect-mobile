import { describe, expect, it } from '@jest/globals';

import { parseMediaRow, type MediaItem } from '@/lib/media-library';

import {
  eventMark,
  eventTiles,
  giveTiles,
  learningTiles,
  listenTiles,
  opensTickets,
  PHOTO_TILES,
  photoTiles,
  RAIL_LIMIT,
  recipeTiles,
  type AlbumPreviewFields,
  type EventTileFields,
  type GivingOpportunity,
  type LearningGoalInput,
} from '../home-rail-items';

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
  it('leaves out finished goals and goals without levels yet (the rail hides when nothing is left)', () => {
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

describe('eventTiles (Upcoming events)', () => {
  const NOW = new Date('2026-10-02T15:00:00Z');
  const ev = (id: string, over: Partial<EventTileFields> = {}): EventTileFields => ({
    id,
    name: `Event ${id}`,
    venue: 'Jain Center Hall',
    starts_at: '2026-10-10T23:00:00Z',
    ends_at: '2026-10-11T03:00:00Z',
    status: 'published',
    flyer_path: null,
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
    expect(eventTiles([ev('closed', { status: 'rsvp_closed' })], NOW).map((x) => x.eventId)).toEqual(['closed']);
  });
  it('carries the flyer for a poster tile, and the designed tile when there is none', () => {
    const [withFlyer, without] = eventTiles([ev('f', { flyer_path: '  c1/events/f/flyer.png ' }), ev('n', { flyer_path: '   ', venue: '  ' })], NOW);
    expect(withFlyer).toEqual({ key: 'event:f', eventId: 'f', name: 'Event f', venue: 'Jain Center Hall', startsAt: '2026-10-10T23:00:00Z', flyerPath: 'c1/events/f/flyer.png', live: false });
    expect(without.flyerPath).toBeNull();
    expect(without.venue).toBeNull();
  });
  it('shows at most the limit', () => {
    expect(eventTiles(Array.from({ length: 30 }, (_, i) => ev(`e${i}`)), NOW)).toHaveLength(RAIL_LIMIT);
  });
});

describe('eventMark and opensTickets (what the family’s RSVP does to a poster)', () => {
  it('says "going" for an RSVP that is in, "waitlisted" on the waitlist, and nothing otherwise', () => {
    expect(eventMark('rsvpd')).toBe('going');
    expect(eventMark('confirmed')).toBe('going');
    expect(eventMark('attended')).toBe('going');
    expect(eventMark('waitlisted')).toBe('waitlisted');
    expect(eventMark('cancelled')).toBeNull();
    expect(eventMark('invited')).toBeNull();
    expect(eventMark(null)).toBeNull();
    expect(eventMark(undefined)).toBeNull();
  });
  it('opens the tickets for any RSVP that is not cancelled (as the Events tab does), else the event', () => {
    for (const status of ['rsvpd', 'confirmed', 'waitlisted', 'invited', 'attended']) expect(opensTickets(status)).toBe(true);
    expect(opensTickets('cancelled')).toBe(false);
    expect(opensTickets(null)).toBe(false);
    expect(opensTickets(undefined)).toBe(false);
    expect(opensTickets('')).toBe(false);
  });
});

const media = (id: string, kind: MediaItem['kind'], metadata: Record<string, unknown> = {}): MediaItem => {
  const parsed = parseMediaRow({ id, kind, title: `${kind} ${id}`, metadata, like_count: 0 });
  if (!parsed) throw new Error('bad fixture');
  return parsed;
};

describe('listenTiles (Listen)', () => {
  it('starts with My playlist in its order, then the stavans and podcasts not on it', () => {
    const tiles = listenTiles([media('p2', 'podcast'), media('s1', 'stavan'), media('v1', 'video')], [media('s1', 'stavan'), media('s3', 'stavan'), media('v9', 'video'), media('p4', 'podcast')]);
    expect(tiles.map((x) => [x.item.id, x.queue])).toEqual([
      ['p2', 'playlist'],
      ['s1', 'playlist'],
      ['v1', 'playlist'],
      ['s3', 'library'],
      ['p4', 'library'],
    ]);
    expect(tiles[0].key).toBe('playlist:p2');
  });
  it('is the library alone when the playlist is empty, and empty when there is nothing', () => {
    expect(listenTiles([], [media('s1', 'stavan'), media('r1', 'recipe')]).map((x) => x.item.id)).toEqual(['s1']);
    expect(listenTiles([], [])).toEqual([]);
  });
  it('shows at most the limit', () => {
    const lib = Array.from({ length: 30 }, (_, i) => media(`s${i}`, 'stavan'));
    expect(listenTiles([media('p', 'podcast')], lib, 5).map((x) => x.item.id)).toEqual(['p', 's0', 's1', 's2', 's3']);
  });
});

describe('giveTiles (Give)', () => {
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
  it('is empty when nothing is open', () => {
    expect(giveTiles([])).toEqual([]);
  });
});

describe('photoTiles (Photos)', () => {
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
  it('opens an online album straight away when its photos live there and none are here', () => {
    const [tile] = photoTiles([album('g', { hasMedia: false, coverPath: null, external_url: 'https://photos.app.goo.gl/abc' })], null);
    expect(tile.onlineUrl).toBe('https://photos.app.goo.gl/abc');
    expect(tile.coverPath).toBeNull();
  });
  it('opens the album here when it has photos here, even when it also has an online link', () => {
    expect(photoTiles([album('g', { external_url: 'https://photos.app.goo.gl/abc' })], null)[0].onlineUrl).toBeNull();
    // A video-only album has no cover but still has photos of its own here.
    expect(photoTiles([album('v', { coverPath: null, external_url: 'https://photos.app.goo.gl/abc' })], null)[0]).toMatchObject({ coverPath: null, onlineUrl: null });
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
    );
    expect(tiles.map((x) => x.albumId)).toEqual(['real', 'online']);
  });
  it('counts the limit after leaving those out, so empty albums never take a place', () => {
    const many = [...Array.from({ length: 3 }, (_, i) => album(`e${i}`, { hasMedia: false, coverPath: null })), ...Array.from({ length: 6 }, (_, i) => album(`a${i}`))];
    expect(photoTiles(many, null, 4).map((x) => x.albumId)).toEqual(['a0', 'a1', 'a2', 'a3']);
  });
  it('shows at most the limit (8 albums unless asked)', () => {
    expect(photoTiles(Array.from({ length: 20 }, (_, i) => album(`a${i}`)), null)).toHaveLength(PHOTO_TILES);
    expect(PHOTO_TILES).toBe(8);
    expect(photoTiles(Array.from({ length: 20 }, (_, i) => album(`a${i}`)), null, 4)).toHaveLength(4);
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
  });
});

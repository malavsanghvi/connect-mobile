import { describe, expect, it } from '@jest/globals';

import { GUEST_RAILS, HOME_RAILS, homeRails, keyTarget, pageTarget, RAIL_CARD, RAIL_PRELOAD, RAIL_SHORTCUTS, railEdges, railGeometry, railTileSize, revealRails, TILE_GAP, TILE_SHAPES, type HomeRail } from '../home-rails';
import { HOME_SHORTCUT_KEYS } from '../home-shortcuts';
import { ALL_ON, HOME_CARD_MODULE, MODULE_KEYS, type ModuleMap } from '../modules';

const off = (...keys: (typeof MODULE_KEYS)[number][]): ModuleMap => Object.fromEntries(keys.map((k) => [k, false]));
const adult = { isAdult: true };
const child = { isAdult: false };

describe('homeRails (which rails show)', () => {
  it('shows every rail, in Home order, to an adult when everything is on', () => {
    expect(homeRails({ rules: null, modules: ALL_ON, member: adult })).toEqual(['learning', 'events', 'listen', 'give', 'photos', 'recipes']);
    expect(HOME_RAILS).toEqual(['learning', 'events', 'listen', 'give', 'photos', 'recipes']);
  });
  it('gates every rail with a Home card that has a module, and names only real shortcuts', () => {
    for (const rail of HOME_RAILS) {
      expect(Object.keys(HOME_CARD_MODULE)).toContain(RAIL_CARD[rail]);
      expect(HOME_CARD_MODULE[RAIL_CARD[rail]]).not.toBeNull();
      for (const key of RAIL_SHORTCUTS[rail] ?? []) expect(HOME_SHORTCUT_KEYS).toContain(key);
    }
  });
  it('gives a guest only the public upcoming events, never a personal rail', () => {
    expect(GUEST_RAILS).toEqual(['events']);
    expect(homeRails({ rules: null, modules: ALL_ON, member: null })).toEqual(['events']);
    expect(homeRails({ rules: null, modules: off('events'), member: null })).toEqual([]);
    // Not even when the community's shortcuts name them.
    expect(homeRails({ rules: { home: { shortcuts: ['learn', 'playlist', 'photos', 'recipe'] } }, modules: ALL_ON, member: null })).toEqual(['events']);
  });
  it('keeps giving for adults only', () => {
    expect(homeRails({ rules: null, modules: ALL_ON, member: child })).toEqual(['learning', 'events', 'listen', 'photos', 'recipes']);
  });
  it("hides a rail whose module is off (or whose module's dependency is)", () => {
    expect(homeRails({ rules: null, modules: off('gyan_path'), member: adult })).toEqual(['events', 'listen', 'give', 'photos', 'recipes']);
    expect(homeRails({ rules: null, modules: off('content'), member: adult })).toEqual(['learning', 'events', 'give']);
    expect(homeRails({ rules: null, modules: off('giving'), member: adult })).toEqual(['learning', 'events', 'listen', 'photos', 'recipes']);
    expect(homeRails({ rules: null, modules: off('events'), member: adult })).toEqual(['learning', 'listen', 'give', 'photos', 'recipes']);
    expect(homeRails({ rules: null, modules: off(...MODULE_KEYS), member: adult })).toEqual([]);
  });
  it("follows the community's Home shortcuts: each one brings its rail", () => {
    const only = (shortcuts: string[]) => homeRails({ rules: { home: { shortcuts } }, modules: ALL_ON, member: adult });
    // Upcoming events and Give are not shortcuts: they stay.
    expect(only([])).toEqual(['events', 'give']);
    expect(only(['learn'])).toEqual(['learning', 'events', 'give']);
    // My playlist or Podcast brings Listen.
    expect(only(['playlist'])).toEqual(['events', 'listen', 'give']);
    expect(only(['podcast'])).toEqual(['events', 'listen', 'give']);
    expect(only(['photos', 'recipe'])).toEqual(['events', 'give', 'photos', 'recipes']);
    // "New here" has no rail (the guide keeps its own card).
    expect(only(['guide'])).toEqual(['events', 'give']);
    // The rails keep Home's order whatever order the shortcuts are in.
    expect(only(['recipe', 'learn'])).toEqual(['learning', 'events', 'give', 'recipes']);
  });
  it('needs both the shortcut and the module: a shortcut cannot bring back a rail whose module is off', () => {
    expect(homeRails({ rules: { home: { shortcuts: ['learn', 'photos'] } }, modules: off('gyan_path', 'content'), member: adult })).toEqual(['events', 'give']);
  });
});

describe('railTileSize (big enough to read, the next tile peeking in)', () => {
  const phone = 375 - 20; // from the cards' left edge to the right edge of a 375 phone
  const visible = (room: number, w: number) => (room + TILE_GAP) / (w + TILE_GAP);

  it('fits two event posters and a peek of the third on a phone', () => {
    const s = railTileSize('poster', phone);
    expect(s).toEqual({ width: 138, height: 207, interval: 150, whole: 2 });
    expect(visible(phone, s.width)).toBeGreaterThan(2.2);
    expect(visible(phone, s.width)).toBeLessThan(2.6);
  });
  it('keeps posters at least 112 wide on the smallest phones', () => {
    const s = railTileSize('poster', 320 - 20);
    expect(s.width).toBeGreaterThanOrEqual(TILE_SHAPES.poster.min);
    expect(s.whole).toBe(2);
    expect(s.height).toBe(Math.round(s.width * 1.5));
  });
  it('fits more tiles, never wider than the shape allows, on the web frame and tablets', () => {
    const web = railTileSize('poster', 480 - 20);
    expect(web.whole).toBe(3);
    expect(web.width).toBeLessThanOrEqual(TILE_SHAPES.poster.max);
    const tablet = railTileSize('poster', 640 - 20);
    expect(tablet.whole).toBe(4);
    expect(tablet.width).toBeLessThanOrEqual(TILE_SHAPES.poster.max);
    expect(railTileSize('square', 2000).width).toBeLessThanOrEqual(TILE_SHAPES.square.max);
  });
  it('shows one wide tile (goals, albums) with the next peeking in on a phone', () => {
    const s = railTileSize('wide', phone);
    expect(s.whole).toBe(1);
    expect(s.width).toBe(264);
    expect(s.height).toBe(Math.round(264 * (9 / 16)));
    expect(visible(phone, s.width)).toBeGreaterThan(1.2);
  });
  it('caps a giving card and leaves its height to its words', () => {
    const s = railTileSize('card', phone);
    expect(s.width).toBe(TILE_SHAPES.card.max);
    expect(s.height).toBeNull();
    expect(s.interval).toBe(s.width + TILE_GAP);
  });
  it('makes tiles larger with a larger text size (up to 1.3×), still with a peek', () => {
    const standard = railTileSize('square', phone);
    const largest = railTileSize('square', phone, 1.3);
    expect(largest.width).toBeGreaterThan(standard.width);
    expect(largest.width).toBeGreaterThanOrEqual(Math.round(TILE_SHAPES.square.min * 1.3));
    expect(railTileSize('square', phone, 3).width).toBe(railTileSize('square', phone, 1.3).width);
    expect(railTileSize('square', phone, 0.5)).toEqual(standard);
    expect(visible(phone, largest.width) % 1).toBeGreaterThan(0.2);
  });
  it('shows a peek of the next tile on every phone width from 320 to 430, for every shape', () => {
    for (const shape of ['poster', 'square', 'wide', 'card'] as const) {
      for (const screen of [320, 360, 375, 390, 414, 430]) {
        const room = screen - 20;
        const s = railTileSize(shape, room);
        const shown = (room + TILE_GAP) / s.interval;
        // Not a whole number of tiles: part of the next one shows at the right edge, so the row clearly goes on.
        expect(shown % 1).toBeGreaterThan(0.15);
        expect(shown % 1).toBeLessThan(0.95);
        expect(s.width).toBeGreaterThanOrEqual(TILE_SHAPES[shape].min);
        expect(s.width).toBeLessThanOrEqual(TILE_SHAPES[shape].max);
      }
    }
  });
  it('never breaks on a width it cannot use', () => {
    for (const w of [0, -10, Number.NaN, Number.POSITIVE_INFINITY]) {
      const s = railTileSize('poster', w);
      expect(Number.isFinite(s.width)).toBe(true);
      expect(s.width).toBeGreaterThanOrEqual(TILE_SHAPES.poster.min);
      expect(s.whole).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('railGeometry (from the cards’ left edge to the screen’s right edge)', () => {
  const base = { frameWidth: 480, maxContentWidth: 640, gutter: 20 };

  it('is the gutter on each side on a phone, with the room out to the right edge of the screen', () => {
    // 375 wide: the cards are 335 wide inside the gutters.
    expect(railGeometry({ ...base, measured: 335, windowWidth: 375, web: false })).toEqual({ bleed: 20, room: 355 });
    expect(railGeometry({ ...base, measured: 280, windowWidth: 320, web: false })).toEqual({ bleed: 20, room: 300 });
  });
  it('estimates the same before the rail has been measured', () => {
    expect(railGeometry({ ...base, measured: 0, windowWidth: 375, web: false })).toEqual({ bleed: 20, room: 355 });
    expect(railGeometry({ ...base, measured: Number.NaN, windowWidth: 430, web: false })).toEqual({ bleed: 20, room: 410 });
  });
  it('runs out to the screen edges on a tablet, past the margin of the 640 wide column', () => {
    // 1024 wide: the column is 640 (600 of cards), 192 either side.
    expect(railGeometry({ ...base, measured: 600, windowWidth: 1024, web: false })).toEqual({ bleed: 212, room: 812 });
    expect(railGeometry({ ...base, measured: 0, windowWidth: 1024, web: false })).toEqual({ bleed: 212, room: 812 });
  });
  it('stays inside the phone-width frame on the web, whatever the browser window is', () => {
    // The frame is 480 and the page scrollbar takes 15 of it: 465 of content, 425 of cards.
    expect(railGeometry({ ...base, measured: 425, windowWidth: 1920, web: true })).toEqual({ bleed: 20, room: 445 });
    expect(railGeometry({ ...base, measured: 0, windowWidth: 1920, web: true })).toEqual({ bleed: 20, room: 460 });
    expect(railGeometry({ ...base, measured: 0, windowWidth: 390, web: true })).toEqual({ bleed: 20, room: 370 });
  });
  it('is never negative for a width it cannot use', () => {
    for (const w of [0, -5, Number.NaN]) {
      const g = railGeometry({ ...base, measured: 0, windowWidth: w, web: false });
      expect(g.room).toBe(0);
      expect(g.bleed).toBe(20);
    }
  });
});

describe('pageTarget, keyTarget and railEdges (the ‹ › buttons and arrow keys on the web)', () => {
  it('moves a screenful from the tile at the left edge, inside the row', () => {
    expect(pageTarget(0, 150, 2, 8)).toBe(2);
    expect(pageTarget(300, 150, 2, 8)).toBe(4);
    expect(pageTarget(290, 150, -2, 8)).toBe(0);
    expect(pageTarget(900, 150, 2, 8)).toBe(7);
    expect(pageTarget(-40, 150, -2, 8)).toBe(0);
  });
  it('is 0 when there is nothing to move', () => {
    expect(pageTarget(300, 0, 2, 8)).toBe(0);
    expect(pageTarget(300, 150, 2, 0)).toBe(0);
    expect(pageTarget(Number.NaN, 150, 1, 4)).toBe(1);
  });
  it('steps from tile to tile with the arrows, Home and End', () => {
    expect(keyTarget('ArrowRight', 0, 5)).toBe(1);
    expect(keyTarget('ArrowRight', 4, 5)).toBe(4);
    expect(keyTarget('ArrowLeft', 0, 5)).toBe(0);
    expect(keyTarget('ArrowLeft', 3, 5)).toBe(2);
    expect(keyTarget('Home', 3, 5)).toBe(0);
    expect(keyTarget('End', 1, 5)).toBe(4);
    expect(keyTarget('Enter', 1, 5)).toBeNull();
    expect(keyTarget('ArrowDown', 1, 5)).toBeNull();
    expect(keyTarget('ArrowRight', 0, 0)).toBeNull();
  });
  it('offers › at the start, both in the middle and only ‹ at the end', () => {
    expect(railEdges(0, 300, 900)).toEqual({ prev: false, next: true });
    expect(railEdges(150, 300, 900)).toEqual({ prev: true, next: true });
    expect(railEdges(600, 300, 900)).toEqual({ prev: true, next: false });
    // A hair short of either end counts as the end (sub-pixel scroll positions).
    expect(railEdges(3, 300, 900).prev).toBe(false);
    expect(railEdges(597, 300, 900).next).toBe(false);
  });
  it('offers neither when the whole row fits, or before the rail is measured', () => {
    expect(railEdges(0, 300, 300)).toEqual({ prev: false, next: false });
    expect(railEdges(0, 0, 900)).toEqual({ prev: false, next: false });
    expect(railEdges(Number.NaN, 300, 900)).toEqual({ prev: false, next: true });
  });
});

describe('revealRails (a rail loads as it comes near the screen)', () => {
  const tops: Partial<Record<HomeRail, number>> = { learning: 700, events: 1000, listen: 1300, give: 1600, photos: 1900 };

  it('loads the rails above the bottom of the screen plus one more screen', () => {
    expect(revealRails(tops, [], 800, 800)).toEqual(['learning', 'events', 'listen', 'give']);
    expect(revealRails(tops, [], 800, 0)).toEqual(['learning']);
  });
  it('on a phone loads only the rails near the screen at first, half a screen ahead (the rest wait until the member scrolls)', () => {
    // 660 px of visible Home, the cards taking about 600 px: the first two rails are near, the others are not.
    const phoneTops: Partial<Record<HomeRail, number>> = { learning: 620, events: 900, listen: 1180, give: 1450, photos: 1700, recipes: 2000 };
    expect(RAIL_PRELOAD).toBeGreaterThan(0);
    expect(RAIL_PRELOAD).toBeLessThan(1);
    expect(revealRails(phoneTops, [], 660, 660 * RAIL_PRELOAD)).toEqual(['learning', 'events']);
    // A little scrolling brings the next one in before it reaches the screen.
    expect(revealRails(phoneTops, ['learning', 'events'], 660 + 200, 660 * RAIL_PRELOAD)).toEqual(['learning', 'events', 'listen']);
  });
  it('adds rails as the member scrolls and never drops one', () => {
    const first = revealRails(tops, [], 800, 0);
    const later = revealRails(tops, first, 1400, 0);
    expect(later).toEqual(['learning', 'events', 'listen']);
    expect(revealRails(tops, later, 200, 0)).toBe(later);
  });
  it('returns the same list when nothing new is near (no re-render)', () => {
    const now = revealRails(tops, [], 2000, 0);
    expect(revealRails(tops, now, 2000, 800)).toBe(now);
  });
  it('waits for a rail that is not laid out yet, and for a screen it cannot measure', () => {
    expect(revealRails({ learning: Number.NaN }, [], 800, 800)).toEqual([]);
    expect(revealRails(tops, [], Number.NaN, 800)).toEqual([]);
    expect(revealRails(tops, [], 800, -50)).toEqual(['learning']);
  });
});

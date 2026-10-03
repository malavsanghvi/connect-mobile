import { describe, expect, it } from '@jest/globals';

import {
  HERO_PEEK,
  HOME_ROWS,
  homeRows,
  keyTarget,
  LEARN_LISTEN_AREA,
  LEARN_LISTEN_CARD,
  LEARN_LISTEN_SHORTCUT,
  LEARN_LISTEN_TILES,
  learnListenTiles,
  LEFT_SLIVER,
  lifeTiles,
  LIFE_TILES,
  pageTarget,
  RAIL_PRELOAD,
  railEdges,
  railGeometry,
  railRestOffset,
  railSnapOffsets,
  railSnapShift,
  railTileSize,
  railTop,
  railView,
  revealRails,
  TILE_GAP,
  TILE_SHAPES,
  TIME_TILE_PAD_X,
  tileCutOff,
  todayTimeRoom,
  type HomeAccess,
  type HomeRow,
  type TileShape,
} from '../home-rails';
import { HOME_SHORTCUT_KEYS } from '../home-shortcuts';
import { ALL_ON, HOME_CARD_MODULE, MODULE_KEYS, type ModuleMap } from '../modules';

const off = (...keys: (typeof MODULE_KEYS)[number][]): ModuleMap => Object.fromEntries(keys.map((k) => [k, false]));
const adult = { isAdult: true, hasHousehold: true };
const child = { isAdult: false, hasHousehold: true };
const allowed: HomeAccess = { guide: true, learn: true, listen: true, look: true };
const rows = (over: { rules?: unknown; modules?: ModuleMap; member?: typeof adult | null; access?: Partial<HomeAccess> } = {}) =>
  homeRows({ rules: over.rules ?? null, modules: over.modules ?? ALL_ON, member: over.member === undefined ? adult : over.member, access: { ...allowed, ...over.access } });

describe('homeRows (which rows show)', () => {
  it('shows all six rows, in Home order, to an adult when everything is on', () => {
    expect(rows()).toEqual(['today', 'specialDays', 'events', 'give', 'life', 'learnListen']);
    expect(HOME_ROWS).toEqual(['today', 'specialDays', 'events', 'give', 'life', 'learnListen']);
  });
  it('gives a guest Today, the public events and the guide tiles, never a personal row', () => {
    expect(rows({ member: null })).toEqual(['today', 'events', 'life']);
    expect(rows({ member: null, modules: off('events') })).toEqual(['today', 'life']);
  });
  it('keeps giving for adults only, and Plan a special day for a member with a household', () => {
    expect(rows({ member: child })).toEqual(['today', 'specialDays', 'events', 'life', 'learnListen']);
    expect(rows({ member: { isAdult: true, hasHousehold: false } })).toEqual(['today', 'events', 'give', 'life', 'learnListen']);
  });
  it("hides a row whose module is off (or whose module's dependency is)", () => {
    expect(rows({ modules: off('events') })).toEqual(['today', 'specialDays', 'give', 'life', 'learnListen']);
    expect(rows({ modules: off('giving') })).toEqual(['today', 'specialDays', 'events', 'life', 'learnListen']);
    // Content and Gyan Path are the two modules the Learn & listen tiles come from.
    expect(rows({ modules: off('content') })).toEqual(['today', 'specialDays', 'events', 'give', 'life', 'learnListen']);
    expect(rows({ modules: off('content', 'gyan_path') })).toEqual(['today', 'specialDays', 'events', 'give', 'life']);
  });
  it('keeps special days with giving off (they offer See special days instead of a labh) and with every module off', () => {
    expect(rows({ modules: off(...MODULE_KEYS) })).toEqual(['today', 'specialDays', 'life']);
  });
  it('hides Learn & listen when nothing is left in it', () => {
    expect(rows({ access: { learn: false, listen: false, look: false }, rules: { home: { shortcuts: ['learn', 'playlist', 'podcast', 'recipe'] } } })).not.toContain('learnListen');
    expect(rows({ rules: { home: { shortcuts: [] } } })).not.toContain('learnListen');
  });
});

describe('lifeTiles (Life@JSH)', () => {
  const life = (over: { modules?: ModuleMap; guideAllowed?: boolean; member?: typeof adult | null } = {}) =>
    lifeTiles({ modules: over.modules ?? ALL_ON, guideAllowed: over.guideAllowed ?? true, member: over.member === undefined ? adult : over.member });

  it('has New here, the guide sections the old My JSH card named, and Special days, in order', () => {
    expect(life()).toEqual(['guide', 'whatsapp', 'zone', 'timings', 'volunteer', 'admin', 'specialDays']);
    expect(LIFE_TILES).toEqual(['guide', 'whatsapp', 'zone', 'timings', 'volunteer', 'admin', 'specialDays']);
  });
  it('gives a visitor the guide tiles, not Special days', () => {
    expect(life({ member: null })).toEqual(['guide', 'whatsapp', 'zone', 'timings', 'volunteer', 'admin']);
  });
  it("follows the guide's access level: where the guide is closed to this person only Today's timings (public) and Special days stay", () => {
    expect(life({ guideAllowed: false, member: null })).toEqual(['timings']);
    expect(life({ guideAllowed: false })).toEqual(['timings', 'specialDays']);
  });
  it('leaves out a section whose module is off, as the guide does', () => {
    expect(life({ modules: off('comms') })).not.toContain('whatsapp');
    expect(life({ modules: off('volunteers') })).not.toContain('volunteer');
    expect(life({ modules: off('comms', 'volunteers') })).toEqual(['guide', 'zone', 'timings', 'admin', 'specialDays']);
  });
  it('needs a household for Special days, and keeps it with giving off', () => {
    expect(life({ member: { isAdult: true, hasHousehold: false } })).not.toContain('specialDays');
    expect(life({ modules: off('giving') })).toContain('specialDays');
  });
});

describe('learnListenTiles (the old shortcut buttons as tiles)', () => {
  const tiles = (over: { rules?: unknown; modules?: ModuleMap; signedIn?: boolean; access?: Partial<HomeAccess> } = {}) =>
    learnListenTiles({ rules: over.rules ?? null, modules: over.modules ?? ALL_ON, signedIn: over.signedIn ?? true, access: { ...allowed, ...over.access } });

  it('has Continue learning, My playlist, Podcasts, Recipes and Photos, in the owner’s order', () => {
    expect(tiles()).toEqual(['learning', 'playlist', 'podcasts', 'recipes', 'photos']);
    expect(LEARN_LISTEN_TILES).toEqual(['learning', 'playlist', 'podcasts', 'recipes', 'photos']);
  });
  it('names only real shortcuts, real Home cards with a module, and areas the access levels know', () => {
    for (const tile of LEARN_LISTEN_TILES) {
      expect(HOME_SHORTCUT_KEYS).toContain(LEARN_LISTEN_SHORTCUT[tile]);
      expect(Object.keys(HOME_CARD_MODULE)).toContain(LEARN_LISTEN_CARD[tile]);
      expect(HOME_CARD_MODULE[LEARN_LISTEN_CARD[tile]]).not.toBeNull();
      expect([null, 'learn', 'listen', 'look']).toContain(LEARN_LISTEN_AREA[tile]);
    }
  });
  it('is for a signed-in member: every tile leads to a screen that asks a visitor to sign in', () => {
    expect(tiles({ signedIn: false })).toEqual([]);
  });
  it("follows the community's Home shortcuts: each tile still needs its shortcut", () => {
    const only = (shortcuts: string[]) => tiles({ rules: { home: { shortcuts } } });
    expect(only([])).toEqual([]);
    expect(only(['learn'])).toEqual(['learning']);
    expect(only(['playlist'])).toEqual(['playlist']);
    expect(only(['podcast', 'recipe'])).toEqual(['podcasts', 'recipes']);
    expect(only(['photos'])).toEqual(['photos']);
    // "New here" is not a tile of this row (the guide has Life@JSH), and the order is Home's, whatever order the shortcuts are in.
    expect(only(['guide'])).toEqual([]);
    expect(only(['recipe', 'learn'])).toEqual(['learning', 'recipes']);
  });
  it('hides a tile whose module is off: a shortcut cannot bring it back', () => {
    expect(tiles({ modules: off('gyan_path') })).toEqual(['playlist', 'podcasts', 'recipes', 'photos']);
    expect(tiles({ modules: off('content') })).toEqual(['learning']);
    expect(tiles({ modules: off('gyan_path', 'content') })).toEqual([]);
  });
  it('hides a tile the access levels do not allow, area by area, not shown locked', () => {
    expect(tiles({ access: { learn: false } })).toEqual(['playlist', 'podcasts', 'recipes', 'photos']);
    expect(tiles({ access: { listen: false } })).toEqual(['learning', 'recipes', 'photos']);
    expect(tiles({ access: { look: false } })).toEqual(['learning', 'playlist', 'podcasts', 'photos']);
    // Photos belong to no area: they stay for a member whatever the levels say.
    expect(tiles({ access: { learn: false, listen: false, look: false } })).toEqual(['photos']);
  });
  it('needs the shortcut, the module and the area together', () => {
    expect(tiles({ rules: { home: { shortcuts: ['podcast', 'photos'] } }, modules: off('content'), access: { listen: true } })).toEqual([]);
    expect(tiles({ rules: { home: { shortcuts: ['podcast', 'photos'] } }, access: { listen: false } })).toEqual(['photos']);
  });
});

describe('railView (what a row draws)', () => {
  it('draws skeleton tiles while it does not know its tiles yet', () => {
    expect(railView({ tiles: undefined, error: false, notice: false })).toBe('loading');
    // A notice does not stop the skeleton: the row is still on its way.
    expect(railView({ tiles: undefined, error: false, notice: true })).toBe('loading');
  });
  it('draws its tiles when it has some, with or without something to say about part of them', () => {
    expect(railView({ tiles: 3, error: false, notice: false })).toBe('tiles');
    expect(railView({ tiles: 1, error: false, notice: true })).toBe('tiles');
  });
  it('is left out when it has no tile and nothing is wrong', () => {
    expect(railView({ tiles: 0, error: false, notice: false })).toBe('hidden');
  });
  it('keeps its title and says what is wrong when it has no tile because its loads failed', () => {
    // The row loaded, found nothing to show, and part of it failed (a notice with Try again): never a silently missing row.
    expect(railView({ tiles: 0, error: false, notice: true })).toBe('message');
    expect(railView({ tiles: 0, error: true, notice: false })).toBe('message');
    expect(railView({ tiles: 0, error: true, notice: true })).toBe('message');
  });
  it('says so when the load failed before any tile was known', () => {
    expect(railView({ tiles: undefined, error: true, notice: false })).toBe('message');
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
    expect(railTileSize('feature', 2000).width).toBeLessThanOrEqual(TILE_SHAPES.feature.max);
  });
  it('shows one wide tile (Learn & listen) with the next peeking in on a phone', () => {
    const s = railTileSize('wide', phone);
    expect(s.whole).toBe(1);
    expect(s.width).toBe(264);
    expect(s.height).toBe(Math.round(264 * (9 / 16)));
    expect(visible(phone, s.width)).toBeGreaterThan(1.2);
  });
  it('caps a card (a special day, a giving opportunity) and leaves its height to its words', () => {
    const s = railTileSize('card', phone);
    expect(s.width).toBe(TILE_SHAPES.card.max);
    expect(s.height).toBeNull();
    expect(s.interval).toBe(s.width + TILE_GAP);
  });
  it('fits two Life@JSH tiles and a peek of the third on a phone', () => {
    const s = railTileSize('feature', phone);
    expect(s).toEqual({ width: 138, height: null, interval: 150, whole: 2 });
  });
  it('makes tiles larger with a larger text size (up to 1.3×), still with a peek', () => {
    const standard = railTileSize('feature', phone);
    const largest = railTileSize('feature', phone, 1.3);
    expect(largest.width).toBeGreaterThan(standard.width);
    expect(largest.width).toBeGreaterThanOrEqual(Math.round(TILE_SHAPES.feature.min * 1.3));
    expect(railTileSize('feature', phone, 3).width).toBe(railTileSize('feature', phone, 1.3).width);
    expect(railTileSize('feature', phone, 0.5)).toEqual(standard);
    expect(visible(phone, largest.width) % 1).toBeGreaterThan(0.2);
  });
  it('shows a peek of the next tile on every phone width from 320 to 430, for every shape but the hero', () => {
    for (const shape of ['poster', 'wide', 'card', 'feature'] as const) {
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
    for (const shape of ['hero', 'poster', 'wide', 'card', 'feature'] as TileShape[]) {
      for (const w of [0, -10, Number.NaN, Number.POSITIVE_INFINITY]) {
        const s = railTileSize(shape, w);
        expect(Number.isFinite(s.width)).toBe(true);
        expect(s.width).toBeGreaterThanOrEqual(0);
        expect(s.whole).toBeGreaterThanOrEqual(1);
      }
    }
  });
});

describe('railTileSize for the hero tiles (Today and My Jain Way)', () => {
  const room = (screen: number) => screen - 20;
  /** How much of the next tile shows at the right edge when the row starts. */
  const peekOf = (screen: number) => {
    const s = railTileSize('hero', room(screen), 1, TILE_GAP, { count: 2, bleed: 20 });
    return room(screen) - s.width - TILE_GAP;
  };

  it('leaves a 32 px sliver of My Jain Way at the right edge on phones from 360 to 430', () => {
    expect(HERO_PEEK).toBe(32);
    for (const screen of [360, 375, 390, 414, 430]) expect(peekOf(screen)).toBe(HERO_PEEK);
    expect(railTileSize('hero', 355, 1, TILE_GAP, { count: 2, bleed: 20 })).toEqual({ width: 311, height: null, interval: 323, whole: 1 });
  });
  it('keeps the tile wide enough for its timings (280) on the smallest phones, where the sliver shrinks instead', () => {
    expect(TILE_SHAPES.hero.min).toBe(280);
    expect(railTileSize('hero', room(320), 1, TILE_GAP, { count: 2, bleed: 20 }).width).toBe(280);
    // 320 px: the 8 px the gutter alone would leave. A little wider and the sliver grows back to 32.
    expect(peekOf(320)).toBe(8);
    expect(peekOf(335)).toBe(23);
    expect(peekOf(344)).toBe(HERO_PEEK);
    expect(peekOf(340)).toBeGreaterThan(24);
  });
  it('never makes a hero wider than the shape allows', () => {
    expect(railTileSize('hero', 2000, 1, TILE_GAP, { count: 2, bleed: 20 }).width).toBe(TILE_SHAPES.hero.max);
  });
  it('does not use the text size: Today keeps its width, and its times have the room they had', () => {
    expect(railTileSize('hero', 355, 1.3, TILE_GAP, { count: 2, bleed: 20 })).toEqual(railTileSize('hero', 355, 1, TILE_GAP, { count: 2, bleed: 20 }));
  });
  describe('the room Today’s three times have for their words (the old card wrapped nothing at any text size)', () => {
    // The old card was as wide as the cards (screen less two gutters), with 8 px of padding inside each timing tile.
    const OLD_TILE_PAD = 8;
    const oldRoom = (screen: number) => todayTimeRoom(screen - 40, OLD_TILE_PAD);
    const heroRoom = (screen: number, scale: number) => todayTimeRoom(railTileSize('hero', room(screen), scale, TILE_GAP, { count: 2, bleed: 20 }).width);

    it('is at least what the old card gave, at 360 / 375 / 390 / 412 and at every text size', () => {
      for (const screen of [360, 375, 390, 412]) {
        for (const scale of [1, 1.15, 1.3]) expect(heroRoom(screen, scale)).toBeGreaterThanOrEqual(oldRoom(screen) - 1e-9);
      }
    });
    it('is exactly what the old card gave wherever the tile is narrower than the cards only by the peeking sliver', () => {
      for (const screen of [360, 375, 390, 412, 430]) expect(heroRoom(screen, 1)).toBeCloseTo(oldRoom(screen), 6);
    });
    it('is more than before on the smallest phones, where the tile keeps its 280', () => {
      expect(heroRoom(320, 1)).toBeCloseTo(oldRoom(320) + 2 * (OLD_TILE_PAD - TIME_TILE_PAD_X), 6);
    });
    it('would be 8 px short at 375 with the old padding inside a tile 24 px narrower (the wrapping the review found)', () => {
      const narrow = railTileSize('hero', room(375), 1, TILE_GAP, { count: 2, bleed: 20 }).width;
      expect(narrow).toBe(311);
      expect(todayTimeRoom(narrow, OLD_TILE_PAD)).toBeCloseTo(oldRoom(375) - 8, 6);
      expect(todayTimeRoom(narrow)).toBeCloseTo(oldRoom(375), 6);
    });
    it('is as roomy alone (a guest sees Today at the old width) as it was, and a little more', () => {
      const alone = railTileSize('hero', room(375), 1, TILE_GAP, { count: 1, bleed: 20 }).width;
      expect(alone).toBe(335);
      expect(todayTimeRoom(alone)).toBeGreaterThan(oldRoom(375));
    });
  });
  it('is as wide as the cards when it is alone (a guest sees Today alone, exactly as the card was)', () => {
    expect(railTileSize('hero', 355, 1, TILE_GAP, { count: 1, bleed: 20 }).width).toBe(335);
    expect(railTileSize('hero', 410, 1, TILE_GAP, { count: 1, bleed: 20 }).width).toBe(390);
    // On a tablet the cards are 600 wide inside a 640 column; the row reaches the screen's edge, the lone tile does not.
    expect(railTileSize('hero', 812, 1, TILE_GAP, { count: 1, bleed: 212 }).width).toBe(600);
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

describe('railSnapShift, railRestOffset and railSnapOffsets (where a row comes to rest)', () => {
  const interval = 150;

  it('rests a moved row a sliver of the previous tile before its natural place on a phone', () => {
    // The gutter (20) less the gap (12) leaves only 8 px of the previous tile; resting 8 px earlier makes it LEFT_SLIVER.
    expect(LEFT_SLIVER).toBe(16);
    const shift = railSnapShift(20);
    expect(shift).toBe(-8);
    // Tile 1 rests at its natural 150, less 8: tile 0 (138 wide, starting at 20) then ends LEFT_SLIVER px in.
    expect(railRestOffset(1, interval, shift)).toBe(142);
    expect(20 + 138 - railRestOffset(1, interval, shift)).toBe(LEFT_SLIVER);
  });
  it('rests the first tile on the gutter, scrolled by nothing', () => {
    expect(railRestOffset(0, interval, -8)).toBe(0);
    expect(railRestOffset(-3, interval, -8)).toBe(0);
  });
  it('rests every tile on the column’s left edge on a tablet, where the row starts further in than any sliver needs', () => {
    expect(railSnapShift(212)).toBe(0);
    expect(railRestOffset(2, 300, 0)).toBe(600);
  });
  it('lists every resting place for snapToOffsets, one per tile', () => {
    expect(railSnapOffsets(4, interval, -8)).toEqual([0, 142, 292, 442]);
    expect(railSnapOffsets(0, interval, -8)).toEqual([]);
    expect(railSnapOffsets(1, interval, -8)).toEqual([0]);
    expect(railSnapOffsets(Number.NaN, interval, -8)).toEqual([]);
  });
  it('never rests before the start or on a shift it cannot use', () => {
    expect(railRestOffset(1, 5, -8)).toBe(0);
    expect(railRestOffset(1, interval, Number.NaN)).toBe(150);
    expect(railRestOffset(1, interval, 30)).toBe(150);
    expect(railSnapShift(Number.NaN)).toBe(-28);
    expect(railSnapShift(0)).toBe(-28);
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
  it('finds the tile at the left edge of a row at rest, where it rests before its natural place', () => {
    // Tile 3 rests at 3 × 150 − 8.
    expect(pageTarget(442, 150, 1, 8, -8)).toBe(4);
    expect(pageTarget(442, 150, -1, 8, -8)).toBe(2);
    // The first tile rests at 0, which is also "tile 0" with a shift.
    expect(pageTarget(0, 150, 1, 8, -8)).toBe(1);
    expect(pageTarget(0, 150, -1, 8, -8)).toBe(0);
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

describe('tileCutOff (a tile the keyboard reached that must be brought into view)', () => {
  // A 390 px phone: tiles 150 wide, 12 apart, the row starting 20 px in.
  const tile = { width: 150, interval: 162 };
  const cut = (index: number, scrollX: number, view = 390) => tileCutOff(index, scrollX, view, tile, 20);

  it('is false for the tiles that are wholly in view', () => {
    expect(cut(0, 0)).toBe(false);
    expect(cut(1, 0)).toBe(false);
    // Scrolled one tile on: the second and third are in view.
    expect(cut(1, 162)).toBe(false);
    expect(cut(2, 162)).toBe(false);
  });
  it('is false for a tile at its resting place, a sliver before its natural one', () => {
    // Tile 2 rests at 2 × 162 − 8.
    expect(cut(2, 316)).toBe(false);
    expect(cut(3, 316)).toBe(false);
    expect(cut(4, 316)).toBe(true);
  });
  it('is true for a tile the right edge cuts off (the third and later ones from the start)', () => {
    expect(cut(2, 0)).toBe(true);
    expect(cut(3, 0)).toBe(true);
    expect(cut(3, 162)).toBe(true);
  });
  it('is true for a tile the rail has been scrolled past', () => {
    expect(cut(0, 162)).toBe(true);
    expect(cut(0, 20)).toBe(true);
  });
  it('ignores a hair of difference, as a sub-pixel scroll position leaves', () => {
    expect(cut(1, 163)).toBe(false);
    expect(cut(1, 165)).toBe(true);
    expect(cut(1, 161.4)).toBe(false);
  });
  it('knows nothing is cut off before the rail has a width, or for an index it cannot place', () => {
    expect(cut(5, 0, 0)).toBe(false);
    expect(cut(5, 0, Number.NaN)).toBe(false);
    expect(cut(Number.NaN, 0)).toBe(false);
    // A scroll position that cannot be read counts as the start; a negative index as the first tile.
    expect(cut(0, Number.NaN)).toBe(false);
    expect(cut(-3, 0)).toBe(false);
  });
});

describe('railTop (where a row is, or that its layout is no position)', () => {
  it('is the top of a row that has a box', () => {
    expect(railTop({ y: 640, width: 350, height: 210 })).toBe(640);
    // A row at the very top of Home is at 0, which is a position.
    expect(railTop({ y: 0, width: 350, height: 210 })).toBe(0);
  });
  it('is a position for a row that has no height yet (Plan a special day draws nothing until it has days)', () => {
    expect(railTop({ y: 640, width: 350, height: 0 })).toBe(640);
    expect(railTop({ y: 640, width: 350 })).toBe(640);
  });
  it('is null for the 0 x 0 the web reports for a screen that another one covers', () => {
    expect(railTop({ y: 0, width: 0, height: 0 })).toBeNull();
    expect(railTop({ y: 640, width: 0, height: 210 })).toBeNull();
    expect(railTop({ y: Number.NaN, width: 350, height: 210 })).toBeNull();
  });
  it('keeps a hidden Home from loading every row: 0 x 0 taken as "at the top" would reveal them all', () => {
    const hidden = { y: 0, width: 0, height: 0 };
    const reveal = (place: (layout: typeof hidden) => number | null) => {
      const tops: Partial<Record<HomeRow, number>> = {};
      for (const row of HOME_ROWS) {
        const top = place(hidden);
        if (top !== null) tops[row] = top;
      }
      // Home's own first row fills the screen, so only rows near its top would load.
      return revealRails(tops, [], 700, 350);
    };
    expect(reveal((l) => l.y)).toEqual([...HOME_ROWS]);
    expect(reveal(railTop)).toEqual([]);
  });
});

describe('revealRails (a row loads as it comes near the screen)', () => {
  const tops: Partial<Record<HomeRow, number>> = { specialDays: 700, events: 1000, give: 1300, life: 1600, learnListen: 1900 };

  it('loads the rows above the bottom of the screen plus one more screen', () => {
    expect(revealRails(tops, [], 800, 800)).toEqual(['specialDays', 'events', 'give', 'life']);
    expect(revealRails(tops, [], 800, 0)).toEqual(['specialDays']);
  });
  it('on a phone loads only the rows near the screen at first, half a screen ahead (the rest wait until the member scrolls)', () => {
    // 660 px of visible Home, the first row taking about 330 px: the first two rows are near, the others are not.
    const phoneTops: Partial<Record<HomeRow, number>> = { specialDays: 420, events: 680, give: 1010, life: 1300, learnListen: 1600 };
    expect(RAIL_PRELOAD).toBeGreaterThan(0);
    expect(RAIL_PRELOAD).toBeLessThan(1);
    expect(revealRails(phoneTops, [], 660, 660 * RAIL_PRELOAD)).toEqual(['specialDays', 'events']);
    // A little scrolling brings the next one in before it reaches the screen.
    expect(revealRails(phoneTops, ['specialDays', 'events'], 660 + 200, 660 * RAIL_PRELOAD)).toEqual(['specialDays', 'events', 'give']);
  });
  it('adds rows as the member scrolls and never drops one', () => {
    const first = revealRails(tops, [], 800, 0);
    const later = revealRails(tops, first, 1400, 0);
    expect(later).toEqual(['specialDays', 'events', 'give']);
    expect(revealRails(tops, later, 200, 0)).toBe(later);
  });
  it('returns the same list when nothing new is near (no re-render)', () => {
    const now = revealRails(tops, [], 2000, 0);
    expect(revealRails(tops, now, 2000, 800)).toBe(now);
  });
  it('waits for a row that is not laid out yet, and for a screen it cannot measure', () => {
    expect(revealRails({ specialDays: Number.NaN }, [], 800, 800)).toEqual([]);
    expect(revealRails(tops, [], Number.NaN, 800)).toEqual([]);
    expect(revealRails(tops, [], 800, -50)).toEqual(['specialDays']);
  });
});

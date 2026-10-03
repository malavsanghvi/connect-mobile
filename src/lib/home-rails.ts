/**
 * Home in rows (owner, 2026-10-02): every row is a Netflix-style strip of tiles that scrolls sideways, with the
 * next tile peeking in at the right edge and, once the row has been moved, a sliver of the previous one at the
 * left. This file holds the pure parts, unit-tested in src/lib/__tests__/home-rails.test.ts:
 *
 * - which rows show (homeRows) and which tiles the two rows made of fixed tiles have (lifeTiles for Life@JSH,
 *   learnListenTiles for Learn & listen): the community's modules (the same Home gating as the cards, see
 *   src/lib/modules.ts HOME_CARD_MODULE), its Home shortcuts (centers.rules.home.shortcuts), the access levels
 *   (src/lib/access.ts), signed in or a guest, and the adults-only rule for giving;
 * - how big a tile is for the room there is (railTileSize) and where the rail starts and ends on the screen
 *   (railGeometry): large enough to read on a phone, with the next tile peeking in, or filling the row when it is alone;
 *   the room Today's three timings have for their words (todayTimeRoom);
 * - what a row draws (railView: skeleton, tiles, a message, or nothing) and how many of its tiles have their pictures
 *   mounted (imageReach);
 * - where a swipe, the ‹ › buttons and the arrow keys take the rail (railSnapShift, railRestOffset, pageTarget,
 *   keyTarget, railEdges), and whether a tile the keyboard reached is cut off (tileCutOff);
 * - which rows are near enough to the screen to load (revealRails, with railTop for where a row is), so a row
 *   loads only when the member scrolls towards it.
 *
 * The rows themselves are drawn in src/features/home-rails.tsx; their tiles are built from the data in
 * src/features/home-rail-items.ts.
 */
import { configuredShortcuts, type HomeShortcut } from './home-shortcuts';
import { isGuideSectionVisible, isHomeCardVisible, type GuideSection, type HomeCard, type ModuleMap } from './modules';
import { space } from '../theme';

// ---------------------------------------------------------------------------
// Which rows show
// ---------------------------------------------------------------------------

/** The rows, in the order they show on Home. */
export const HOME_ROWS = ['today', 'specialDays', 'events', 'give', 'life', 'learnListen'] as const;
export type HomeRow = (typeof HOME_ROWS)[number];

/** The areas of the access levels (src/lib/access.ts) the Learn & listen tiles and the guide tiles depend on. */
export type HomeAccess = { guide: boolean; learn: boolean; listen: boolean; look: boolean };

/** Who is looking: null for a guest (signed out, browsing a community). */
export type HomeMember = { isAdult: boolean; hasHousehold: boolean } | null;

export type HomeRowsInput = {
  /** `centers.rules` of the community (its Home shortcuts). */
  rules: unknown;
  modules: ModuleMap;
  member: HomeMember;
  access: HomeAccess;
};

/**
 * The rows to show, in Home order. A row can still turn out to have nothing in it (no special day in the next
 * two months, no open opportunity): it is then left out once it has loaded.
 *
 * - Today (with My Jain Way beside it for a member) is always there.
 * - Plan a special day: a member with a household, unless the community switched special days off.
 * - Events: the Events module; a guest sees the public ones.
 * - Giving opportunities: adults only (money), and only with the Giving module on.
 * - Life@JSH and Learn & listen: those with at least one tile.
 */
export function homeRows({ rules, modules, member, access }: HomeRowsInput): HomeRow[] {
  return HOME_ROWS.filter((row) => {
    switch (row) {
      case 'today':
        return isHomeCardVisible(modules, 'today');
      case 'specialDays':
        return !!member?.hasHousehold && isHomeCardVisible(modules, 'specialDay');
      case 'events':
        return isHomeCardVisible(modules, 'railEvents');
      case 'give':
        return !!member?.isAdult && isHomeCardVisible(modules, 'giving');
      case 'life':
        return lifeTiles({ modules, guideAllowed: access.guide, member }).length > 0;
      case 'learnListen':
        return learnListenTiles({ rules, modules, signedIn: !!member, access }).length > 0;
    }
  });
}

// ---------------------------------------------------------------------------
// Life@{community}
// ---------------------------------------------------------------------------

/** The tiles of the Life@JSH row, in order. */
export const LIFE_TILES = ['guide', 'whatsapp', 'zone', 'timings', 'volunteer', 'admin', 'specialDays'] as const;
export type LifeTile = (typeof LIFE_TILES)[number];

/** The section of the community guide (modules.ts GUIDE_SECTION_MODULE) behind each tile; null: not one. */
export const LIFE_TILE_SECTION: Record<LifeTile, GuideSection | null> = {
  guide: null,
  whatsapp: 'whatsapp',
  zone: 'zones',
  timings: 'timings',
  volunteer: 'volunteer',
  admin: 'admin',
  specialDays: null,
};

export type LifeInput = {
  modules: ModuleMap;
  /** The access level for the community guide lets this person in (useFeature('guide')). */
  guideAllowed: boolean;
  member: HomeMember;
};

/**
 * The Life@JSH tiles this person gets. The guide tiles (New here and the sections of the guide) follow the
 * guide's access level and the modules behind each section, so a visitor gets the ones the organization lets
 * them see. Today's timings are public (the app does not gate them), so that tile stays. "Special days" is for
 * a member with a household and keeps "Add a special day" a tap away when the Plan a special day row is hidden
 * because nothing is coming up.
 */
export function lifeTiles({ modules, guideAllowed, member }: LifeInput): LifeTile[] {
  return LIFE_TILES.filter((tile) => {
    if (tile === 'specialDays') return !!member?.hasHousehold && isHomeCardVisible(modules, 'specialDay');
    const section = LIFE_TILE_SECTION[tile];
    if (tile === 'timings') return section !== null && isGuideSectionVisible(modules, section);
    if (!guideAllowed || !isHomeCardVisible(modules, 'guide')) return false;
    return section === null || isGuideSectionVisible(modules, section);
  });
}

// ---------------------------------------------------------------------------
// Learn & listen
// ---------------------------------------------------------------------------

/** The tiles of the Learn & listen row, in order (the old shortcut buttons, now tiles). */
export const LEARN_LISTEN_TILES = ['learning', 'playlist', 'podcasts', 'recipes', 'photos'] as const;
export type LearnListenTile = (typeof LEARN_LISTEN_TILES)[number];

/** The Home shortcut (centers.rules.home.shortcuts, edited in the portal) that brings each tile. */
export const LEARN_LISTEN_SHORTCUT: Record<LearnListenTile, HomeShortcut> = {
  learning: 'learn',
  playlist: 'playlist',
  podcasts: 'podcast',
  recipes: 'recipe',
  photos: 'photos',
};

/** The Home card (modules.ts HOME_CARD_MODULE) that gates each tile through its module: off means no tile. */
export const LEARN_LISTEN_CARD: Record<LearnListenTile, HomeCard> = {
  learning: 'railLearning',
  playlist: 'railListen',
  podcasts: 'railListen',
  recipes: 'railRecipes',
  photos: 'railPhotos',
};

/** The area of the access levels each tile belongs to: Gyan Path is Learn, the playlist and podcasts Listen, recipes Look. Photos have no area. */
export const LEARN_LISTEN_AREA: Record<LearnListenTile, 'learn' | 'listen' | 'look' | null> = {
  learning: 'learn',
  playlist: 'listen',
  podcasts: 'listen',
  recipes: 'look',
  photos: null,
};

export type LearnListenInput = {
  rules: unknown;
  modules: ModuleMap;
  /** Signed in. Every tile leads to a screen that is for signed-in members today (the library lists, the playlist, albums, Gyan Path progress). */
  signedIn: boolean;
  access: Pick<HomeAccess, 'learn' | 'listen' | 'look'>;
};

/**
 * The Learn & listen tiles this person may use, in order. A tile needs all three: the community's Home
 * shortcut for it (still the portal's setting), its module on (a module off means no tile), and the access
 * level of its area. One the person may not use is left out, not shown locked.
 */
export function learnListenTiles({ rules, modules, signedIn, access }: LearnListenInput): LearnListenTile[] {
  if (!signedIn) return [];
  const shortcuts = configuredShortcuts(rules);
  return LEARN_LISTEN_TILES.filter((tile) => {
    if (!shortcuts.includes(LEARN_LISTEN_SHORTCUT[tile])) return false;
    if (!isHomeCardVisible(modules, LEARN_LISTEN_CARD[tile])) return false;
    const area = LEARN_LISTEN_AREA[tile];
    return area === null || access[area];
  });
}

// ---------------------------------------------------------------------------
// Tile sizes
// ---------------------------------------------------------------------------

/**
 * Tile shapes. `hero` is Today and My Jain Way (as wide as the room allows, the next tile peeking in a fixed
 * sliver), `poster` 2:3 (event flyers), `wide` 16:9 (Learn & listen), `card` (special days and giving: as tall
 * as their words), `feature` (Life@JSH: an icon, a label and a line).
 */
export type TileShape = 'hero' | 'poster' | 'wide' | 'card' | 'feature';

type ShapeSpec = {
  /** Height ÷ width of the picture; null when the words set the height. */
  ratio: number | null;
  /** Narrowest and widest a tile may be (px, at the standard text size; a hero is never scaled). */
  min: number;
  max: number;
  /** How much of the next tile peeks in at the right edge (a share of one tile; a hero uses HERO_PEEK). */
  peek: number;
  /** The widest a tile may be when it is the only one in its row: it fills the cards' width up to this (px). A poster is 1.5 times as tall as it is wide, so it stops sooner. */
  aloneMax: number;
};

export const TILE_SHAPES: Record<TileShape, ShapeSpec> = {
  // A hero is never narrower than 280: that is what Today's three timings need to show whole ("8:03 AM", "Chauvihar" in a third
  // of the card), as the old card had on the smallest phone. Where the room is less than that plus the sliver, the sliver shrinks.
  hero: { ratio: null, min: 280, max: 440, peek: 0, aloneMax: Number.POSITIVE_INFINITY },
  poster: { ratio: 1.5, min: 112, max: 168, peek: 0.4, aloneMax: 340 },
  wide: { ratio: 9 / 16, min: 200, max: 280, peek: 0.3, aloneMax: 440 },
  card: { ratio: null, min: 200, max: 260, peek: 0.3, aloneMax: 440 },
  feature: { ratio: null, min: 128, max: 176, peek: 0.4, aloneMax: 440 },
};

/** Space between two tiles (px). */
export const TILE_GAP = 12;

/** How much of the next hero tile shows at the right edge when the row starts (px). */
export const HERO_PEEK = 32;

/** How much of the previous tile shows at the left edge once a row has been moved (px). */
export const LEFT_SLIVER = 16;

/** Today's card is a hero Card: its border on each side (px). */
const TODAY_CARD_BORDER = 1;

/**
 * The padding inside each of Today's three timing tiles (Sunrise, Navkarsi, Chauvihar), at each side (px). It was
 * space.sm (8). Beside My Jain Way the card is 24 px narrower than the old one, which takes 8 px of room for its words from
 * each of the three tiles ("8:03 AM" wrapped at larger text sizes, "Chauvihar" at the largest); 4 px at each side gives the 8 px
 * back, so a time has exactly the room the old card gave it.
 */
export const TIME_TILE_PAD_X = 4;

/** The room (px) one of Today's timing tiles leaves for its words in a Today card `cardWidth` wide: the card less its border and padding, shared by the tiles and the gaps between them, less the padding inside each tile. */
export function todayTimeRoom(cardWidth: number, padX: number = TIME_TILE_PAD_X, tiles = 3): number {
  const inner = cardWidth - 2 * TODAY_CARD_BORDER - 2 * space.cardX;
  return (inner - (tiles - 1) * space.sm) / tiles - 2 * padX;
}

export type TileSize = {
  width: number;
  /** The picture's height; null for tiles whose words set the height. */
  height: number | null;
  /** One tile plus the gap: how far one tile moves the row. */
  interval: number;
  /** Whole tiles in view: how far the ‹ › buttons move the row. */
  whole: number;
};

export type TileSizeOptions = {
  /** How many tiles the row has. A tile that is alone has nothing to peek at and is as wide as the cards (a poster up to TILE_SHAPES.poster.aloneMax) instead of sitting at the left with blank space beside it (default: more than one). */
  count?: number;
  /** The row's padding at each side (railGeometry bleed): the room beyond the cards' own width, which a lone tile does not use. */
  bleed?: number;
};

/**
 * The size of a row's tiles. `available` is the room from the cards' left edge to the right edge of the
 * screen (the row bleeds into the right gutter, railGeometry). As many whole tiles as fit between the shape's
 * narrowest and widest, then a part of the next one peeking in, so it is clear the row goes on. A larger text
 * size counts as larger tiles (up to 1.3×), so the words under them keep their room. A hero is one tile wide
 * plus a sliver of the next, at most `max` wide: Today keeps the height its timings and buttons give it.
 */
export function railTileSize(shape: TileShape, available: number, textScale = 1, gap: number = TILE_GAP, options: TileSizeOptions = {}): TileSize {
  const spec = TILE_SHAPES[shape];
  const room = Number.isFinite(available) && available > 0 ? available : 0;
  if (shape === 'hero') {
    const alone = options.count !== undefined && options.count <= 1;
    const bleed = Number.isFinite(options.bleed) && (options.bleed ?? 0) > 0 ? (options.bleed as number) : 0;
    const width = Math.round(alone ? Math.max(0, room - bleed) : Math.max(spec.min, Math.min(spec.max, room - gap - HERO_PEEK)));
    return { width, height: null, interval: width + gap, whole: 1 };
  }
  const scale = Number.isFinite(textScale) && textScale > 1 ? Math.min(textScale, 1.3) : 1;
  const min = spec.min * scale;
  const max = spec.max * scale;
  if (options.count !== undefined && options.count <= 1) {
    // Alone: no next tile to peek at, so the tile fills the cards' width (the row's own padding is not part of it), as a lone hero does.
    const bleed = Number.isFinite(options.bleed) && (options.bleed ?? 0) > 0 ? (options.bleed as number) : 0;
    const width = Math.round(Math.max(min, Math.min(spec.aloneMax, room - bleed)));
    return { width, height: spec.ratio === null ? null : Math.round(width * spec.ratio), interval: width + gap, whole: 1 };
  }
  const widthFor = (whole: number) => (room - gap * whole) / (whole + spec.peek);
  let whole = 1;
  while (whole < 12 && widthFor(whole) > max) whole += 1;
  // One more tile made them too narrow: one fewer, as wide as the shape allows (the peek grows a little instead).
  if (widthFor(whole) < min && whole > 1) whole -= 1;
  const width = Math.round(Math.max(min, Math.min(max, widthFor(whole))));
  return { width, height: spec.ratio === null ? null : Math.round(width * spec.ratio), interval: width + gap, whole };
}

export type RailGeometryInput = {
  /** Width of the rail's own box once it has been laid out (the cards' width inside the gutters); 0 before that. */
  measured: number;
  windowWidth: number;
  /** The web shows the whole app in a phone-width frame (layout.webAppWidth). */
  web: boolean;
  frameWidth: number;
  maxContentWidth: number;
  gutter: number;
};

export type RailGeometry = {
  /**
   * How far the rail reaches past the cards' edges on each side (a negative
   * margin, and the padding that puts the first tile back on the cards' left
   * edge): the gutter, plus the margin a native screen wider than the content
   * column leaves (a tablet), so the rail runs out to the screen's edges.
   */
  bleed: number;
  /** The room from the cards' left edge to the right edge of the screen, for railTileSize. */
  room: number;
};

/**
 * Where the rail sits on the screen. The tiles start on the cards' left edge
 * and the row runs out to the right edge of the screen, like Netflix: on a
 * phone that is the gutter (20 px), on a tablet the column's margin as well.
 * The web frame is never wider than the content column. Before the rail has
 * been measured, the screen (or the frame) stands in for it.
 */
export function railGeometry(i: RailGeometryInput): RailGeometry {
  const positive = (n: number) => (Number.isFinite(n) && n > 0 ? n : 0);
  const screen = i.web ? Math.min(positive(i.windowWidth), i.frameWidth) : positive(i.windowWidth);
  const content = positive(i.measured) > 0 ? i.measured + 2 * i.gutter : Math.min(screen, i.maxContentWidth);
  const side = i.web ? 0 : Math.max(0, (screen - content) / 2);
  return { bleed: i.gutter + side, room: Math.max(0, content - i.gutter + side) };
}

// ---------------------------------------------------------------------------
// What a row draws
// ---------------------------------------------------------------------------

/**
 * What a row draws (src/features/home-rail.tsx):
 *
 * - `loading`: its tiles are not known yet (skeleton tiles);
 * - `tiles`: it has tiles;
 * - `message`: it has no tile but has something to say (an error, or a notice such as "part of it could not be
 *   loaded"): it keeps its title and says so, with Try again;
 * - `hidden`: nothing to show and nothing wrong, so the row is left out.
 *
 * A row never vanishes because everything in it failed to load: the member would never know it was meant to be there
 * (CLAUDE.md: errors are always shown, never a silent fallback).
 */
export type RailView = 'loading' | 'tiles' | 'message' | 'hidden';

export function railView({ tiles, error, notice }: { tiles: number | undefined; error: boolean; notice: boolean }): RailView {
  if (tiles === undefined) return error ? 'message' : 'loading';
  if (tiles > 0) return 'tiles';
  return error || notice ? 'message' : 'hidden';
}

// ---------------------------------------------------------------------------
// Resting places and paging
// ---------------------------------------------------------------------------

/**
 * How far before its natural place a row rests once it has been moved (px, zero or negative). The first tile
 * rests on the page gutter (the cards' left edge). A later tile rests a little further left, so that the
 * previous tile shows as a sliver of LEFT_SLIVER px at the screen's edge ("there is more this way"): on a phone
 * the gutter (20) is only 8 px more than the gap between tiles, which is too thin to notice. On a tablet the
 * row starts further in than that, and every tile rests on the column's left edge as the first one did.
 */
export function railSnapShift(bleed: number, gap: number = TILE_GAP): number {
  const b = Number.isFinite(bleed) && bleed > 0 ? bleed : 0;
  return Math.min(0, b - gap - LEFT_SLIVER);
}

/** The scroll position where tile `index` rests: 0 for the first, `index × interval` less the shift for the rest. */
export function railRestOffset(index: number, interval: number, shift: number): number {
  if (!(index > 0) || !(interval > 0)) return 0;
  return Math.max(0, Math.round(index * interval + (Number.isFinite(shift) ? Math.min(0, shift) : 0)));
}

/** Every resting place of a row of `count` tiles, for snapToOffsets on a phone. */
export function railSnapOffsets(count: number, interval: number, shift: number): number[] {
  return Array.from({ length: Math.max(0, Math.floor(Number.isFinite(count) ? count : 0)) }, (_, i) => railRestOffset(i, interval, shift));
}

/** A row mounts the pictures of the tiles in view and this many more ahead of them (imageReach). */
export const IMAGE_AHEAD = 2;

/**
 * How many tiles, counted from the start of a row, have their pictures mounted: those in view and IMAGE_AHEAD more. A row
 * with twelve event flyers used to mount all twelve at once (two image views each, all downloading) although two and a bit
 * are on the screen; the others now mount as the row is moved towards them. `count` caps it.
 */
export function imageReach(scrollX: number, viewWidth: number, interval: number, count: number): number {
  if (!(interval > 0) || !(viewWidth > 0)) return 0;
  const x = Number.isFinite(scrollX) ? Math.max(0, scrollX) : 0;
  const lastInView = Math.ceil((x + viewWidth) / interval);
  return Math.max(0, Math.min(Math.floor(Number.isFinite(count) ? count : 0), lastInView + IMAGE_AHEAD));
}

/**
 * Where the ‹ › buttons and the arrow keys take the rail: `step` tiles on
 * from the tile now at the left edge (−1 / +1 per page), kept inside the
 * row. Returns the tile to bring to the left edge. `shift` is railSnapShift:
 * a row at rest is that much before the tile's natural place.
 */
export function pageTarget(scrollX: number, interval: number, step: number, count: number, shift = 0): number {
  if (!(interval > 0) || count < 1) return 0;
  const x = Number.isFinite(scrollX) ? scrollX : 0;
  const at = Math.max(0, Math.round((Math.max(0, x) - Math.min(0, Number.isFinite(shift) ? shift : 0)) / interval));
  return Math.max(0, Math.min(count - 1, at + Math.trunc(step)));
}

/** A key pressed on a tile on the web: the tile to move to, or null for a key the rail does not use. */
export function keyTarget(key: string, index: number, count: number): number | null {
  if (count < 1) return null;
  if (key === 'ArrowRight') return Math.min(count - 1, index + 1);
  if (key === 'ArrowLeft') return Math.max(0, index - 1);
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  return null;
}

/** Which ‹ › buttons the rail needs: ‹ once it has moved off the start, › while there is more to the right. */
export function railEdges(scrollX: number, viewWidth: number, contentWidth: number, slack = 4): { prev: boolean; next: boolean } {
  const x = Number.isFinite(scrollX) ? scrollX : 0;
  return { prev: x > slack, next: viewWidth > 0 && x + viewWidth < contentWidth - slack };
}

/**
 * Whether tile `index` is cut off by an edge of the rail, so it should be
 * brought to its resting place when the keyboard puts the focus on it: the
 * rail has been scrolled past the tile's resting place, or the tile ends
 * beyond the right edge (`bleed` is the padding the row starts with). The
 * browser's own scroll-into-view can lose to the scroll snapping, so Tab can
 * land on a tile that is half out of view and the rail has to bring it in
 * itself. False until the rail has a width (nothing is known to be cut off),
 * and for a hair's difference (`slack` px: sub-pixel scroll positions).
 */
export function tileCutOff(index: number, scrollX: number, viewWidth: number, tile: Pick<TileSize, 'width' | 'interval'>, bleed: number, slack = 2): boolean {
  if (!(viewWidth > 0) || !Number.isFinite(index)) return false;
  const x = Number.isFinite(scrollX) ? scrollX : 0;
  const left = Math.max(0, index) * tile.interval;
  return left < x - slack || bleed + left + tile.width > x + viewWidth + slack;
}

// ---------------------------------------------------------------------------
// Lazy loading
// ---------------------------------------------------------------------------

/**
 * How far ahead of the screen a row starts to load, as a share of the
 * screen's height: a row half a screen below is on its way (it is ready by
 * the time it scrolls in), one further down waits, so Home's own first row
 * is never competing with rows the member may never reach.
 */
export const RAIL_PRELOAD = 0.5;

/**
 * The longest the rows under Plan a special day wait (drawn invisible, their loads already running) for that row to find out
 * whether it has days, so that it does not push them down after the member has started to read (ms). On a slow connection
 * the rows show without it and the row may still come in late.
 */
export const SPECIAL_DAYS_HOLD_MS = 1200;

/**
 * Where a row really is on Home: the top of its box (px down Home's content),
 * or null when its layout is not a position at all. The web hides a screen
 * that another one covers (display: none) and then reports every view on it as
 * 0 × 0 at 0, 0; taken as a position, that would put every row at the top of
 * Home and load them all (revealRails) while the member is on another screen.
 * A row that has no height yet (Plan a special day draws nothing until it knows it has days)
 * still has a position, so only a width of 0 means there is none.
 */
export function railTop(layout: { y: number; width: number; height?: number }): number | null {
  const { y, width } = layout;
  return Number.isFinite(y) && width > 0 ? y : null;
}

/**
 * The rows that may load now: those already loading, plus every row whose
 * top (px down the Home content) is above the bottom of the screen plus
 * `preload` px (RAIL_PRELOAD of a screen). A row not laid out yet waits. The
 * same list comes back (same object) when nothing new is near, so callers can
 * skip a re-render.
 */
export function revealRails<K extends string>(tops: Readonly<Partial<Record<K, number>>>, revealed: readonly K[], viewportBottom: number, preload: number): readonly K[] {
  if (!Number.isFinite(viewportBottom)) return revealed;
  const reach = viewportBottom + (Number.isFinite(preload) && preload > 0 ? preload : 0);
  const near = (Object.keys(tops) as K[]).filter((k) => {
    const top = tops[k];
    return !revealed.includes(k) && typeof top === 'number' && Number.isFinite(top) && top <= reach;
  });
  return near.length ? [...revealed, ...near] : revealed;
}

/**
 * Home rails (owner, 2026-10-02: a Netflix-style Home): rows of large tiles
 * that scroll sideways under the Today, alerts, Up next and Plan a special
 * day cards. This file holds the pure parts, unit-tested in
 * src/lib/__tests__/home-rails.test.ts:
 *
 * - which rails show (homeRails): the community's modules (the same Home
 *   gating as the cards, src/lib/modules.ts HOME_CARD_MODULE), its Home
 *   shortcuts (centers.rules.home.shortcuts, still edited in the portal as
 *   "Home shortcuts": each shortcut now brings its rail), signed in or a
 *   guest, and the adults-only rule for giving;
 * - how big a tile is for the room there is (railTileSize) and where the
 *   rail starts and ends on the screen (railGeometry): large enough to read
 *   on a phone, with the next tile peeking in at the right edge;
 * - where the ‹ › buttons and the arrow keys take the rail (pageTarget,
 *   keyTarget, railEdges), and whether a tile the keyboard reached is cut off
 *   (tileCutOff);
 * - which rails are near enough to the screen to load (revealRails, with
 *   railTop for where a rail is), so a rail loads only when the member
 *   scrolls towards it.
 *
 * The rails themselves are drawn in src/features/home-rails.tsx; their tiles
 * are built from the data in src/features/home-rail-items.ts.
 */
import { configuredShortcuts, type HomeShortcut } from './home-shortcuts';
import { isHomeCardVisible, type HomeCard, type ModuleMap } from './modules';

// ---------------------------------------------------------------------------
// Which rails show
// ---------------------------------------------------------------------------

/** The rails, in the order they show on Home. */
export const HOME_RAILS = ['learning', 'events', 'listen', 'give', 'photos', 'recipes'] as const;
export type HomeRail = (typeof HOME_RAILS)[number];

/** The Home card (modules.ts HOME_CARD_MODULE) that gates each rail through its module: off means the rail is not shown. */
export const RAIL_CARD: Record<HomeRail, HomeCard> = {
  learning: 'railLearning',
  events: 'railEvents',
  listen: 'railListen',
  give: 'giving',
  photos: 'railPhotos',
  recipes: 'railRecipes',
};

/**
 * The Home shortcuts that bring each rail (the old shortcuts grid became the
 * rails): Learn → Continue learning, My playlist or Podcast → Listen, Photos →
 * Photos, Recipe → Recipes. null: not a shortcut, the rail shows whenever its
 * module is on (Upcoming events, Give). The "New here" shortcut has no rail:
 * the welcome guide keeps its own card further down Home.
 */
export const RAIL_SHORTCUTS: Record<HomeRail, readonly HomeShortcut[] | null> = {
  learning: ['learn'],
  events: null,
  listen: ['playlist', 'podcast'],
  give: null,
  photos: ['photos'],
  recipes: ['recipe'],
};

/** Rails that make sense for a guest (signed out, browsing a community): its public upcoming events. Albums are for signed-in members (Events › Photos asks a guest to sign in). */
export const GUEST_RAILS: readonly HomeRail[] = ['events'];

/** Rails for adults only (money: RLS enforces it too). */
export const ADULT_RAILS: readonly HomeRail[] = ['give'];

export type HomeRailsInput = {
  /** `centers.rules` of the community (its Home shortcuts). */
  rules: unknown;
  modules: ModuleMap;
  /** null for a guest. */
  member: { isAdult: boolean } | null;
};

/** The rails to show, in Home order. */
export function homeRails({ rules, modules, member }: HomeRailsInput): HomeRail[] {
  const shortcuts = configuredShortcuts(rules);
  return HOME_RAILS.filter((rail) => {
    if (!isHomeCardVisible(modules, RAIL_CARD[rail])) return false;
    if (!member) return GUEST_RAILS.includes(rail);
    if (ADULT_RAILS.includes(rail) && !member.isAdult) return false;
    const keys = RAIL_SHORTCUTS[rail];
    return keys === null || keys.some((k) => shortcuts.includes(k));
  });
}

// ---------------------------------------------------------------------------
// Tile sizes
// ---------------------------------------------------------------------------

/**
 * Tile shapes. `poster` 2:3 (event flyers), `square` (stavans, podcasts,
 * recipes), `wide` 16:9 (Gyan Path goals, photo albums), `card` (giving: as
 * tall as its words).
 */
export type TileShape = 'poster' | 'square' | 'wide' | 'card';

type ShapeSpec = {
  /** Height ÷ width of the picture; null when the words set the height. */
  ratio: number | null;
  /** Narrowest and widest a tile may be (px, at the standard text size). */
  min: number;
  max: number;
  /** How much of the next tile peeks in at the right edge (a share of one tile). */
  peek: number;
};

export const TILE_SHAPES: Record<TileShape, ShapeSpec> = {
  poster: { ratio: 1.5, min: 112, max: 168, peek: 0.4 },
  square: { ratio: 1, min: 112, max: 160, peek: 0.4 },
  wide: { ratio: 9 / 16, min: 200, max: 280, peek: 0.3 },
  card: { ratio: null, min: 200, max: 260, peek: 0.3 },
};

/** Space between two tiles (px). */
export const TILE_GAP = 12;

export type TileSize = {
  width: number;
  /** The picture's height; null for `card` tiles (as tall as the tallest tile's words). */
  height: number | null;
  /** One tile plus the gap: where a swipe comes to rest (snapToInterval). */
  interval: number;
  /** Whole tiles in view: how far the ‹ › buttons move the rail. */
  whole: number;
};

/**
 * The size of a rail's tiles. `available` is the room from the cards' left
 * edge to the right edge of the screen (the rail bleeds into the right
 * gutter, railGeometry). As many whole tiles as fit between the shape's
 * narrowest and widest, then a part of the next one peeking in, so it is
 * clear the row goes on. A larger text size counts as larger tiles (up to
 * 1.3×), so the words under them keep their room.
 */
export function railTileSize(shape: TileShape, available: number, textScale = 1, gap: number = TILE_GAP): TileSize {
  const spec = TILE_SHAPES[shape];
  const scale = Number.isFinite(textScale) && textScale > 1 ? Math.min(textScale, 1.3) : 1;
  const min = spec.min * scale;
  const max = spec.max * scale;
  const room = Number.isFinite(available) && available > 0 ? available : 0;
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
// Paging
// ---------------------------------------------------------------------------

/**
 * Where the ‹ › buttons and the arrow keys take the rail: `step` tiles on
 * from the tile now at the left edge (−1 / +1 per page), kept inside the
 * row. Returns the tile to bring to the left edge.
 */
export function pageTarget(scrollX: number, interval: number, step: number, count: number): number {
  if (!(interval > 0) || count < 1) return 0;
  const at = Math.round(Math.max(0, Number.isFinite(scrollX) ? scrollX : 0) / interval);
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
 * brought to the left edge when the keyboard puts the focus on it: the rail
 * has been scrolled past the tile's resting place, or the tile ends beyond the
 * right edge (`bleed` is the padding the row starts with). The browser's own
 * scroll-into-view can lose to the scroll snapping, so Tab can land on a tile
 * that is half out of view and the rail has to bring it in itself. False until
 * the rail has a width (nothing is known to be cut off), and for a hair's
 * difference (`slack` px: sub-pixel scroll positions).
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
 * How far ahead of the screen a rail starts to load, as a share of the
 * screen's height: a rail half a screen below is on its way (it is ready by
 * the time it scrolls in), one further down waits, so Home's own cards are
 * never competing with rails the member may never reach.
 */
export const RAIL_PRELOAD = 0.5;

/**
 * Where a rail really is on Home: the top of its box (px down Home's content),
 * or null when its layout is not a position at all. The web hides a screen
 * that another one covers (display: none) and then reports every view on it as
 * 0 × 0 at 0, 0; taken as a position, that would put every rail at the top of
 * Home and load them all (revealRails) while the member is on another screen.
 */
export function railTop(layout: { y: number; width: number; height: number }): number | null {
  const { y, width, height } = layout;
  return Number.isFinite(y) && width > 0 && height > 0 ? y : null;
}

/**
 * The rails that may load now: those already loading, plus every rail whose
 * top (px down the Home content) is above the bottom of the screen plus
 * `preload` px (RAIL_PRELOAD of a screen). A rail not laid out yet waits. The
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

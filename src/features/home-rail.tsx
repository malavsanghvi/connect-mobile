import { Image } from 'expo-image';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Platform, Pressable, ScrollView, StyleSheet, View, useWindowDimensions, type LayoutChangeEvent, type NativeScrollEvent, type NativeSyntheticEvent, type ViewProps, type ViewStyle } from 'react-native';

import { Icon } from '@/components/icon';
import { ErrorState } from '@/components/states';
import { Row, Txt } from '@/components/ui';
import { usePulse, useReduceMotion } from '@/features/gyan/motion';
import { logError, type AppError } from '@/lib/errors';
import { IMAGE_AHEAD, imageReach, keyTarget, pageTarget, RAIL_PRELOAD, railEdges, railGeometry, railRestOffset, railSnapOffsets, railSnapShift, railTileSize, railTop, railView, revealRails, TILE_GAP, tileCutOff, type TileShape, type TileSize } from '@/lib/home-rails';
import { useLoad } from '@/lib/use-load';
import { useSettings, useT } from '@/providers/settings';
import { colors, fonts, layout, radii, shadows, space, touch, type ColorName } from '@/theme';

/*
 * The row of tiles Home is made of (owner, 2026-10-02: Netflix style). Which rows show, the tile sizes and
 * when a row loads are pure rules in src/lib/home-rails.ts; the rows themselves are in home-rails.tsx.
 *
 * - The row starts at the cards' left edge and runs out to the right edge of the screen, with the next
 *   tile peeking in. A swipe comes to rest on a tile (snapToOffsets on phones, CSS scroll snap on the web),
 *   and once the row has moved a sliver of the previous tile shows at the left edge. No scrollbar shows.
 * - Web: ‹ › buttons appear while the mouse is over the row (not a finger on a touch screen) or the keyboard
 *   is in it, and move it a screenful; the arrow keys (and Home / End) move from tile to tile; Tab goes
 *   through the tiles, and brings a tile it reaches that is cut off into view.
 * - Screen readers: the row's title is a heading; its tiles are a labelled list (web) of buttons, each read
 *   with its details (and "3 of 8" on a phone, where there is no list to say it).
 * - Each row loads on its own, only when it comes near the screen (useRailReveal), and shows skeleton tiles
 *   until then. A failure shows inside the row in plain English with Try again, also when it leaves the row without
 *   a tile (the row keeps its title); a row with nothing in it and nothing wrong is left out (railView).
 * - A row mounts the pictures of the tiles in view and two more ahead, and the rest as it is moved (imageReach).
 */

const isWeb = Platform.OS === 'web';

/** A held row is out of reach of assistive technology too (it is not there yet for anyone): aria-hidden on the web, the two native props on a phone (react-native-web does not know them). */
const heldProps = (isWeb ? { 'aria-hidden': true } : { accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' }) as unknown as ViewProps;

/** Web only: props React Native's types do not know (react-native-web forwards them to the element). */
function webProps(props: Record<string, unknown>): ViewProps {
  return (isWeb ? props : {}) as unknown as ViewProps;
}

/** Web scroll snap, the CSS twin of snapToOffsets; overscroll stays in the row (no browser "back" on a trackpad swipe). `left` is where a tile rests from the screen's left edge. */
function webSnap(left: number, right: number): ViewStyle | null {
  return (isWeb ? { scrollSnapType: 'x mandatory', scrollPaddingLeft: left, scrollPaddingRight: right, overscrollBehaviorX: 'contain' } : null) as unknown as ViewStyle | null;
}
const WEB_SNAP_TILE = (isWeb ? { scrollSnapAlign: 'start' } : null) as unknown as ViewStyle | null;

/** Whether the browser shows a focus ring for this focus (the keyboard, not a click). */
function focusVisible(e: unknown): boolean {
  const target = (e as { target?: { matches?: (selector: string) => boolean } } | null)?.target;
  try {
    return target?.matches?.(':focus-visible') ?? true;
  } catch {
    return true;
  }
}

// ---------------------------------------------------------------------------
// Lazy loading
// ---------------------------------------------------------------------------

export type RailReveal<K extends string> = {
  /** Screen onViewport: where Home's content is scrolled to. */
  onViewport: (viewport: { y: number; height: number }) => void;
  /** A row's top within Home's content (its onLayout). */
  place: (row: K, top: number) => void;
  /** Rows that may load. */
  revealed: readonly K[];
};

/**
 * Which rows are near enough to load: a row loads once its top is above the bottom of the screen plus half a
 * screen (RAIL_PRELOAD), and then stays loaded. The list is kept in a ref as well, so a scroll that brings
 * nothing new in changes no state at all.
 */
export function useRailReveal<K extends string>(): RailReveal<K> {
  const tops = useRef<Partial<Record<K, number>>>({});
  const viewport = useRef<{ y: number; height: number } | null>(null);
  const current = useRef<readonly K[]>([]);
  const [revealed, setRevealed] = useState<readonly K[]>([]);
  const check = () => {
    const v = viewport.current;
    if (!v || !(v.height > 0)) return;
    const next = revealRails(tops.current, current.current, v.y + v.height, v.height * RAIL_PRELOAD);
    if (next === current.current) return;
    current.current = next;
    setRevealed(next);
  };
  return {
    onViewport: (v) => {
      viewport.current = v;
      check();
    },
    place: (row, top) => {
      if (tops.current[row] === top) return;
      tops.current = { ...tops.current, [row]: top };
      check();
    },
    revealed,
  };
}

/** What a row gets to know about when it may load. */
export type RailSlot = { shown: boolean; onPlace: (top: number) => void };

/**
 * Whether the rows under a row that is still finding out whether it has anything (`active`) are held back: drawn invisible
 * (Rail `held`), with their loads running as usual, for at most `maxMs`. When the row turns up it pushes them down before
 * anything of them has been seen, instead of the member watching the page jump. False once `active` is over or the time is up.
 */
export function useHold(active: boolean, maxMs: number): boolean {
  const [expired, setExpired] = useState(false);
  useEffect(() => {
    if (!active) return;
    const timer = setTimeout(() => setExpired(true), maxMs);
    return () => clearTimeout(timer);
  }, [active, maxMs]);
  return active && !expired;
}

export type RailState<T> = { data: T | undefined; error: AppError | null; reload: () => void };

/** useLoad for a row: nothing is fetched until the row is shown (`shown`), and it reloads after any write like every Home card. */
export function useRailLoad<T>(shown: boolean, loader: () => Promise<T>, deps: readonly unknown[], action: string): RailState<T> {
  const state = useLoad<T | null>(() => (shown ? loader() : Promise.resolve(null)), [shown, ...deps], action);
  return { data: state.data ?? undefined, error: shown ? state.error : null, reload: () => void state.reload() };
}

// ---------------------------------------------------------------------------
// The row itself
// ---------------------------------------------------------------------------

/** What a tile is told about its place in the row. `near`: it is in view or just ahead of it, so it may mount its pictures (the rest wait until the row is moved towards them). */
export type TileCtx = { index: number; count: number; size: TileSize; near: boolean };

type DomNode = { contains?: (node: unknown) => boolean; querySelector?: (selector: string) => { focus?: (opts?: { preventScroll?: boolean }) => void } | null };

/** What a keyboard can land on inside a tile (web). A tile is usually one button; Today's is a card with several controls and no button of its own. */
const FOCUSABLE = 'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])';

type RailProps<T> = {
  /** The row's visible title (a heading). Left out for the first row, whose tiles carry their own words. */
  title?: string;
  /** What screen readers call the list of tiles. */
  label: string;
  shape: TileShape;
  /** Lines of words under each tile's picture (the skeleton draws as many; a 1 is a single short chip). */
  captionLines: 0 | 1 | 2;
  /** The row is fetching now. Until then (it is waiting to come near the screen) its skeleton stays still. */
  loading: boolean;
  /** Draw nothing while the row loads (a row most families have nothing in, which would only flash in and out); it appears when it has tiles. */
  quiet?: boolean;
  onSeeAll?: () => void;
  items: T[] | undefined;
  error: AppError | null;
  reload: () => void;
  keyOf: (item: T) => string;
  renderTile: (item: T, ctx: TileCtx) => ReactNode;
  /** Banners about part of the row (pictures that did not load, an action that failed). Null when there is nothing to say: the row is then left out if it has no tile. */
  notice?: ReactNode;
  /** The row keeps its place on Home but is drawn invisible, as a skeleton, and cannot be reached (useHold). */
  held?: boolean;
  onPlace: (top: number) => void;
};

export function Rail<T>({ title, label, shape, captionLines, loading, quiet, onSeeAll, items, error, reload, keyOf, renderTile, notice, held, onPlace }: RailProps<T>) {
  const t = useT();
  const { scale } = useSettings();
  const { width: windowWidth } = useWindowDimensions();
  const reduceMotion = useReduceMotion();
  const [measured, setMeasured] = useState(0);
  const [edges, setEdges] = useState({ prev: false, next: false });
  const [hover, setHover] = useState(false);
  const [focusWithin, setFocusWithin] = useState(false);
  // How far along the row the pictures are mounted (imageReach): the tiles in view and two more, then more as the row is moved.
  const [reach, setReach] = useState(0);
  const scroller = useRef<ScrollView>(null);
  const wrapper = useRef<View>(null);
  // Web: each tile's list item, so the arrow keys can move the focus from tile to tile.
  const tiles = useRef<(View | null)[]>([]);
  const metrics = useRef({ x: 0, view: 0, content: 0 });

  // The row runs from the cards' left edge to the right edge of the screen (railGeometry).
  const { bleed, room } = railGeometry({ measured, windowWidth, web: isWeb, frameWidth: layout.webAppWidth, maxContentWidth: layout.maxContentWidth, gutter: space.gutter });
  const count = items?.length ?? 0;
  const size = railTileSize(shape, room, scale, TILE_GAP, { count: items === undefined ? undefined : count, bleed });
  // A row at rest after a swipe shows a sliver of the previous tile: its tiles rest a little before their natural place.
  const shift = railSnapShift(bleed);
  const mounted = Math.min(count, Math.max(reach, size.whole + IMAGE_AHEAD));

  const onRootLayout = (e: LayoutChangeEvent) => {
    const { y, width, height } = e.nativeEvent.layout;
    // The web reports a screen that another one covers as 0 x 0: that is no position, and passing it on would reveal (and load) every row.
    const top = railTop({ y, width, height });
    if (top !== null) onPlace(top);
    const w = Math.round(width);
    if (w > 0 && w !== measured) setMeasured(w);
  };

  const updateEdges = () => {
    const { x, view, content } = metrics.current;
    const next = railEdges(x, view, content);
    setEdges((e) => (e.prev === next.prev && e.next === next.next ? e : next));
  };
  const scrollToTile = (i: number) => scroller.current?.scrollTo({ x: railRestOffset(i, size.interval, shift), animated: reduceMotion === false });
  const page = (step: -1 | 1) => scrollToTile(pageTarget(metrics.current.x, size.interval, step * size.whole, count, shift));
  // A tile cut off at either side comes to its resting place.
  const bringIn = (i: number) => {
    const { x, view } = metrics.current;
    if (tileCutOff(i, x, view, size, bleed)) scrollToTile(i);
  };
  const tileAt = (target: unknown) => tiles.current.findIndex((node) => !!(node as unknown as DomNode | null)?.contains?.(target));
  // The arrow keys move the focus to the first control inside the next tile: a tile whose root is not itself focusable (Today's card) would otherwise leave the focus where it was.
  const focusTile = (i: number) => {
    (tiles.current[i] as unknown as DomNode | null)?.querySelector?.(FOCUSABLE)?.focus?.({ preventScroll: true });
    bringIn(i);
  };
  const onKeyDown = (e: { key: string; target?: unknown; preventDefault: () => void }) => {
    const target = keyTarget(e.key, Math.max(0, tileAt(e.target)), count);
    if (target === null) return;
    e.preventDefault();
    focusTile(target);
  };
  // Tab (not the arrow keys, which move the row themselves) can put the focus on a tile that is only partly in view: the
  // browser's own scroll can lose to the scroll snapping, so bring it in here. For keyboard focus only: a mouse click on a
  // tile that peeks in must not move it from under the pointer.
  const onListFocus = (e: { target?: unknown }) => {
    if (!focusVisible(e)) return;
    const at = tileAt(e.target);
    if (at >= 0) bringIn(at);
  };
  const onWrapperBlur = (e: { relatedTarget?: unknown }) => {
    const root = wrapper.current as unknown as DomNode | null;
    if (!e.relatedTarget || !root?.contains?.(e.relatedTarget)) setFocusWithin(false);
  };
  // The ‹ › buttons are for the mouse and the keyboard, not a finger (a touch screen swipes; the arrows would only flash over the
  // picture under it), and a mouse click on a button (which keeps the focus) is not the keyboard being in the row.
  const wrapperWeb = (isWeb
    ? {
        onPointerEnter: (e: { pointerType?: string }) => {
          if (e.pointerType !== 'touch') setHover(true);
        },
        onPointerLeave: () => setHover(false),
        onFocus: (e: unknown) => setFocusWithin(focusVisible(e)),
        onBlur: onWrapperBlur,
      }
    : null) as unknown as ViewProps | null;
  const listWeb = (isWeb ? { role: 'list', 'aria-label': label, onKeyDown, onFocus: onListFocus } : null) as unknown as ViewProps | null;
  // How far the row has moved: the web needs it for the ‹ › buttons, and every platform for which pictures to mount.
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, layoutMeasurement, contentSize } = e.nativeEvent;
    metrics.current = { x: contentOffset.x, view: layoutMeasurement.width, content: contentSize.width };
    if (isWeb) updateEdges();
    const next = imageReach(contentOffset.x, layoutMeasurement.width, size.interval, count);
    setReach((r) => (next > r ? next : r));
  };
  const scrollWeb = isWeb
    ? {
        onLayout: (e: LayoutChangeEvent) => {
          metrics.current = { ...metrics.current, view: e.nativeEvent.layout.width };
          updateEdges();
        },
        onContentSizeChange: (w: number) => {
          metrics.current = { ...metrics.current, content: w };
          updateEdges();
        },
      }
    : null;

  // A row with no tile still shows when there is something to say about it (an error, a notice): it is only left out when nothing is wrong.
  const known = railView({ tiles: items === undefined ? undefined : count, error: !!error, notice: notice !== undefined && notice !== null && notice !== false });
  if (known === 'hidden') return null;
  // A held row is a skeleton nobody sees yet (it takes the room its tiles will, so the rows under it are placed and load as they would).
  const mode = held ? 'loading' : known;
  // A quiet row draws nothing until it knows it has tiles. Its empty box is there only so Home knows where it is (and when to load it); the
  // negative margin takes back the gap Home leaves between its rows (space.lg), so the rows below do not move when it turns out to be empty.
  if (quiet && mode === 'loading') return <View onLayout={onRootLayout} style={{ height: 0, marginTop: -space.lg }} />;

  // The buttons sit at the middle of the pictures (the words under them do not count); a tile that is all words has the middle of the row.
  const chevronTop = size.height === null ? null : 4 + size.height / 2 - 20;
  const showChevrons = isWeb && (hover || focusWithin) && count > 1;

  return (
    <View onLayout={onRootLayout} style={[{ gap: 2 }, held ? { opacity: 0, pointerEvents: 'none' } : null]} {...(held ? heldProps : null)}>
      {title ? <RailHeader title={title} onSeeAll={onSeeAll} /> : null}
      {error ? <ErrorState error={error} onRetry={reload} /> : null}
      {notice}
      {mode === 'loading' ? (
        <RailSkeleton label={label} size={size} bleed={bleed} captionLines={captionLines} animate={loading} />
      ) : mode !== 'tiles' || !items ? null : (
        <View ref={wrapper} style={{ marginHorizontal: -bleed }} {...wrapperWeb}>
          <ScrollView
            ref={scroller}
            horizontal
            showsHorizontalScrollIndicator={false}
            snapToOffsets={railSnapOffsets(count, size.interval, shift)}
            snapToStart
            snapToEnd
            decelerationRate="fast"
            style={webSnap(bleed - shift, bleed)}
            contentContainerStyle={{ paddingHorizontal: bleed, paddingVertical: 4 }}
            onScroll={onScroll}
            scrollEventThrottle={50}
            {...scrollWeb}>
            <View accessibilityRole={isWeb ? undefined : 'list'} style={{ flexDirection: 'row', alignItems: 'stretch', gap: TILE_GAP }} {...listWeb}>
              {items.map((item, i) => (
                <View
                  key={keyOf(item)}
                  ref={(node) => {
                    tiles.current[i] = node;
                  }}
                  style={[{ width: size.width }, WEB_SNAP_TILE]}
                  {...webProps({ role: 'listitem', 'aria-posinset': i + 1, 'aria-setsize': count })}>
                  {renderTile(item, { index: i, count, size, near: i < mounted })}
                </View>
              ))}
            </View>
          </ScrollView>
          {showChevrons && edges.prev ? <RailChevron side="left" top={chevronTop} label={t('home.rail.back', { rail: label })} onPress={() => page(-1)} /> : null}
          {showChevrons && edges.next ? <RailChevron side="right" top={chevronTop} label={t('home.rail.on', { rail: label })} onPress={() => page(1)} /> : null}
        </View>
      )}
    </View>
  );
}

/** The row's title (a heading) and "See all ›", which goes where the old Home card or shortcut went. */
function RailHeader({ title, onSeeAll }: { title: string; onSeeAll?: () => void }) {
  const t = useT();
  return (
    <Row style={{ justifyContent: 'space-between', minHeight: touch.min }} gap={space.sm}>
      <Txt variant="subhead" accessibilityRole="header" style={{ flex: 1, fontFamily: fonts.bodyBold }}>
        {title}
      </Txt>
      {onSeeAll ? (
        <Pressable
          onPress={onSeeAll}
          accessibilityRole="button"
          accessibilityLabel={t('home.rail.seeAllA11y', { rail: title })}
          style={({ pressed }) => ({ minHeight: touch.min, flexDirection: 'row', alignItems: 'center', gap: 2, paddingLeft: space.sm, opacity: pressed ? 0.6 : 1 })}>
          <Txt variant="smallStrong" color="navy">
            {t('common.seeAll')}
          </Txt>
          <Icon name="chevron-forward" size={16} color={colors.navy} />
        </Pressable>
      ) : null}
    </Row>
  );
}

/** Web: the ‹ › button over one end of the row (`top`: its distance from the top of the row; null centres it on the row). For the mouse; the keyboard has the arrow keys and screen readers the list itself. */
function RailChevron({ side, top, label, onPress }: { side: 'left' | 'right'; top: number | null; label: string; onPress: () => void }) {
  const vertical: ViewStyle = top === null ? { top: '50%', marginTop: -20 } : { top };
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={label}
      // Hidden from assistive technology, so also out of the Tab order (an element cannot be both focusable and hidden).
      {...webProps({ 'aria-hidden': true, tabIndex: -1 })}
      style={({ pressed }) => [
        { position: 'absolute', width: 40, height: 40, borderRadius: 20, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.borderInput, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 0.96 },
        vertical,
        side === 'left' ? { left: 6 } : { right: 6 },
        shadows.strip,
      ]}>
      <Icon name={side === 'left' ? 'chevron-back' : 'chevron-forward'} size={22} color={colors.navy} />
    </Pressable>
  );
}

/** Grey tiles in the row's own sizes while it loads. They pulse gently once the row is loading, and stay still before that and with Reduce Motion. */
function RailSkeleton({ label, size, bleed, captionLines, animate }: { label: string; size: TileSize; bleed: number; captionLines: 0 | 1 | 2; animate: boolean }) {
  const t = useT();
  const { scale } = useSettings();
  const reduceMotion = useReduceMotion();
  const pulse = usePulse(animate, reduceMotion);
  const opacity = pulse.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 0.55, 1] });
  const height = size.height ?? Math.round(150 * Math.min(scale, 1.3));
  return (
    <Animated.View
      accessible
      accessibilityLabel={t('home.rail.loading', { rail: label })}
      {...webProps({ 'aria-busy': true })}
      style={{ opacity, marginHorizontal: -bleed, paddingHorizontal: bleed, paddingVertical: 4, flexDirection: 'row', gap: TILE_GAP, overflow: 'hidden' }}>
      {[0, 1, 2, 3].map((i) => (
        <View key={i} style={{ width: size.width, gap: space.sm }}>
          <View style={{ height, borderRadius: radii.xl, backgroundColor: colors.panel }} />
          {captionLines === 2 ? (
            <View style={{ gap: 6, paddingHorizontal: 2 }}>
              <View style={{ height: 12, width: '80%', borderRadius: 6, backgroundColor: colors.panel }} />
              <View style={{ height: 10, width: '50%', borderRadius: 5, backgroundColor: colors.panel }} />
            </View>
          ) : captionLines === 1 ? (
            <View style={{ height: 28, borderRadius: radii.pill, backgroundColor: colors.panel }} />
          ) : null}
        </View>
      ))}
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------
// Pieces the rows' tiles are made of
// ---------------------------------------------------------------------------

/** One tile: a button with its details for screen readers, a focus ring for the keyboard on the web. */
export function RailTile({ ctx, label, hint, onPress, children, gap = space.sm, radius = radii.xl }: { ctx: TileCtx; label: string; hint?: string; onPress: () => void; children: ReactNode; gap?: number; radius?: number }) {
  const t = useT();
  const [ring, setRing] = useState(false);
  // A phone's screen reader has no list to say where the tile is, so the label does.
  const a11yLabel = isWeb ? label : `${label}. ${t('home.rail.position', { n: ctx.index + 1, total: ctx.count })}`;
  return (
    <Pressable
      onPress={onPress}
      onFocus={(e) => {
        if (isWeb) setRing(focusVisible(e));
      }}
      onBlur={() => setRing(false)}
      accessibilityRole="button"
      accessibilityLabel={a11yLabel}
      accessibilityHint={hint}
      style={({ pressed }) => [
        { flexGrow: 1, gap, borderRadius: radius, opacity: pressed ? 0.85 : 1 },
        isWeb ? { outlineWidth: ring ? 3 : 0, outlineStyle: 'solid', outlineColor: colors.navy, outlineOffset: 2 } : null,
      ]}>
      {children}
    </Pressable>
  );
}

/** Words under a tile: the title (two lines at most) and one line of details. */
export function TileCaption({ title, sub, subColor = 'muted' }: { title: string; sub?: string | null; subColor?: ColorName }) {
  return (
    <View style={{ gap: 2, paddingHorizontal: 2 }}>
      <Txt variant="smallStrong" numberOfLines={2}>
        {title}
      </Txt>
      {sub ? (
        <Txt variant="caption" color={subColor} numberOfLines={1} style={{ fontFamily: fonts.body }}>
          {sub}
        </Txt>
      ) : null}
    </View>
  );
}

/** A small label on a tile's picture ("For you", "On now"). */
export function TileBadge({ label, bg, fg }: { label: string; bg: string; fg: ColorName }) {
  return (
    <View style={{ alignSelf: 'flex-start', backgroundColor: bg, borderRadius: radii.sm, paddingHorizontal: 8, paddingVertical: 3 }}>
      <Txt variant="badge" color={fg}>
        {label}
      </Txt>
    </View>
  );
}

/** Two soft circles that give a designed tile some depth. */
export function Decor() {
  return (
    <View style={[StyleSheet.absoluteFill, { pointerEvents: 'none' }]} aria-hidden>
      <View style={{ position: 'absolute', right: -36, top: -36, width: 128, height: 128, borderRadius: 64, backgroundColor: colors.white, opacity: 0.1 }} />
      <View style={{ position: 'absolute', left: -24, bottom: -48, width: 96, height: 96, borderRadius: 48, backgroundColor: colors.white, opacity: 0.06 }} />
    </View>
  );
}

/** A picture that falls back to the designed tile when it does not load (logged, never a broken image). */
export function TilePicture({ uri, cacheKey, what, fallback, fit = 'cover' }: { uri: string | null; cacheKey?: string; what: string; fallback: ReactNode; fit?: 'cover' | 'contain' }) {
  const [broken, setBroken] = useState<string | null>(null);
  if (!uri || broken === uri) return <>{fallback}</>;
  return (
    <Image
      source={cacheKey ? { uri, cacheKey } : { uri }}
      style={StyleSheet.absoluteFill}
      contentFit={fit}
      transition={150}
      accessibilityIgnoresInvertColors
      onError={(e) => {
        logError(`showing ${what} on Home (showing the designed tile instead)`, e.error);
        setBroken(uri);
      }}
    />
  );
}

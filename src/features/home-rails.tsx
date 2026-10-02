import { Image } from 'expo-image';
import { useIsFocused, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useRef, useState, type ReactNode } from 'react';
import { Animated, Platform, Pressable, ScrollView, StyleSheet, View, useWindowDimensions, type LayoutChangeEvent, type NativeScrollEvent, type NativeSyntheticEvent, type ViewProps, type ViewStyle } from 'react-native';

import { Icon, type IconName } from '@/components/icon';
import { ErrorState } from '@/components/states';
import { Banner, Row, Txt } from '@/components/ui';
import { usePulse, useReduceMotion } from '@/features/gyan/motion';
import { KIND_ICON, kindName, mediaSubtitle, openItem, toQueueItem, useWatch } from '@/features/three-l/media-ui';
import { listHouseholdRsvps, listUpcomingEvents, type Rsvp } from '@/lib/api/events';
import { BUCKETS, signedUrls } from '@/lib/api/files';
import { listOpportunities } from '@/lib/api/giving';
import { goalProgress, lastActivityByGoal, loadGyan } from '@/lib/api/gyan';
import { listMedia, loadMyPlaylist, mediaPictures } from '@/lib/api/media';
import { logError, report, type AppError } from '@/lib/errors';
import { formatCents, formatCentsCompact, formatDateTime, monthShortUpper, parseISODate, zonedParts } from '@/lib/format';
import { homeRails, keyTarget, pageTarget, RAIL_PRELOAD, railEdges, railGeometry, railTileSize, revealRails, TILE_GAP, type HomeRail, type TileShape, type TileSize } from '@/lib/home-rails';
import { goalMark } from '@/lib/learning';
import { playbackOf, type MediaItem } from '@/lib/media-library';
import { sizedPhotoUrl } from '@/lib/photo-size';
import { useLoad } from '@/lib/use-load';
import { useApp } from '@/providers/app';
import { FreezeDataVersion } from '@/providers/data-version';
import { useModules } from '@/providers/modules';
import { usePlayer } from '@/providers/player';
import { useSettings, useT } from '@/providers/settings';
import { colors, fonts, layout, radii, shadows, space, touch, type ColorName } from '@/theme';

import { EventIcon } from './event-icons';
import { shortWhen } from './event-rules';
import { bandFor } from './events';
import {
  eventMark,
  eventTiles,
  giveTiles,
  learningTiles,
  listenTiles,
  opensTickets,
  PHOTO_TILES,
  photoTiles,
  recipeTiles,
  type EventMark,
  type EventTile,
  type GiveTile,
  type LearningTile,
  type ListenTile,
  type PhotoTile,
} from './home-rail-items';
import { loadAlbumPreviewsWithCovers, paletteFor } from './photos';

/*
 * Home rails (owner, 2026-10-02: a Netflix-style Home). Under Today, the
 * alerts, Up next and Plan a special day: rows of large tiles that scroll
 * sideways — Continue learning, Upcoming events, Listen, Give, Photos and
 * Fully Jain recipes. Which rails show, the tile sizes and when a rail loads
 * are pure rules in src/lib/home-rails.ts; the tiles are built from the data
 * in home-rail-items.ts.
 *
 * - The rail starts at the cards' left edge and runs out to the right edge
 *   of the screen, with the next tile peeking in; a swipe comes to rest on a
 *   tile (snapToInterval on phones, CSS scroll snap on the web). No
 *   scrollbar shows on the web.
 * - Web: ‹ › buttons appear while the mouse is over the rail or the keyboard
 *   is in it and move it a screenful; the arrow keys (and Home / End) move
 *   from tile to tile; Tab goes through the tiles.
 * - Screen readers: the rail's title is a heading; its tiles are a labelled
 *   list (web) of buttons, each read with its details (and "3 of 8" on a
 *   phone, where there is no list to say it).
 * - Each rail loads on its own, only when it comes near the screen
 *   (useRailReveal), and shows skeleton tiles until then. A failure shows
 *   inside the rail in plain English with Try again; a rail with nothing in
 *   it is left out.
 */

const isWeb = Platform.OS === 'web';

/** Web only: props React Native's types do not know (react-native-web forwards them to the element). */
function webProps(props: Record<string, unknown>): ViewProps {
  return (isWeb ? props : {}) as unknown as ViewProps;
}

/** Web scroll snap, the CSS twin of snapToInterval; overscroll stays in the rail (no browser "back" on a trackpad swipe). */
const WEB_SNAP = (isWeb ? { scrollSnapType: 'x mandatory', scrollPaddingLeft: space.gutter, scrollPaddingRight: space.gutter, overscrollBehaviorX: 'contain' } : null) as unknown as ViewStyle | null;
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

export type RailReveal = {
  /** Screen onViewport: where Home's content is scrolled to. */
  onViewport: (viewport: { y: number; height: number }) => void;
  /** A rail's top within Home's content (its onLayout). */
  place: (rail: HomeRail, top: number) => void;
  /** Rails that may load. */
  revealed: readonly HomeRail[];
};

/**
 * Which rails are near enough to load: a rail loads once its top is above
 * the bottom of the screen plus half a screen (RAIL_PRELOAD), and then stays
 * loaded. The list is kept in a ref as well, so a scroll that brings nothing
 * new in changes no state at all.
 */
export function useRailReveal(): RailReveal {
  const tops = useRef<Partial<Record<HomeRail, number>>>({});
  const viewport = useRef<{ y: number; height: number } | null>(null);
  const current = useRef<readonly HomeRail[]>([]);
  const [revealed, setRevealed] = useState<readonly HomeRail[]>([]);
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
    place: (rail, top) => {
      if (tops.current[rail] === top) return;
      tops.current = { ...tops.current, [rail]: top };
      check();
    },
    revealed,
  };
}

type RailSlot = { shown: boolean; onPlace: (top: number) => void };

type RailState<T> = { data: T | undefined; error: AppError | null; reload: () => void };

/** useLoad for a rail: nothing is fetched until the rail is shown (`shown`), and it reloads after any write like every Home card. */
function useRailLoad<T>(shown: boolean, loader: () => Promise<T>, deps: readonly unknown[], action: string): RailState<T> {
  const state = useLoad<T | null>(() => (shown ? loader() : Promise.resolve(null)), [shown, ...deps], action);
  return { data: state.data ?? undefined, error: shown ? state.error : null, reload: () => void state.reload() };
}

// ---------------------------------------------------------------------------
// The rails Home shows
// ---------------------------------------------------------------------------

/**
 * Every rail this member (or guest) gets, in Home order; each one a direct
 * child of Home's content so its top is known. Like every Home card, a rail
 * reloads after a write elsewhere in the app, but only once Home is in front
 * again (FreezeDataVersion): a like or a playlist change on another screen
 * does not reload every rail behind it.
 */
export function HomeRails({ reveal }: { reveal: RailReveal }) {
  const { center, member } = useApp();
  const { map } = useModules();
  const focused = useIsFocused();
  if (!center) return null;
  const rails = homeRails({ rules: center.rules, modules: map, member: member ? { isAdult: member.isAdult } : null });
  return (
    <FreezeDataVersion frozen={!focused}>
      {rails.map((rail) => {
        const slot: RailSlot = { shown: reveal.revealed.includes(rail), onPlace: (top) => reveal.place(rail, top) };
        if (rail === 'learning') return <LearningRail key={rail} {...slot} />;
        if (rail === 'events') return <EventsRail key={rail} {...slot} />;
        if (rail === 'listen') return <ListenRail key={rail} {...slot} />;
        if (rail === 'give') return <GiveRail key={rail} {...slot} />;
        if (rail === 'photos') return <PhotosRail key={rail} {...slot} />;
        return <RecipesRail key={rail} {...slot} />;
      })}
    </FreezeDataVersion>
  );
}

// ---------------------------------------------------------------------------
// The rail itself
// ---------------------------------------------------------------------------

type TileCtx = { index: number; count: number; size: TileSize };

type DomNode = { contains?: (node: unknown) => boolean; firstElementChild?: { focus?: (opts?: { preventScroll?: boolean }) => void } | null };

type RailProps<T> = {
  title: string;
  shape: TileShape;
  /** Lines of words under each tile (the skeleton draws as many). */
  captionLines: 0 | 2;
  /** The rail is fetching now. Until then (it is waiting to come near the screen) its skeleton stays still. */
  loading: boolean;
  onSeeAll?: () => void;
  items: T[] | undefined;
  error: AppError | null;
  reload: () => void;
  keyOf: (item: T) => string;
  renderTile: (item: T, ctx: TileCtx) => ReactNode;
  /** Banners about part of the rail (pictures that did not load, an action that failed). */
  notice?: ReactNode;
  onPlace: (top: number) => void;
};

function Rail<T>({ title, shape, captionLines, loading, onSeeAll, items, error, reload, keyOf, renderTile, notice, onPlace }: RailProps<T>) {
  const t = useT();
  const { scale } = useSettings();
  const { width: windowWidth } = useWindowDimensions();
  const reduceMotion = useReduceMotion();
  const [measured, setMeasured] = useState(0);
  const [edges, setEdges] = useState({ prev: false, next: false });
  const [hover, setHover] = useState(false);
  const [focusWithin, setFocusWithin] = useState(false);
  const scroller = useRef<ScrollView>(null);
  const wrapper = useRef<View>(null);
  // Web: each tile's list item, so the arrow keys can move the focus from tile to tile.
  const tiles = useRef<(View | null)[]>([]);
  const metrics = useRef({ x: 0, view: 0, content: 0 });

  // The rail runs from the cards' left edge to the right edge of the screen (railGeometry).
  const { bleed, room } = railGeometry({ measured, windowWidth, web: isWeb, frameWidth: layout.webAppWidth, maxContentWidth: layout.maxContentWidth, gutter: space.gutter });
  const size = railTileSize(shape, room, scale);
  const count = items?.length ?? 0;

  const onRootLayout = (e: LayoutChangeEvent) => {
    onPlace(e.nativeEvent.layout.y);
    const w = Math.round(e.nativeEvent.layout.width);
    if (w > 0 && w !== measured) setMeasured(w);
  };

  const updateEdges = () => {
    const { x, view, content } = metrics.current;
    const next = railEdges(x, view, content);
    setEdges((e) => (e.prev === next.prev && e.next === next.next ? e : next));
  };
  const scrollToTile = (i: number) => scroller.current?.scrollTo({ x: Math.max(0, i) * size.interval, animated: reduceMotion === false });
  const page = (step: -1 | 1) => scrollToTile(pageTarget(metrics.current.x, size.interval, step * size.whole, count));
  const focusTile = (i: number) => {
    (tiles.current[i] as unknown as DomNode | null)?.firstElementChild?.focus?.({ preventScroll: true });
    // A tile cut off at either side comes to the left edge.
    const { x, view } = metrics.current;
    const left = i * size.interval;
    if (left < x || bleed + left + size.width > x + view) scrollToTile(i);
  };
  const onKeyDown = (e: { key: string; target?: unknown; preventDefault: () => void }) => {
    const at = tiles.current.findIndex((node) => !!(node as unknown as DomNode | null)?.contains?.(e.target));
    const target = keyTarget(e.key, Math.max(0, at), count);
    if (target === null) return;
    e.preventDefault();
    focusTile(target);
  };
  const onWrapperBlur = (e: { relatedTarget?: unknown }) => {
    const root = wrapper.current as unknown as DomNode | null;
    if (!e.relatedTarget || !root?.contains?.(e.relatedTarget)) setFocusWithin(false);
  };
  const wrapperWeb = (isWeb ? { onPointerEnter: () => setHover(true), onPointerLeave: () => setHover(false), onFocus: () => setFocusWithin(true), onBlur: onWrapperBlur } : null) as unknown as ViewProps | null;
  const listWeb = (isWeb ? { role: 'list', 'aria-label': title, onKeyDown } : null) as unknown as ViewProps | null;
  // Only the web needs to know how far the rail has moved (for the ‹ › buttons).
  const scrollWeb = isWeb
    ? {
        scrollEventThrottle: 50,
        onScroll: (e: NativeSyntheticEvent<NativeScrollEvent>) => {
          metrics.current = { x: e.nativeEvent.contentOffset.x, view: e.nativeEvent.layoutMeasurement.width, content: e.nativeEvent.contentSize.width };
          updateEdges();
        },
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

  if (items !== undefined && items.length === 0 && !error) return null;

  const chevronTop = 4 + (size.height ?? 120) / 2 - 20;
  const showChevrons = isWeb && (hover || focusWithin) && count > 1;

  return (
    <View onLayout={onRootLayout} style={{ gap: 2 }}>
      <RailHeader title={title} onSeeAll={onSeeAll} />
      {error ? <ErrorState error={error} onRetry={reload} /> : null}
      {notice}
      {items === undefined ? (
        error ? null : (
          <RailSkeleton title={title} size={size} bleed={bleed} captionLines={captionLines} animate={loading} />
        )
      ) : count === 0 ? null : (
        <View ref={wrapper} style={{ marginHorizontal: -bleed }} {...wrapperWeb}>
          <ScrollView
            ref={scroller}
            horizontal
            showsHorizontalScrollIndicator={false}
            snapToInterval={size.interval}
            snapToAlignment="start"
            decelerationRate="fast"
            style={WEB_SNAP}
            contentContainerStyle={{ paddingHorizontal: bleed, paddingVertical: 4 }}
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
                  {renderTile(item, { index: i, count, size })}
                </View>
              ))}
            </View>
          </ScrollView>
          {showChevrons && edges.prev ? <RailChevron side="left" top={chevronTop} label={t('home.rail.back', { rail: title })} onPress={() => page(-1)} /> : null}
          {showChevrons && edges.next ? <RailChevron side="right" top={chevronTop} label={t('home.rail.on', { rail: title })} onPress={() => page(1)} /> : null}
        </View>
      )}
    </View>
  );
}

/** The rail's title (a heading) and "See all ›", which goes where the old Home shortcut went. */
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

/** Web: the ‹ › button over one end of the rail. For the mouse; the keyboard has the arrow keys and screen readers the list itself. */
function RailChevron({ side, top, label, onPress }: { side: 'left' | 'right'; top: number; label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={label}
      // Hidden from assistive technology, so also out of the Tab order (an element cannot be both focusable and hidden).
      {...webProps({ 'aria-hidden': true, tabIndex: -1 })}
      style={({ pressed }) => [
        { position: 'absolute', top, width: 40, height: 40, borderRadius: 20, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.borderInput, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 0.96 },
        side === 'left' ? { left: 6 } : { right: 6 },
        shadows.strip,
      ]}>
      <Icon name={side === 'left' ? 'chevron-back' : 'chevron-forward'} size={22} color={colors.navy} />
    </Pressable>
  );
}

/** Grey tiles in the rail's own sizes while it loads. They pulse gently once the rail is loading, and stay still before that and with Reduce Motion. */
function RailSkeleton({ title, size, bleed, captionLines, animate }: { title: string; size: TileSize; bleed: number; captionLines: 0 | 2; animate: boolean }) {
  const t = useT();
  const { scale } = useSettings();
  const reduceMotion = useReduceMotion();
  const pulse = usePulse(animate, reduceMotion);
  const opacity = pulse.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 0.55, 1] });
  const height = size.height ?? Math.round(150 * Math.min(scale, 1.3));
  return (
    <Animated.View
      accessible
      accessibilityLabel={t('home.rail.loading', { rail: title })}
      {...webProps({ 'aria-busy': true })}
      style={{ opacity, marginHorizontal: -bleed, paddingHorizontal: bleed, paddingVertical: 4, flexDirection: 'row', gap: TILE_GAP, overflow: 'hidden' }}>
      {[0, 1, 2, 3].map((i) => (
        <View key={i} style={{ width: size.width, gap: space.sm }}>
          <View style={{ height, borderRadius: radii.xl, backgroundColor: colors.panel }} />
          {captionLines > 0 ? (
            <View style={{ gap: 6, paddingHorizontal: 2 }}>
              <View style={{ height: 12, width: '80%', borderRadius: 6, backgroundColor: colors.panel }} />
              <View style={{ height: 10, width: '50%', borderRadius: 5, backgroundColor: colors.panel }} />
            </View>
          ) : null}
        </View>
      ))}
    </Animated.View>
  );
}

/** One tile: a button with its details for screen readers, a focus ring for the keyboard on the web. */
function RailTile({ ctx, label, hint, onPress, children }: { ctx: TileCtx; label: string; hint?: string; onPress: () => void; children: ReactNode }) {
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
        { flexGrow: 1, gap: space.sm, borderRadius: radii.xl, opacity: pressed ? 0.85 : 1 },
        isWeb ? { outlineWidth: ring ? 3 : 0, outlineStyle: 'solid', outlineColor: colors.navy, outlineOffset: 2 } : null,
      ]}>
      {children}
    </Pressable>
  );
}

/** Words under a tile: the title (two lines at most) and one line of details. */
function TileCaption({ title, sub, subColor = 'muted' }: { title: string; sub?: string | null; subColor?: ColorName }) {
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

/** A small label on a tile's picture ("For you", "On now", "You're going"). */
function TileBadge({ label, bg, fg }: { label: string; bg: string; fg: ColorName }) {
  return (
    <View style={{ alignSelf: 'flex-start', backgroundColor: bg, borderRadius: radii.sm, paddingHorizontal: 8, paddingVertical: 3 }}>
      <Txt variant="badge" color={fg}>
        {label}
      </Txt>
    </View>
  );
}

/** Two soft circles that give a designed tile some depth. */
function Decor() {
  return (
    <View style={[StyleSheet.absoluteFill, { pointerEvents: 'none' }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={{ position: 'absolute', right: -36, top: -36, width: 128, height: 128, borderRadius: 64, backgroundColor: colors.white, opacity: 0.1 }} />
      <View style={{ position: 'absolute', left: -24, bottom: -48, width: 96, height: 96, borderRadius: 48, backgroundColor: colors.white, opacity: 0.06 }} />
    </View>
  );
}

/** A picture that falls back to the designed tile when it does not load (logged, never a broken image). */
function TilePicture({ uri, cacheKey, what, fallback }: { uri: string | null; cacheKey?: string; what: string; fallback: ReactNode }) {
  const [broken, setBroken] = useState<string | null>(null);
  if (!uri || broken === uri) return <>{fallback}</>;
  return (
    <Image
      source={cacheKey ? { uri, cacheKey } : { uri }}
      style={StyleSheet.absoluteFill}
      contentFit="cover"
      transition={150}
      accessibilityIgnoresInvertColors
      onError={(e) => {
        logError(`showing ${what} on Home (showing the designed tile instead)`, e.error);
        setBroken(uri);
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// Continue learning
// ---------------------------------------------------------------------------

function LearningRail({ shown, onPlace }: RailSlot) {
  const t = useT();
  const router = useRouter();
  const { center, member } = useApp();
  const state = useRailLoad(
    shown,
    async (): Promise<LearningTile[]> => {
      if (!center || !member) return [];
      const me = member.person.id;
      const g = await loadGyan(center, [me]);
      const last = lastActivityByGoal(g, me);
      return learningTiles(
        g.goals.map((goal) => {
          const p = goalProgress(goal, g.progress, me);
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
        }),
      );
    },
    [center?.id, member?.person.id],
    'load your Gyan Path',
  );
  return (
    <Rail
      title={t('home.rail.learning')}
      shape="wide"
      captionLines={2}
      loading={shown}
      onSeeAll={() => router.push('/gyan')}
      items={state.data}
      error={state.error}
      reload={state.reload}
      keyOf={(x) => x.key}
      onPlace={onPlace}
      renderTile={(tile, ctx) => <LearningTileView tile={tile} ctx={ctx} />}
    />
  );
}

function LearningTileView({ tile, ctx }: { tile: LearningTile; ctx: TileCtx }) {
  const t = useT();
  const router = useRouter();
  const tint = tile.tint ?? colors.navy;
  const level = t('learn.levelOf', { level: tile.levelNumber, n: tile.levelsTotal });
  const pct = Math.round(tile.progress * 100);
  const label = [tile.goalName, tile.recommended ? t('learn.forYou') : null, `${level}: ${tile.levelName}`, t('home.rail.percentDone', { n: pct })].filter(Boolean).join('. ');
  return (
    <RailTile ctx={ctx} label={label} hint={t('home.rail.startHint')} onPress={() => router.push({ pathname: '/gyan/[goalId]/level/[levelId]', params: { goalId: tile.goalId, levelId: tile.levelId } })}>
      <View style={{ height: ctx.size.height ?? undefined, borderRadius: radii.xl, backgroundColor: tint, overflow: 'hidden', padding: space.md, justifyContent: 'space-between' }}>
        <Decor />
        {tile.recommended ? <TileBadge label={t('learn.forYou')} bg={colors.white} fg="navy" /> : <View />}
        <Txt variant="hero" color="white" numberOfLines={1}>
          {tile.mark}
        </Txt>
        {/* Steps done of the whole goal: the bar along the bottom, like a show half watched. */}
        <View style={{ height: 5, borderRadius: 3, backgroundColor: colors.scrimFaint, overflow: 'hidden' }}>
          <View style={{ width: `${pct}%`, height: 5, borderRadius: 3, backgroundColor: colors.white }} />
        </View>
      </View>
      <TileCaption title={tile.goalName} sub={`${level} · ${tile.levelName}`} />
    </RailTile>
  );
}

// ---------------------------------------------------------------------------
// Upcoming events
// ---------------------------------------------------------------------------

type EventsData = {
  tiles: EventTile[];
  /** The family's RSVP status per event (not for a guest): "You're going", and the tile opens the tickets. */
  rsvps: Record<string, string>;
  /** Why the RSVPs could not be read (the tiles open the event meanwhile). */
  rsvpError: string | null;
  /** Signed flyer links by event. */
  flyers: Record<string, string>;
  /** Why the flyers could not be signed (the tiles show the designed poster meanwhile). */
  flyerError: string | null;
};

/** The events' flyers, signed in one request. A failure is returned, not thrown: the events show with their designed posters and the rail says so. */
async function signFlyers(tiles: readonly EventTile[]): Promise<{ urls: Record<string, string>; error: string | null }> {
  const paths = tiles.map((x) => x.flyerPath).filter((p): p is string => !!p);
  if (paths.length === 0) return { urls: {}, error: null };
  try {
    const signed = await signedUrls(paths, BUCKETS.content, 'load the event flyers');
    const urls: Record<string, string> = {};
    for (const x of tiles) {
      const url = x.flyerPath ? signed.get(x.flyerPath) : undefined;
      if (url) urls[x.eventId] = url;
    }
    return { urls, error: null };
  } catch (err) {
    return { urls: {}, error: report(err, 'load the event flyers').userMessage };
  }
}

/** The family's RSVPs to these events, by event; a failure is returned, not thrown. */
async function readRsvps(householdId: string | null, tiles: readonly EventTile[]): Promise<{ status: Record<string, string>; error: string | null }> {
  if (!householdId || tiles.length === 0) return { status: {}, error: null };
  try {
    const rsvps: Map<string, Rsvp> = await listHouseholdRsvps(
      householdId,
      tiles.map((x) => x.eventId),
    );
    const status: Record<string, string> = {};
    rsvps.forEach((r, eventId) => {
      status[eventId] = r.status;
    });
    return { status, error: null };
  } catch (err) {
    return { status: {}, error: report(err, 'load your RSVPs').userMessage };
  }
}

function EventsRail({ shown, onPlace }: RailSlot) {
  const t = useT();
  const router = useRouter();
  const { center, member } = useApp();
  const tz = center?.time_zone ?? null;
  const householdId = member?.household?.id ?? null;
  const state = useRailLoad(
    shown,
    async (): Promise<EventsData> => {
      if (!center) return { tiles: [], rsvps: {}, rsvpError: null, flyers: {}, flyerError: null };
      const tiles = eventTiles(await listUpcomingEvents(center.id), new Date());
      // The RSVPs and the flyers only need the events: ask for both at once.
      const [rsvps, flyers] = await Promise.all([readRsvps(householdId, tiles), signFlyers(tiles)]);
      return { tiles, rsvps: rsvps.status, rsvpError: rsvps.error, flyers: flyers.urls, flyerError: flyers.error };
    },
    [center?.id, householdId],
    'load upcoming events',
  );
  const d = state.data;
  const notice = (
    <>
      {d?.flyerError ? <Banner tone="error" title={t('home.rail.flyersFailed')} message={d.flyerError} action={{ label: t('common.retry'), onPress: state.reload }} /> : null}
      {d?.rsvpError ? <Banner tone="error" title={t('home.rail.rsvpsFailed')} message={d.rsvpError} action={{ label: t('common.retry'), onPress: state.reload }} /> : null}
    </>
  );
  return (
    <Rail
      title={t('home.rail.events')}
      shape="poster"
      captionLines={0}
      loading={shown}
      onSeeAll={() => router.push('/events')}
      items={d?.tiles}
      error={state.error}
      reload={state.reload}
      keyOf={(x) => x.key}
      onPlace={onPlace}
      notice={notice}
      renderTile={(tile, ctx) => <EventTileView tile={tile} ctx={ctx} tz={tz} rsvp={d?.rsvps[tile.eventId] ?? null} flyerUrl={d?.flyers[tile.eventId] ?? null} />}
    />
  );
}

function EventTileView({ tile, ctx, tz, rsvp, flyerUrl }: { tile: EventTile; ctx: TileCtx; tz: string | null; rsvp: string | null; flyerUrl: string | null }) {
  const t = useT();
  const router = useRouter();
  const mark: EventMark = eventMark(rsvp);
  const markText = mark === 'going' ? t('home.rail.going') : mark === 'waitlisted' ? t('home.rail.waitlisted') : null;
  const when = tile.live ? t('home.rail.liveNow') : formatDateTime(tile.startsAt, tz);
  const label = [tile.name, when, tile.venue, markText].filter(Boolean).join('. ');
  // The family's tickets once it has an RSVP (as the Events tab does), else the event, to RSVP.
  const open = () => router.push(opensTickets(rsvp) ? { pathname: '/event/[id]/tickets', params: { id: tile.eventId } } : { pathname: '/event/[id]', params: { id: tile.eventId } });
  const designed = <DesignedPoster tile={tile} tz={tz} />;
  return (
    <RailTile ctx={ctx} label={label} hint={t('home.rail.openHint')} onPress={open}>
      <View style={{ height: ctx.size.height ?? undefined, borderRadius: radii.xl, overflow: 'hidden', backgroundColor: bandFor(tile.eventId) }}>
        {flyerUrl ? <FlyerPoster url={flyerUrl} cacheKey={tile.flyerPath ?? undefined} fallback={designed} /> : designed}
        {tile.live || markText ? (
          <View style={{ position: 'absolute', top: 8, left: 8, gap: 4, pointerEvents: 'none' }}>
            {tile.live ? <TileBadge label={t('home.rail.liveNow')} bg={colors.live} fg="white" /> : null}
            {markText ? <TileBadge label={markText} bg={mark === 'going' ? colors.green : colors.brown} fg="white" /> : null}
          </View>
        ) : null}
      </View>
    </RailTile>
  );
}

/**
 * The event's flyer, whole (a flyer is made to be read): drawn over a
 * blurred, darkened copy of itself, so a flyer of another shape than 2:3
 * still fills the poster.
 */
function FlyerPoster({ url, cacheKey, fallback }: { url: string; cacheKey?: string; fallback: ReactNode }) {
  const [broken, setBroken] = useState<string | null>(null);
  if (broken === url) return <>{fallback}</>;
  const source = cacheKey ? { uri: url, cacheKey } : { uri: url };
  return (
    <>
      <Image source={source} style={StyleSheet.absoluteFill} contentFit="cover" blurRadius={16} accessibilityIgnoresInvertColors />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.scrimFaint }]} />
      <Image
        source={source}
        style={StyleSheet.absoluteFill}
        contentFit="contain"
        transition={150}
        accessibilityIgnoresInvertColors
        onError={(e) => {
          logError('showing an event flyer on Home (showing the designed poster instead)', e.error);
          setBroken(url);
        }}
      />
    </>
  );
}

/** An event without a flyer: its colour, the date large, the name, the time and the venue. */
function DesignedPoster({ tile, tz }: { tile: EventTile; tz: string | null }) {
  const iso = tile.startsAt ? zonedParts(new Date(tile.startsAt), tz).iso : null;
  const day = iso ? parseISODate(iso)?.d : null;
  return (
    <View style={{ flex: 1, padding: space.md, justifyContent: 'space-between' }}>
      <Decor />
      {iso && day ? (
        <View style={{ alignSelf: 'flex-end', alignItems: 'flex-end' }}>
          <Txt variant="eyebrow" color="white" style={{ opacity: 0.85 }}>
            {monthShortUpper(iso)}
          </Txt>
          <Txt variant="display" color="white">
            {String(day)}
          </Txt>
          <Txt variant="caption" color="white" style={{ opacity: 0.9 }}>
            {shortWhen(tile.startsAt, tz)}
          </Txt>
        </View>
      ) : (
        <View />
      )}
      <View style={{ gap: 4 }}>
        <Txt variant="cardTitle" color="white" numberOfLines={3} style={{ fontFamily: fonts.displayBold }}>
          {tile.name}
        </Txt>
        {tile.venue ? (
          <Row gap={4} align="flex-start">
            <Icon name="location-outline" size={13} color={colors.white} />
            <Txt variant="caption" color="white" numberOfLines={2} style={{ flex: 1, opacity: 0.9 }}>
              {tile.venue}
            </Txt>
          </Row>
        ) : null}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Listen
// ---------------------------------------------------------------------------

type PicturesData<T> = { tiles: T[]; pictures: Record<string, string>; pictureError: string | null };

/** Pictures for media tiles; a failure keeps the tiles (designed ones) and says so in the rail. */
async function withPictures<T>(tiles: T[], itemOf: (tile: T) => MediaItem): Promise<PicturesData<T>> {
  try {
    return { tiles, pictures: tiles.length ? await mediaPictures(tiles.map(itemOf)) : {}, pictureError: null };
  } catch (err) {
    return { tiles, pictures: {}, pictureError: report(err, 'load the pictures').userMessage };
  }
}

function ListenRail({ shown, onPlace }: RailSlot) {
  const t = useT();
  const router = useRouter();
  const { center, member } = useApp();
  const player = usePlayer();
  const watch = useWatch();
  const [watched, setWatched] = useState<MediaItem | null>(null);
  const state = useRailLoad(
    shown,
    async (): Promise<PicturesData<ListenTile>> => {
      if (!center) return { tiles: [], pictures: {}, pictureError: null };
      const [playlist, library] = await Promise.all([loadMyPlaylist(center.id), listMedia(center.id, ['stavan', 'podcast'], { sort: 'recent', limit: 30 })]);
      return withPictures(listenTiles(playlist, library), (x) => x.item);
    },
    [center?.id, member?.person.id],
    'load stavans and podcasts',
  );
  const d = state.data;

  // Play it in the app's player (from this tile on through its queue) and open the item's screen, which is the player.
  const play = (tile: ListenTile) => {
    const item = tile.item;
    const how = playbackOf(item);
    if (how === 'audio') {
      if (player.current?.id !== item.id || player.error) {
        const queue = (d?.tiles ?? []).filter((x) => x.queue === tile.queue).map((x) => toQueueItem(t, x.item));
        player.playQueue(queue, item.id);
      }
      openItem(router, item);
    } else if (how === 'watch' || how === 'link') {
      setWatched(item);
      watch.watch(item);
    } else {
      openItem(router, item);
    }
  };

  const notice = (
    <>
      {d?.pictureError ? <Banner tone="error" title={t('home.rail.picturesFailed')} message={d.pictureError} action={{ label: t('common.retry'), onPress: state.reload }} /> : null}
      {watch.error ? <Banner tone="error" message={watch.error} action={watched ? { label: t('common.retry'), onPress: () => watch.watch(watched) } : undefined} /> : null}
    </>
  );

  return (
    <Rail
      title={t('home.rail.listen')}
      shape="square"
      captionLines={2}
      loading={shown}
      onSeeAll={() => router.push({ pathname: '/jain-way', params: { tab: 'three_l', section: 'listen' } })}
      items={d?.tiles}
      error={state.error}
      reload={state.reload}
      keyOf={(x) => x.key}
      onPlace={onPlace}
      notice={notice}
      renderTile={(tile, ctx) => <ListenTileView tile={tile} ctx={ctx} picture={d?.pictures[tile.item.id] ?? null} busy={watch.busyId === tile.item.id} onPress={() => play(tile)} />}
    />
  );
}

const KIND_TILE: Record<MediaItem['kind'], () => string> = {
  stavan: () => colors.purple,
  podcast: () => colors.store,
  video: () => colors.videoTile,
  recipe: () => colors.green,
};

function ListenTileView({ tile, ctx, picture, busy, onPress }: { tile: ListenTile; ctx: TileCtx; picture: string | null; busy: boolean; onPress: () => void }) {
  const t = useT();
  const p = usePlayer();
  const item = tile.item;
  const how = playbackOf(item);
  const isCurrent = p.current?.id === item.id;
  const playing = isCurrent && p.playing;
  const sub = playing ? t('player.playing') : [kindName(t, item.kind), mediaSubtitle(t, item)].filter(Boolean).join(' · ');
  // The glyph says what the tile does (it plays, or opens); a tile already playing shows the speaker.
  const glyph: IconName = how === 'link' ? 'open-outline' : how === 'none' ? 'chevron-forward' : playing ? 'volume-high' : 'play';
  return (
    <RailTile ctx={ctx} label={[item.title, sub].filter(Boolean).join('. ')} hint={how === 'audio' ? t('home.rail.playHint') : t('home.rail.openHint')} onPress={onPress}>
      <View style={{ height: ctx.size.height ?? undefined, borderRadius: radii.xl, overflow: 'hidden', backgroundColor: KIND_TILE[item.kind](), alignItems: 'center', justifyContent: 'center' }}>
        <TilePicture
          uri={picture}
          what={`the picture of ${item.title}`}
          fallback={
            <>
              <Decor />
              <Icon name={KIND_ICON[item.kind]} size={44} color={colors.white} />
            </>
          }
        />
        <View style={{ position: 'absolute', right: 8, bottom: 8, width: 36, height: 36, borderRadius: 18, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
          <Icon name={busy ? 'hourglass-outline' : glyph} size={18} color={colors.navy} />
        </View>
        {isCurrent ? <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 4, backgroundColor: colors.onNavyGreen, pointerEvents: 'none' }} /> : null}
      </View>
      <TileCaption title={item.title} sub={sub} subColor={isCurrent ? 'navy' : 'muted'} />
    </RailTile>
  );
}

// ---------------------------------------------------------------------------
// Give
// ---------------------------------------------------------------------------

function GiveRail({ shown, onPlace }: RailSlot) {
  const t = useT();
  const router = useRouter();
  const { center } = useApp();
  const state = useRailLoad(shown, async () => (center ? giveTiles(await listOpportunities(center.id)) : []), [center?.id], 'load giving opportunities');
  return (
    <Rail
      title={t('home.rail.give')}
      shape="card"
      captionLines={0}
      loading={shown}
      onSeeAll={() => router.push('/give')}
      items={state.data}
      error={state.error}
      reload={state.reload}
      keyOf={(x) => x.key}
      onPlace={onPlace}
      renderTile={(tile, ctx) => <GiveTileView tile={tile} ctx={ctx} />}
    />
  );
}

function GiveTileView({ tile, ctx }: { tile: GiveTile; ctx: TileCtx }) {
  const t = useT();
  const router = useRouter();
  const { scale } = useSettings();
  const amount = tile.fromCents ? t('give.from', { amount: tile.compact ? formatCentsCompact(tile.fromCents) : formatCents(tile.fromCents) }) : t('give.anyAmount');
  return (
    <RailTile ctx={ctx} label={[tile.title, tile.detail, amount].filter(Boolean).join('. ')} hint={t('home.rail.giveHint')} onPress={() => router.push({ pathname: '/opportunity/[id]', params: { id: tile.opportunityId } })}>
      <View style={{ flexGrow: 1, minHeight: Math.round(150 * Math.min(scale, 1.3)), borderRadius: radii.xl, backgroundColor: colors.brownTint, borderWidth: 1, borderColor: colors.brownBorder, padding: space.cardX, gap: space.md, justifyContent: 'space-between' }}>
        <View style={{ gap: 4 }}>
          <Txt variant="headline" numberOfLines={3}>
            {tile.title}
          </Txt>
          {tile.detail ? (
            <Txt variant="meta" color="brownText" numberOfLines={2}>
              {tile.detail}
            </Txt>
          ) : null}
        </View>
        {/* The amount has the whole line to itself, so a large one never wraps; the round button says the tile opens. */}
        <Row style={{ justifyContent: 'space-between' }} gap={space.sm}>
          <Txt variant="bodyStrong" color="brown" style={{ flex: 1 }}>
            {amount}
          </Txt>
          <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.brown, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="chevron-forward" size={18} color={colors.white} />
          </View>
        </Row>
      </View>
    </RailTile>
  );
}

// ---------------------------------------------------------------------------
// Photos
// ---------------------------------------------------------------------------

type PhotosData = { tiles: PhotoTile[]; urls: Record<string, string>; urlError: string | null };

function PhotosRail({ shown, onPlace }: RailSlot) {
  const t = useT();
  const router = useRouter();
  const { center, member } = useApp();
  const tz = center?.time_zone ?? null;
  const [openError, setOpenError] = useState<{ message: string; retry: () => void } | null>(null);
  const state = useRailLoad(
    shown,
    async (): Promise<PhotosData> => {
      if (!center) return { tiles: [], urls: {}, urlError: null };
      const { albums, urls, urlError } = await loadAlbumPreviewsWithCovers(center.id, PHOTO_TILES);
      return { tiles: photoTiles(albums, tz), urls, urlError };
    },
    [center?.id, member?.person.id, tz],
    'load photo albums',
  );
  const d = state.data;

  const open = (tile: PhotoTile) => {
    setOpenError(null);
    const online = tile.onlineUrl;
    if (!online) {
      router.push({ pathname: '/album/[id]', params: { id: tile.albumId } });
      return;
    }
    WebBrowser.openBrowserAsync(online).catch((err: unknown) => setOpenError({ message: report(err, 'open the full album').userMessage, retry: () => open(tile) }));
  };

  const notice = (
    <>
      {d?.urlError ? <Banner tone="error" title={t('home.rail.picturesFailed')} message={d.urlError} action={{ label: t('common.retry'), onPress: state.reload }} /> : null}
      {openError ? <Banner tone="error" message={openError.message} action={{ label: t('common.retry'), onPress: openError.retry }} /> : null}
    </>
  );

  return (
    <Rail
      title={t('home.rail.photos')}
      shape="wide"
      captionLines={2}
      loading={shown}
      onSeeAll={() => router.push({ pathname: '/events', params: { view: 'photos' } })}
      items={d?.tiles}
      error={state.error}
      reload={state.reload}
      keyOf={(x) => x.key}
      onPlace={onPlace}
      notice={notice}
      renderTile={(tile, ctx) => <PhotoTileView tile={tile} ctx={ctx} url={tile.coverPath ? (sizedPhotoUrl(d?.urls[tile.coverPath], 'thumb') ?? null) : null} onPress={() => open(tile)} />}
    />
  );
}

function PhotoTileView({ tile, ctx, url, onPress }: { tile: PhotoTile; ctx: TileCtx; url: string | null; onPress: () => void }) {
  const t = useT();
  const pal = paletteFor(tile.albumId);
  const sub = [tile.date, tile.onlineUrl ? t('photos.onlineCount') : null].filter(Boolean).join(' · ');
  return (
    <RailTile ctx={ctx} label={[tile.title, sub].filter(Boolean).join('. ')} hint={tile.onlineUrl ? t('home.rail.onlineAlbumHint') : t('home.rail.albumHint')} onPress={onPress}>
      <View style={{ height: ctx.size.height ?? undefined, borderRadius: radii.xl, overflow: 'hidden', backgroundColor: pal.tiles[0], alignItems: 'center', justifyContent: 'center' }}>
        <TilePicture
          uri={url}
          what={`the cover of ${tile.title}`}
          fallback={
            <>
              <Decor />
              <EventIcon name="photo" size={30} color={colors.white} />
            </>
          }
        />
      </View>
      <TileCaption title={tile.title} sub={sub} />
    </RailTile>
  );
}

// ---------------------------------------------------------------------------
// Fully Jain recipes
// ---------------------------------------------------------------------------

function RecipesRail({ shown, onPlace }: RailSlot) {
  const t = useT();
  const router = useRouter();
  const { center, member } = useApp();
  const state = useRailLoad(
    shown,
    async (): Promise<PicturesData<MediaItem>> => {
      if (!center) return { tiles: [], pictures: {}, pictureError: null };
      return withPictures(recipeTiles(await listMedia(center.id, ['recipe'], { sort: 'recent' })), (x) => x);
    },
    [center?.id, member?.person.id],
    'load the recipes',
  );
  const d = state.data;
  return (
    <Rail
      title={t('home.rail.recipes')}
      shape="square"
      captionLines={2}
      loading={shown}
      onSeeAll={() => router.push({ pathname: '/media/[kind]', params: { kind: 'recipe', fullyJain: '1' } })}
      items={d?.tiles}
      error={state.error}
      reload={state.reload}
      keyOf={(x) => `recipe:${x.id}`}
      onPlace={onPlace}
      notice={d?.pictureError ? <Banner tone="error" title={t('home.rail.picturesFailed')} message={d.pictureError} action={{ label: t('common.retry'), onPress: state.reload }} /> : null}
      renderTile={(item, ctx) => <RecipeTileView item={item} ctx={ctx} picture={d?.pictures[item.id] ?? null} />}
    />
  );
}

function RecipeTileView({ item, ctx, picture }: { item: MediaItem; ctx: TileCtx; picture: string | null }) {
  const t = useT();
  const router = useRouter();
  // Every tile here is fully Jain (the rail's title says so), so the line is the time and the servings.
  const total = (item.meta.prepMinutes ?? 0) + (item.meta.cookMinutes ?? 0);
  const sub = [total > 0 ? t('media.minutes', { n: total }) : null, item.meta.servings ? t('media.serves', { n: item.meta.servings }) : null].filter(Boolean).join(' · ');
  return (
    <RailTile ctx={ctx} label={[item.title, sub].filter(Boolean).join('. ')} hint={t('home.rail.openHint')} onPress={() => openItem(router, item)}>
      <View style={{ height: ctx.size.height ?? undefined, borderRadius: radii.xl, overflow: 'hidden', backgroundColor: colors.greenTint, alignItems: 'center', justifyContent: 'center' }}>
        <TilePicture uri={picture} what={`the photo of ${item.title}`} fallback={<Icon name={KIND_ICON.recipe} size={40} color={colors.green} />} />
      </View>
      <TileCaption title={item.title} sub={sub} />
    </RailTile>
  );
}

import { Image } from 'expo-image';
import { useRouter, type Href } from 'expo-router';
import { Fragment, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { Icon, type IconName } from '@/components/icon';
import { ErrorState } from '@/components/states';
import { Banner, Row, Txt } from '@/components/ui';
import type { StringKey } from '@/i18n';
import { listHouseholdRsvps, listUpcomingEvents, rsvpBlockReason } from '@/lib/api/events';
import type { SpecialDay } from '@/lib/api/family';
import { BUCKETS, signedUrls } from '@/lib/api/files';
import { listOpportunities } from '@/lib/api/giving';
import { loadGyanSummary } from '@/lib/api/gyan';
import { countAttendees, type TodayInfo } from '@/lib/api/home';
import { loadJainWayToday } from '@/lib/api/jainway';
import { listMedia, listNewestRecipes, loadMyPlaylist, mediaPictures } from '@/lib/api/media';
import type { FamilyMember } from '@/lib/api/member';
import { logError, report, type AppError } from '@/lib/errors';
import { needsResign } from '@/lib/flyer';
import { formatCents, formatCentsCompact, formatDateTime, monthShortUpper, parseISODate, zonedParts } from '@/lib/format';
import { homeRows, learnListenTiles, lifeTiles, SPECIAL_DAYS_HOLD_MS, type HomeMember, type HomeRow, type LearnListenTile, type LifeTile } from '@/lib/home-rails';
import { communityName } from '@/lib/learning';
import { isHomeCardVisible } from '@/lib/modules';
import { pictureOf, type MediaItem } from '@/lib/media-library';
import { sizedPhotoUrl } from '@/lib/photo-size';
import { streakDisplay, streakLabel } from '@/lib/rules';
import { useLoad, type LoadState } from '@/lib/use-load';
import { useAccess, useFeature } from '@/providers/access';
import { useApp } from '@/providers/app';
import { useCategory } from '@/providers/category';
import { useModule, useModules } from '@/providers/modules';
import { usePlayer } from '@/providers/player';
import { useT } from '@/providers/settings';
import { colors, fonts, radii, space } from '@/theme';

import { EventIcon } from './event-icons';
import { bandFor } from './events';
import { Decor, Rail, RailTile, TileBadge, TileCaption, TilePicture, useHold, useRailLoad, type RailReveal, type RailSlot, type TileCtx } from './home-rail';
import {
  eventCards,
  eventChipSpoken,
  eventChipText,
  eventTarget,
  eventTiles,
  flyersToSign,
  giveTiles,
  jainWayLabel,
  learningGoalInputs,
  learningState,
  learnListenCards,
  playlistQueue,
  photoTiles,
  specialDayTitle,
  specialDayWhen,
  type EventCard,
  type EventChip,
  type EventTile,
  type GiveTile,
  type LearnListenCard,
  type LearnListenParts,
  type LearningTile,
  type Part,
  type RsvpFacts,
  type SignedFlyer,
} from './home-rail-items';
import { upcomingSpecialDays } from './home-rules';
import { DateTile, TileLoading, TodayGreeting, TodayTile, useHomeSpecialDays, useTodayHidden, useTodayInfo, type HomeSpecialDaysData } from './home';
import { JainWayProgressCard } from './jain-way-progress';
import { canPlanLabh, occasionOf } from './special-days';
import { loadAlbumPreviewsWithCovers, paletteFor } from './photos';
import { KIND_ICON, mediaSubtitle, toQueueItem } from './three-l/media-ui';

/*
 * Home in rows (owner, 2026-10-02). Every row is a strip of tiles that scrolls sideways (home-rail.tsx); the
 * built-in order and what is in each is set here (the member-app template can reorder or hide the rows, see HOME_WIDGETS):
 *
 *   1  Today at {center} and My Jain Way (no title: the tiles carry their own)
 *   2  Plan a special day (the family's days in the next two months; the whole row is hidden without any)
 *   3  Events, each with the family's RSVP status
 *   4  Giving opportunities
 *   5  Life@{center}
 *   6  Learn & listen
 *
 * Which rows show and which tiles Life@{center} and Learn & listen have are pure rules (src/lib/home-rails.ts);
 * the tiles are built from the data in home-rail-items.ts. Events, Giving opportunities and Learn & listen load on their
 * own, only when they come near the screen. Plan a special day loads when Home does, because it hides itself (most
 * families have no day coming) and a row that turns up late would move everything under it: until it knows, the rows under
 * it are drawn invisible, for at most SPECIAL_DAYS_HOLD_MS.
 */

const NOT_PLACED = () => {};

/** The rows that load only as they come near the screen. */
export type LazyRow = Extract<HomeRow, 'events' | 'give' | 'learnListen'>;

/**
 * Every row this member (or guest) gets, in Home order; each one a direct child of Home's content so its top
 * is known. Like every Home card, a row reloads after a write elsewhere in the app (the screen holds that back
 * while another screen is on top of Home: src/app/(app)/(tabs)/index.tsx). `underToday` is what goes between the first
 * row and the second: the notices that load after Home has been drawn (feedback, lunch times, the less urgent alerts),
 * under Today so that they never push it down.
 */
export function HomeRows({ reveal, underToday }: { reveal: RailReveal<LazyRow>; underToday?: ReactNode }) {
  const { center, member } = useApp();
  const { map } = useModules();
  const { layout, template } = useCategory();
  const access = useAccess();
  const guide = useFeature('guide');
  const learn = useFeature('learn');
  const listen = useFeature('listen');
  const look = useFeature('look');
  const who: HomeMember = member ? { isAdult: member.isAdult, hasHousehold: !!member.household } : null;
  // The rows this person gets, in the template's order (Home's built-in order without a template; a row the template leaves out is hidden).
  // The rules still decide each row (modules, adults, guests, tiles), so a template can never show what the community has switched off.
  const rows = homeRows({ rules: center?.rules ?? null, modules: map, member: who, access: { guide: guide.allowed, learn: learn.allowed, listen: listen.allowed, look: look.allowed }, layout, order: template.rows });
  // Plan a special day: its load starts now. Until it knows whether it has days, the rows under it are held (see above).
  const daysAt = rows.indexOf('specialDays');
  const days = useHomeSpecialDays(daysAt >= 0);
  const holding = useHold(daysAt >= 0 && days.data === undefined && !days.error, SPECIAL_DAYS_HOLD_MS);
  if (!center) return null;
  // Learn & listen waits for what this person may use. When that could not be read, the row says so, with Try again, instead of its tiles being quietly missing.
  const tilesIfAllowed = learnListenTiles({ rules: center.rules, modules: map, signedIn: !!member, access: { learn: true, listen: true, look: true }, defaultShortcuts: layout.shortcuts }).length;
  const tilesNow = learnListenTiles({ rules: center.rules, modules: map, signedIn: !!member, access: { learn: learn.allowed, listen: listen.allowed, look: look.allowed }, defaultShortcuts: layout.shortcuts }).length;
  const accessProblem = access.error && tilesIfAllowed > tilesNow ? { error: access.error, retry: () => void access.reload() } : null;
  const slot = (row: LazyRow): RailSlot => ({ shown: reveal.revealed.includes(row), onPlace: (top) => reveal.place(row, top) });
  const under = <Fragment key="under-today">{underToday}</Fragment>;
  return (
    <>
      {rows.includes('today') ? null : under}
      {rows.map((row) => HOME_WIDGETS[row]({ slot, held: holding && rows.indexOf(row) > daysAt, days, accessProblem, under }))}
      {/* Said only when the template keeps this row: a row it hides has nothing to say. */}
      {accessProblem && template.rows.includes('learnListen') && !rows.includes('learnListen') ? <LearnListenAccessError error={accessProblem.error} onRetry={accessProblem.retry} /> : null}
    </>
  );
}

/** What Home gives a row's widget when it draws it. */
export type HomeWidgetEnv = {
  /** When the row may load (Events, Giving opportunities and Learn & listen load as they come near the screen). */
  slot: (row: LazyRow) => RailSlot;
  /** The row is under Plan a special day while that is still loading, so it is drawn invisible for a moment. */
  held: boolean;
  /** Plan a special day's data (it loads when Home does). */
  days: LoadState<HomeSpecialDaysData>;
  /** Why what Learn & listen may use could not be read (the row then says so, with Try again), or null. */
  accessProblem: { error: AppError; retry: () => void } | null;
  /** The notices that load after Home was drawn: they go directly under Today. */
  under: ReactNode;
};

/**
 * The widget registry: every Home row this build can draw, the row's id to the component that draws it. Home draws the rows in
 * the order of the member-app template (src/lib/template.ts, delivered with the kind of organization's profile), so the app
 * changes by kind and faith with no update; a template id this build has no widget for never gets here (the template drops it).
 * The six rows below are the whole registry; a new kind of row is a new entry here and an id in TEMPLATE_ROWS. Each widget
 * returns its element with a key, because Home draws them as a list.
 */
export const HOME_WIDGETS: Record<HomeRow, (env: HomeWidgetEnv) => ReactNode> = {
  today: (env) => (
    <Fragment key="today">
      <TodayRow />
      {env.under}
    </Fragment>
  ),
  specialDays: (env) => <SpecialDaysRow key="specialDays" state={env.days} />,
  events: (env) => <EventsRow key="events" {...env.slot('events')} held={env.held} />,
  give: (env) => <GiveRow key="give" {...env.slot('give')} held={env.held} />,
  life: (env) => <LifeRow key="life" held={env.held} />,
  learnListen: (env) => <LearnListenRow key="learnListen" {...env.slot('learnListen')} held={env.held} accessProblem={env.accessProblem} />,
};

// ---------------------------------------------------------------------------
// Row 1: Today at {center} and My Jain Way
// ---------------------------------------------------------------------------

type TodayTileKey = 'today' | 'jainWay';

/**
 * Today at {center}, with the height and content it has always had, and My Jain Way beside it for a member (the navy
 * progress tile; it opens the My Jain Way tab with the full list of practices). A guest gets Today alone. Beside My Jain Way
 * the card is 24 px narrower than the old one, so its three timing tiles have 4 px of padding at each side instead of 8
 * (TIME_TILE_PAD_X) and each time keeps the room for its words the old card gave it, at every text size. When the member
 * has hidden Today, its greeting line stands in for it above whatever tiles are left.
 */
function TodayRow() {
  const t = useT();
  const { center, member } = useApp();
  const { map } = useModules();
  const today = useTodayInfo();
  const [hidden, setHidden] = useTodayHidden();
  const community = center?.short_name || center?.name || '';
  const jainWayOn = !!member && isHomeCardVisible(map, 'jainWay');
  const keys: TodayTileKey[] = [...(hidden ? [] : (['today'] as const)), ...(jainWayOn ? (['jainWay'] as const) : [])];
  return (
    <>
      {hidden ? <TodayGreeting onShow={() => setHidden(false)} /> : null}
      <Rail
        label={t('home.todayAt', { center: community })}
        shape="hero"
        captionLines={0}
        loading={false}
        items={keys}
        error={null}
        reload={NOT_PLACED}
        keyOf={(k) => k}
        onPlace={NOT_PLACED}
        renderTile={(k, ctx) => (k === 'today' ? <TodayTile state={today} onHide={() => setHidden(true)} /> : <JainWayTile today={today} ctx={ctx} />)}
      />
    </>
  );
}

/** My Jain Way: the navy progress card of the My Jain Way tab, with the next practice under it, as one button to that tab. */
function JainWayTile({ today, ctx }: { today: LoadState<TodayInfo>; ctx: TileCtx }) {
  const t = useT();
  const router = useRouter();
  const { center, member } = useApp();
  const state = useLoad(() => (center && member ? loadJainWayToday(center, member.person.id) : Promise.reject(new Error('not signed in'))), [center?.id, member?.person.id], 'load My Jain Way');
  if (state.data === undefined) return state.error ? <ErrorState error={state.error} onRetry={() => void state.reload()} /> : <TileLoading />;
  const d = state.data;
  const community = communityName(center);
  const total = d.selected.length;
  const done = d.doneIds.length;
  const streak = streakDisplay(d.streak, d.today);
  const next = d.selected.find((p) => !d.doneIds.includes(p.id));
  const status = total === 0 ? t('home.choosePractices') : next ? t('home.nextPractice', { name: next.name }) : t('home.allDone');
  const label = jainWayLabel(t, { done, total, points: d.pointsTotal, community, streak: streakLabel(streak.days), next: next?.name ?? null });
  return (
    <RailTile ctx={ctx} label={label} hint={t('home.myWayHint')} onPress={() => router.push('/jain-way')} radius={radii.xxl} gap={0}>
      <JainWayProgressCard
        d={d}
        tithi={today.data?.tithi ?? null}
        community={community}
        asHeader={false}
        compact
        style={{ flexGrow: 1 }}
        footer={
          <Txt variant="meta" color="white" style={{ fontFamily: fonts.bodySemi }} numberOfLines={2}>
            {status}
          </Txt>
        }
      />
    </RailTile>
  );
}

// ---------------------------------------------------------------------------
// Row 2: Plan a special day
// ---------------------------------------------------------------------------

/**
 * The family's special days coming in the next two calendar months (today to the same day two months on), soonest first, at
 * most ten, each a tile that opens the labh planner (or the special days when no labh can be planned). With none coming the
 * whole row is hidden. It draws nothing while it loads (most families have nothing here, so a skeleton would only flash), and
 * it loads when Home does (HomeRows), not when it nears the screen. Special days are added and read in Family › Special
 * days; the Special days tile of Life@{center} keeps that a tap away when this row is hidden.
 */
function SpecialDaysRow({ state }: { state: LoadState<HomeSpecialDaysData> }) {
  const t = useT();
  const { member } = useApp();
  const d = state.data;
  const days = d && d.today ? upcomingSpecialDays(d.rows, d.hidden, d.today) : undefined;
  return (
    <Rail
      title={t('home.row.special')}
      label={t('home.row.special')}
      shape="card"
      captionLines={0}
      loading
      quiet
      items={days}
      error={state.error}
      reload={() => void state.reload()}
      keyOf={(x) => x.day.id}
      onPlace={NOT_PLACED}
      renderTile={(x, ctx) => <SpecialDayTile x={x} today={d?.today ?? ''} ctx={ctx} members={member?.members ?? []} adult={!!member?.isAdult} />}
    />
  );
}

function SpecialDayTile({ x, today, ctx, members, adult }: { x: { day: SpecialDay; next: string; inDays: number }; today: string; ctx: TileCtx; members: FamilyMember[]; adult: boolean }) {
  const t = useT();
  const router = useRouter();
  const givingOn = useModule('giving');
  const title = specialDayTitle(t, x.day, x.next, members);
  const when = specialDayWhen(t, today, x.next, x.inDays);
  const labh = canPlanLabh({ givingOn, isAdult: adult, occasion: occasionOf(x.day), labhPromptEnabled: x.day.labh_prompt_enabled });
  const action = labh ? t('home.planLabh') : t('home.planDay');
  const open = () => (labh ? router.push(`/labh/${encodeURIComponent(x.day.id)}` as Href) : router.push('/special-days'));
  return (
    <RailTile ctx={ctx} label={[title, when, action].join('. ')} hint={labh ? t('home.special.labhHint') : t('home.special.daysHint')} onPress={open}>
      <View style={{ flexGrow: 1, borderRadius: radii.xl, backgroundColor: colors.card, borderWidth: 2, borderColor: colors.saffron, padding: space.cardX, gap: space.md, justifyContent: 'space-between' }}>
        <Row gap={space.md} align="flex-start">
          <DateTile iso={x.next} bg={colors.brownTint} fg={colors.brown} />
          <View style={{ flex: 1, gap: 2 }}>
            <Txt variant="headline" numberOfLines={3}>
              {title}
            </Txt>
            <Txt variant="meta" color="muted" numberOfLines={2}>
              {when}
            </Txt>
          </View>
        </Row>
        <View style={{ minHeight: 44, borderRadius: radii.pill, backgroundColor: colors.brown, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.md }}>
          <Txt variant="smallStrong" color="white" center>
            {action}
          </Txt>
        </View>
      </View>
    </RailTile>
  );
}

// ---------------------------------------------------------------------------
// Row 3: Events
// ---------------------------------------------------------------------------

type EventsData = {
  cards: EventCard[];
  /** Why the family's RSVPs could not be read (the tiles then carry no RSVP status). */
  rsvpError: string | null;
  /** Signed flyer links by event. */
  flyers: Record<string, string>;
  /** Why the flyers could not be signed (the tiles show the designed poster meanwhile). */
  flyerError: string | null;
};

/** The flyers' signed links, kept while they are fresh (flyersToSign): the row reloads after every write, and a new link means a browser downloads every flyer again. */
const keptFlyerLinks = new Map<string, SignedFlyer>();

/**
 * The events' flyers, signed in one request (those whose link is not still fresh). A failure is returned, not thrown:
 * the events show with their designed posters (or the flyers whose link is still good) and the row says so.
 */
async function signFlyers(tiles: readonly EventTile[]): Promise<{ urls: Record<string, string>; error: string | null }> {
  let error: string | null = null;
  const toSign = flyersToSign(tiles, keptFlyerLinks, Date.now());
  if (toSign.length > 0) {
    try {
      const signed = await signedUrls(toSign, BUCKETS.content, 'load the event flyers');
      const signedAt = Date.now();
      signed.forEach((url, path) => keptFlyerLinks.set(path, { url, signedAt }));
    } catch (err) {
      error = report(err, 'load the event flyers').userMessage;
    }
  }
  const urls: Record<string, string> = {};
  const now = Date.now();
  for (const x of tiles) {
    const link = x.flyerPath ? keptFlyerLinks.get(x.flyerPath) : undefined;
    if (link && !needsResign(link.signedAt, now)) urls[x.eventId] = link.url;
  }
  return { urls, error };
}

/** The family's RSVP to each of these events, with how many people are on it; a failure is returned, not thrown. */
async function readRsvps(householdId: string, eventIds: readonly string[]): Promise<{ facts: Record<string, RsvpFacts>; error: string | null }> {
  if (eventIds.length === 0) return { facts: {}, error: null };
  try {
    const rsvps = await listHouseholdRsvps(householdId, [...eventIds]);
    const counts = await countAttendees([...rsvps.values()].filter((r) => r.status !== 'cancelled').map((r) => r.id));
    const facts: Record<string, RsvpFacts> = {};
    rsvps.forEach((r, eventId) => {
      facts[eventId] = { status: r.status, count: counts.get(r.id) ?? 0 };
    });
    return { facts, error: null };
  } catch (err) {
    return { facts: {}, error: report(err, 'load your RSVPs').userMessage };
  }
}

/**
 * Upcoming events as posters (2:3): the signed flyer when the event has one, else a designed poster with its
 * name, date and venue. A member sees the family's RSVP status on every tile as a chip, in date order; only an event the
 * family still has to confirm (an adult's Confirm chip) is moved to the front. A guest sees the public events with no status.
 */
function EventsRow({ shown, onPlace, held }: RailSlot & { held: boolean }) {
  const t = useT();
  const router = useRouter();
  const { center, member } = useApp();
  const tz = center?.time_zone ?? null;
  const householdId = member?.household?.id ?? null;
  const adult = !!member?.isAdult;
  const signedIn = !!member;
  const state = useRailLoad(
    shown,
    async (): Promise<EventsData> => {
      if (!center) return { cards: [], rsvpError: null, flyers: {}, flyerError: null };
      const now = new Date();
      const events = await listUpcomingEvents(center.id);
      const tiles = eventTiles(
        events.map((e) => ({
          id: e.id,
          name: e.name,
          venue: e.venue,
          starts_at: e.starts_at,
          ends_at: e.ends_at,
          status: e.status,
          flyer_path: e.flyer_path,
          rsvp_block: rsvpBlockReason(e, now),
          rsvp_opens_at: e.rsvp_opens_at,
          confirmation_hours_before: e.confirmation_hours_before,
        })),
        now,
      );
      // The RSVPs and the flyers only need the events: ask for both at once. The RSVPs are asked for every event the list returned, not only the ones with a tile: that is what the "Still coming?" load asks too, so a request already on its way is shared (api/events listHouseholdRsvps).
      const [rsvps, flyers] = await Promise.all([signedIn && householdId ? readRsvps(householdId, tiles.length > 0 ? events.map((e) => e.id) : []) : Promise.resolve({ facts: null, error: null }), signFlyers(tiles)]);
      // Without the family's RSVPs there is no status to show (a guess would say "RSVP" on an event they are going to): the tiles carry none, and the row says why.
      const who = signedIn && rsvps.facts ? { now, adult } : null;
      return { cards: eventCards(tiles, rsvps.facts, who), rsvpError: rsvps.error, flyers: flyers.urls, flyerError: flyers.error };
    },
    [center?.id, householdId, signedIn, adult],
    'load upcoming events',
  );
  const d = state.data;
  // Banners about part of the row; none at all when everything loaded (the row then has nothing to say if it has no events).
  const notice =
    d?.flyerError || d?.rsvpError ? (
      <>
        {d.flyerError ? <Banner tone="error" title={t('home.rail.flyersFailed')} message={d.flyerError} action={{ label: t('common.retry'), onPress: state.reload }} /> : null}
        {d.rsvpError ? <Banner tone="error" title={t('home.rail.rsvpsFailed')} message={d.rsvpError} action={{ label: t('common.retry'), onPress: state.reload }} /> : null}
      </>
    ) : null;
  return (
    <Rail
      title={t('home.row.events')}
      label={t('home.row.events')}
      shape="poster"
      captionLines={1}
      loading={shown}
      onSeeAll={() => router.push('/events')}
      items={d?.cards}
      error={state.error}
      reload={state.reload}
      keyOf={(x) => x.tile.key}
      onPlace={onPlace}
      notice={notice}
      held={held}
      renderTile={(card, ctx) => <EventTileView card={card} ctx={ctx} tz={tz} flyerUrl={d?.flyers[card.tile.eventId] ?? null} />}
    />
  );
}

function chipLook(kind: EventChip['kind']): { bg: string; fg: string; border: string } {
  switch (kind) {
    case 'rsvp':
      return { bg: colors.brown, fg: colors.white, border: colors.brown };
    case 'confirm':
      return { bg: colors.navy, fg: colors.white, border: colors.navy };
    case 'going':
    case 'attended':
      return { bg: colors.greenTint, fg: colors.greenDark, border: colors.greenBorder };
    case 'waitlisted':
      return { bg: colors.brownTint, fg: colors.brownDark, border: colors.brownBorder };
    default:
      return { bg: colors.chip, fg: colors.muted, border: colors.border };
  }
}

/** The family's RSVP status under a poster: the ones that want a reply are filled, the rest are quiet. */
function EventChipView({ chip, tz }: { chip: EventChip; tz: string | null }) {
  const t = useT();
  const look = chipLook(chip.kind);
  return (
    <View style={{ alignSelf: 'stretch', minHeight: 30, borderRadius: radii.card, backgroundColor: look.bg, borderWidth: 1, borderColor: look.border, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6, paddingVertical: 3 }}>
      <Txt variant="caption" center numberOfLines={1} style={{ color: look.fg, fontFamily: fonts.bodyBold }}>
        {eventChipText(t, chip, tz)}
      </Txt>
    </View>
  );
}

function EventTileView({ card, ctx, tz, flyerUrl }: { card: EventCard; ctx: TileCtx; tz: string | null; flyerUrl: string | null }) {
  const t = useT();
  const router = useRouter();
  const { tile, chip } = card;
  const when = tile.live ? t('home.rail.liveNow') : formatDateTime(tile.startsAt, tz);
  const label = [tile.name, when, tile.venue, chip ? eventChipSpoken(t, chip, tz) : null].filter(Boolean).join('. ');
  const target = eventTarget(chip);
  const open = () => router.push(target === 'confirm' ? { pathname: '/event/[id]/confirm', params: { id: tile.eventId } } : target === 'tickets' ? { pathname: '/event/[id]/tickets', params: { id: tile.eventId } } : { pathname: '/event/[id]', params: { id: tile.eventId } });
  const designed = <DesignedPoster tile={tile} tz={tz} />;
  return (
    <RailTile ctx={ctx} label={label} hint={chip?.kind === 'confirm' ? t('home.event.confirmHint') : t('home.rail.openHint')} onPress={open}>
      <View style={{ height: ctx.size.height ?? undefined, borderRadius: radii.xl, overflow: 'hidden', backgroundColor: bandFor(tile.eventId) }}>
        {flyerUrl ? <FlyerPoster url={flyerUrl} cacheKey={tile.flyerPath ?? undefined} near={ctx.near} fallback={designed} /> : designed}
        {tile.live ? (
          <View style={{ position: 'absolute', top: 8, left: 8, pointerEvents: 'none' }}>
            <TileBadge label={t('home.rail.liveNow')} bg={colors.live} fg="white" />
          </View>
        ) : null}
      </View>
      {chip ? <EventChipView chip={chip} tz={tz} /> : null}
    </RailTile>
  );
}

/** A 2:3 flyer (width ÷ height) fills the poster exactly; a flyer this far from it gets the blurred copy behind it. */
const POSTER_WIDTH_OVER_HEIGHT = 2 / 3;

/**
 * The event's flyer, whole (a flyer is made to be read). A flyer of another shape than 2:3 is drawn over a blurred,
 * darkened copy of itself, so it still fills the poster; a 2:3 flyer needs no copy, so none is mounted (it would be a
 * second image view and a second decode for nothing). A tile that is not near the screen yet (`near`: the row mounts the
 * pictures of the tiles in view and two more) shows its colour only; the flyer mounts as the row is moved towards it.
 */
function FlyerPoster({ url, cacheKey, near, fallback }: { url: string; cacheKey?: string; near: boolean; fallback: ReactNode }) {
  const [broken, setBroken] = useState<string | null>(null);
  // The loaded flyer's width over its height (null until it has loaded).
  const [shape, setShape] = useState<number | null>(null);
  if (broken === url) return <>{fallback}</>;
  if (!near) return null;
  const source = cacheKey ? { uri: url, cacheKey } : { uri: url };
  const copy = shape !== null && Number.isFinite(shape) && Math.abs(shape - POSTER_WIDTH_OVER_HEIGHT) > 0.02;
  return (
    <>
      {copy ? (
        <>
          <Image source={source} style={StyleSheet.absoluteFill} contentFit="cover" blurRadius={16} accessibilityIgnoresInvertColors />
          <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.scrimFaint }]} />
        </>
      ) : null}
      <Image
        source={source}
        style={StyleSheet.absoluteFill}
        contentFit="contain"
        transition={150}
        accessibilityIgnoresInvertColors
        onLoad={(e) => setShape(e.source.height > 0 ? e.source.width / e.source.height : null)}
        onError={(e) => {
          logError('showing an event flyer on Home (showing the designed poster instead)', e.error);
          setBroken(url);
        }}
      />
    </>
  );
}

/**
 * An event without a flyer: its colour, the date, the name and the venue. The poster is a thumbnail (a little under 100 wide on a
 * phone), so the type is small: the name keeps three lines (it is what the member looks for), the venue one, and the time is
 * left for the event itself (it is in the tile's spoken label, and the RSVP chip sits under the poster).
 */
function DesignedPoster({ tile, tz }: { tile: EventTile; tz: string | null }) {
  const iso = tile.startsAt ? zonedParts(new Date(tile.startsAt), tz).iso : null;
  const day = iso ? parseISODate(iso)?.d : null;
  return (
    <View style={{ flex: 1, padding: space.sm + 2, justifyContent: 'space-between' }}>
      <Decor />
      {iso && day ? (
        <View style={{ alignSelf: 'flex-end', alignItems: 'flex-end' }}>
          <Txt variant="eyebrow" color="white" style={{ opacity: 0.85 }}>
            {monthShortUpper(iso)}
          </Txt>
          <Txt variant="title" color="white">
            {String(day)}
          </Txt>
        </View>
      ) : (
        <View />
      )}
      <View style={{ gap: 3 }}>
        <Txt variant="meta" color="white" numberOfLines={3} style={{ fontFamily: fonts.displayBold }}>
          {tile.name}
        </Txt>
        {tile.venue ? (
          <Row gap={3} align="flex-start">
            <Icon name="location-outline" size={11} color={colors.white} />
            <Txt variant="fine" color="white" numberOfLines={1} style={{ flex: 1, opacity: 0.9 }}>
              {tile.venue}
            </Txt>
          </Row>
        ) : null}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Row 4: Giving opportunities
// ---------------------------------------------------------------------------

/** Every open opportunity as a compact tile with "From $X" and View and sponsor; no rotation, nothing moves by itself. */
function GiveRow({ shown, onPlace, held }: RailSlot & { held: boolean }) {
  const t = useT();
  const router = useRouter();
  const { center } = useApp();
  const state = useRailLoad(shown, async () => (center ? giveTiles(await listOpportunities(center.id)) : []), [center?.id], 'load giving opportunities');
  return (
    <Rail
      title={t('home.row.give')}
      label={t('home.row.give')}
      shape="offer"
      captionLines={0}
      loading={shown}
      onSeeAll={() => router.push('/give')}
      items={state.data}
      error={state.error}
      reload={state.reload}
      keyOf={(x) => x.key}
      onPlace={onPlace}
      held={held}
      renderTile={(tile, ctx) => <GiveTileView tile={tile} ctx={ctx} />}
    />
  );
}

function GiveTileView({ tile, ctx }: { tile: GiveTile; ctx: TileCtx }) {
  const t = useT();
  const router = useRouter();
  const amount = tile.fromCents ? t('give.from', { amount: tile.compact ? formatCentsCompact(tile.fromCents) : formatCents(tile.fromCents) }) : t('give.anyAmount');
  return (
    <RailTile
      ctx={ctx}
      label={[tile.title, tile.detail, amount, t('home.viewAndSponsor')].filter(Boolean).join('. ')}
      hint={t('home.rail.giveHint')}
      onPress={() => router.push({ pathname: '/opportunity/[id]', params: { id: tile.opportunityId } })}>
      <View style={{ flexGrow: 1, borderRadius: radii.xl, backgroundColor: colors.brownTint, borderWidth: 1, borderColor: colors.brownBorder, padding: space.md, gap: space.sm, justifyContent: 'space-between' }}>
        <View style={{ gap: 2 }}>
          <Txt variant="headline" numberOfLines={2}>
            {tile.title}
          </Txt>
          {tile.detail ? (
            <Txt variant="meta" color="brownText" numberOfLines={2}>
              {tile.detail}
            </Txt>
          ) : null}
        </View>
        <View style={{ gap: space.xs }}>
          <Txt variant="bodyStrong" color="brown">
            {amount}
          </Txt>
          <View style={{ minHeight: 44, borderRadius: radii.pill, backgroundColor: colors.brown, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.md }}>
            <Txt variant="smallStrong" color="white" center>
              {t('home.viewAndSponsor')}
            </Txt>
          </View>
        </View>
      </View>
    </RailTile>
  );
}

// ---------------------------------------------------------------------------
// Row 5: Life@{center}
// ---------------------------------------------------------------------------

type LifeLook = { icon: IconName; bg: string; fg: string; label: StringKey; line: StringKey; href: Href };

// Read at render time, so the community's brand colours (theme.ts applyPalette) apply.
const lifeLook = (tile: LifeTile): LifeLook => {
  switch (tile) {
    case 'guide':
      return { icon: 'compass-outline', bg: colors.navyTint, fg: colors.navy, label: 'home.life.guide', line: 'home.life.guideLine', href: '/guide' };
    case 'whatsapp':
      return { icon: 'logo-whatsapp', bg: colors.greenTint, fg: colors.green, label: 'home.life.whatsapp', line: 'guide.tile.whatsappSub', href: '/guide/whatsapp' };
    case 'zone':
      return { icon: 'location-outline', bg: colors.brownTint, fg: colors.brown, label: 'home.life.zone', line: 'guide.tile.zoneSub', href: '/guide/zones' };
    case 'timings':
      return { icon: 'time-outline', bg: colors.navyTint, fg: colors.navy, label: 'home.life.timings', line: 'guide.tile.timingsSub', href: '/guide/timings' };
    case 'volunteer':
      return { icon: 'hand-left-outline', bg: colors.greenTint, fg: colors.green, label: 'home.life.volunteer', line: 'guide.tile.volunteerSub', href: '/guide/volunteer' };
    case 'admin':
      return { icon: 'people-outline', bg: colors.purpleTint, fg: colors.purple, label: 'home.life.admin', line: 'guide.tile.adminSub', href: '/guide/admin' };
    case 'specialDays':
      return { icon: 'gift-outline', bg: colors.brownTint, fg: colors.brown, label: 'home.life.specialDays', line: 'home.life.specialDaysLine', href: '/special-days' };
  }
};

/**
 * Life@{center} (it replaces the My {center} card): what the community offers to a member, a few features each with
 * an icon, a short label and one line on what it helps with. They go where the My {center} card and the New here
 * shortcut went (the community guide and its sections), plus Special days. Static: nothing to load, no skeleton.
 */
function LifeRow({ held }: { held: boolean }) {
  const t = useT();
  const router = useRouter();
  const { center, member } = useApp();
  const { map } = useModules();
  const { layout } = useCategory();
  const guide = useFeature('guide');
  const community = communityName(center);
  const keys = lifeTiles({ modules: map, guideAllowed: guide.allowed, member: member ? { isAdult: member.isAdult, hasHousehold: !!member.household } : null, specialDays: layout.specialDays });
  const title = t('home.row.life', { center: community });
  return (
    <Rail
      title={title}
      label={title}
      shape="feature"
      captionLines={0}
      loading={false}
      items={keys}
      error={null}
      reload={NOT_PLACED}
      keyOf={(k) => k}
      onPlace={NOT_PLACED}
      held={held}
      renderTile={(key, ctx) => {
        const look = lifeLook(key);
        const label = t(look.label);
        const line = t(look.line, { center: community });
        return (
          <RailTile ctx={ctx} label={`${label}. ${line}`} onPress={() => router.push(look.href)}>
            <View style={{ flexGrow: 1, borderRadius: radii.xl, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, padding: space.cardX, gap: space.sm }}>
              <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: look.bg, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name={look.icon} size={22} color={look.fg} />
              </View>
              <Txt variant="bodyStrong" numberOfLines={2}>
                {label}
              </Txt>
              <Txt variant="caption" color="muted" style={{ fontFamily: fonts.body }}>
                {line}
              </Txt>
            </View>
          </RailTile>
        );
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// Row 6: Learn & listen
// ---------------------------------------------------------------------------

type LearnListenData = {
  cards: LearnListenCard[];
  /** Pictures of the latest podcast and recipe, by item id. */
  pictures: Record<string, string>;
  /** The latest album's cover, signed. */
  photoUrls: Record<string, string>;
  /** My playlist (all of it): what a tap on the My playlist tile queues. */
  playlist: Part<MediaItem[]>;
  /** Why part of the row could not load (the tiles that could do without it still show). */
  errors: string[];
};

/** One load of the row: its value, or why it failed (kept apart so one failure never takes the rest of the row with it). */
async function attempt<T>(action: string, run: () => Promise<T>): Promise<{ part: Part<T>; error: string | null }> {
  try {
    return { part: { ok: true, value: await run() }, error: null };
  } catch (err) {
    return { part: { ok: false }, error: report(err, action).userMessage };
  }
}

/**
 * The old shortcut buttons as tiles: Continue learning (the next Gyan Path level, with its progress), My playlist
 * (plays all of it), Podcasts, Fully Jain recipes and Photos. A tile shows only when the community's Home shortcut,
 * its module and the access level of its area all allow it; one that is not allowed is not shown, not shown
 * locked, and with none left the row is gone.
 */
function LearnListenRow({ shown, onPlace, held, accessProblem }: RailSlot & { held: boolean; accessProblem: { error: AppError; retry: () => void } | null }) {
  const t = useT();
  const { center, member } = useApp();
  const { map } = useModules();
  const { layout } = useCategory();
  const learn = useFeature('learn');
  const listen = useFeature('listen');
  const look = useFeature('look');
  const order = center ? learnListenTiles({ rules: center.rules, modules: map, signedIn: !!member, access: { learn: learn.allowed, listen: listen.allowed, look: look.allowed }, defaultShortcuts: layout.shortcuts }) : [];
  const tz = center?.time_zone ?? null;
  const state = useRailLoad(
    shown,
    async (): Promise<LearnListenData> => {
      const none: LearnListenData = { cards: [], pictures: {}, photoUrls: {}, playlist: { ok: false }, errors: [] };
      if (!center || !member) return none;
      const me = member.person.id;
      const want = (tile: LearnListenTile) => order.includes(tile);
      const [learning, playlist, podcasts, recipes, photos] = await Promise.all([
        want('learning')
          ? // The summary, not loadGyan: Home needs the goals, the levels and the number of steps, not every lesson's quiz and activity.
            attempt('load your Gyan Path', async () => learningState(learningGoalInputs(await loadGyanSummary(center, me), me)))
          : undefined,
        want('playlist')
          ? attempt('load your playlist', async () => {
              const items = await loadMyPlaylist(center.id);
              // An empty playlist opens the most-liked stavans (the playlist screen offers them): worth a tile only if the library has something.
              const fallback = items.length === 0 && (await listMedia(center.id, ['stavan', 'podcast', 'video'], { sort: 'liked', limit: 1 })).length > 0;
              return { items, fallback };
            })
          : undefined,
        want('podcasts') ? attempt('load the podcasts', () => listMedia(center.id, ['podcast'], { sort: 'recent', limit: 1 })) : undefined,
        want('recipes') ? attempt('load the recipes', () => listNewestRecipes(center.id)) : undefined,
        want('photos')
          ? attempt('load photo albums', async () => {
              const { albums, urls, urlError } = await loadAlbumPreviewsWithCovers(center.id, 1);
              return { tiles: photoTiles(albums, tz), urls, urlError };
            })
          : undefined,
      ]);
      const parts: LearnListenParts = {
        learning: learning?.part,
        playlist: playlist?.part,
        podcasts: podcasts?.part,
        recipes: recipes?.part,
        photos: photos ? (photos.part.ok ? { ok: true, value: photos.part.value.tiles } : { ok: false }) : undefined,
      };
      const cards = learnListenCards(order, parts);
      const withPictures = cards.flatMap((c) => (c.kind === 'podcasts' || c.kind === 'recipes') && c.latest ? [c.latest] : []);
      const pictures = withPictures.length ? await attempt('load the pictures', () => mediaPictures(withPictures)) : { part: { ok: true, value: {} as Record<string, string> } as Part<Record<string, string>>, error: null };
      const photoUrls = photos?.part.ok ? photos.part.value.urls : {};
      const errors = [learning?.error, playlist?.error, podcasts?.error, recipes?.error, photos?.error, photos?.part.ok ? photos.part.value.urlError : null, pictures.error].filter((e): e is string => !!e);
      const queue: Part<MediaItem[]> = playlist?.part.ok ? { ok: true, value: playlist.part.value.items } : { ok: false };
      return { cards, pictures: pictures.part.ok ? pictures.part.value : {}, photoUrls, playlist: queue, errors };
    },
    [center?.id, member?.person.id, tz, order.join(',')],
    'load learn and listen',
  );
  const d = state.data;
  const title = t('home.row.learnListen');
  // What could not be had (or read): said inside the row with Try again, also when that leaves the row without a tile (railView).
  const failed = d && d.errors.length > 0 ? d.errors[0] : null;
  const notice =
    accessProblem || failed ? (
      <>
        {accessProblem ? <ErrorState error={accessProblem.error} onRetry={accessProblem.retry} /> : null}
        {failed ? <Banner tone="error" title={t('home.ll.partFailed')} message={failed} action={{ label: t('common.retry'), onPress: state.reload }} /> : null}
      </>
    ) : null;
  return (
    <Rail
      title={title}
      label={title}
      shape="wide"
      captionLines={2}
      loading={shown}
      items={d?.cards}
      error={state.error}
      reload={state.reload}
      keyOf={(c) => c.key}
      onPlace={onPlace}
      notice={notice}
      held={held}
      renderTile={(card, ctx) => <LearnListenTileView card={card} ctx={ctx} d={d} />}
    />
  );
}

/** Learn & listen when what the person may use could not be read: the row says so, with Try again, instead of its tiles quietly missing. */
function LearnListenAccessError({ error, onRetry }: { error: AppError; onRetry: () => void }) {
  const t = useT();
  return (
    <View style={{ gap: 2 }}>
      <Txt variant="subhead" accessibilityRole="header" style={{ fontFamily: fonts.bodyBold, minHeight: 44, paddingTop: 10 }}>
        {t('home.row.learnListen')}
      </Txt>
      <ErrorState error={error} onRetry={onRetry} />
    </View>
  );
}

function LearnListenTileView({ card, ctx, d }: { card: LearnListenCard; ctx: TileCtx; d: LearnListenData | undefined }) {
  switch (card.kind) {
    case 'learning':
      return card.tile ? <LearningTileView tile={card.tile} ctx={ctx} /> : <LearningDoneView ctx={ctx} />;
    case 'playlist':
      return <PlaylistTileView count={card.count} playlist={d?.playlist ?? { ok: false }} ctx={ctx} />;
    case 'podcasts':
      return <PodcastsTileView latest={card.latest} picture={card.latest ? (d?.pictures[card.latest.id] ?? null) : null} ctx={ctx} />;
    case 'recipes':
      return <RecipesTileView latest={card.latest} picture={card.latest ? (d?.pictures[card.latest.id] ?? null) : null} ctx={ctx} />;
    case 'photos':
      return <PhotosTileView latest={card.latest} url={card.latest?.coverPath ? (sizedPhotoUrl(d?.photoUrls[card.latest.coverPath], 'thumb') ?? null) : null} ctx={ctx} />;
  }
}

type CardOf<K extends LearnListenCard['kind']> = Extract<LearnListenCard, { kind: K }>;

/** The picture of a Learn & listen tile: 16:9, the designed background or the picture, and whatever the tile draws on it. */
function TileFrame({ ctx, bg, children }: { ctx: TileCtx; bg: string; children: ReactNode }) {
  return <View style={{ height: ctx.size.height ?? undefined, borderRadius: radii.xl, overflow: 'hidden', backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>{children}</View>;
}

function LearningTileView({ tile, ctx }: { tile: LearningTile; ctx: TileCtx }) {
  const t = useT();
  const router = useRouter();
  const tint = tile.tint ?? colors.navy;
  const level = t('learn.levelOf', { level: tile.levelNumber, n: tile.levelsTotal });
  const pct = Math.round(tile.progress * 100);
  const sub = `${tile.goalName} · ${level}`;
  const label = [t('home.ll.learning'), tile.goalName, tile.recommended ? t('learn.forYou') : null, `${level}: ${tile.levelName}`, t('home.rail.percentDone', { n: pct })].filter(Boolean).join('. ');
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
      <TileCaption title={t('home.ll.learning')} sub={sub} />
    </RailTile>
  );
}

/** Every goal is done: the old Learn shortcut still opened Gyan Path then, so the tile stays, says so, and opens the goals (from where another can be chosen). */
function LearningDoneView({ ctx }: { ctx: TileCtx }) {
  const t = useT();
  const router = useRouter();
  return (
    <RailTile ctx={ctx} label={[t('learn.gyanPath'), t('home.ll.learningDone')].join('. ')} hint={t('home.ll.learningDoneHint')} onPress={() => router.push('/gyan')}>
      <View style={{ height: ctx.size.height ?? undefined, borderRadius: radii.xl, backgroundColor: colors.navy, overflow: 'hidden', padding: space.md, justifyContent: 'space-between' }}>
        <Decor />
        <View />
        <View style={{ alignItems: 'flex-start' }}>
          <Icon name="checkmark-circle-outline" size={44} color={colors.white} />
        </View>
        <View style={{ height: 5, borderRadius: 3, backgroundColor: colors.white }} />
      </View>
      <TileCaption title={t('learn.gyanPath')} sub={t('home.ll.learningDone')} />
    </RailTile>
  );
}

function PlaylistTileView({ count, playlist, ctx }: { count: number | null; playlist: LearnListenData['playlist']; ctx: TileCtx }) {
  const t = useT();
  const router = useRouter();
  const player = usePlayer();
  const sub = count === null ? t('home.ll.playlistLine') : count === 0 ? t('home.ll.playlistEmpty') : count === 1 ? t('threeL.itemsOne') : t('threeL.items', { n: count });
  // Plays the whole of My playlist, from its first item that can play (not only what a tile could show), and opens it. An empty playlist,
  // or one that could not be read here, opens the playlist screen playing, which offers the most-liked stavans or reads the list itself.
  const play = () => {
    const queue = playlist.ok ? playlistQueue(playlist.value).map((item) => toQueueItem(t, item)) : [];
    if (queue.some((q) => q.playable)) {
      player.playQueue(queue);
      router.push('/listen/playlist');
    } else {
      router.push({ pathname: '/listen/playlist', params: { autoplay: '1' } });
    }
  };
  return (
    <RailTile ctx={ctx} label={[t('home.ll.playlist'), sub].join('. ')} hint={t('home.ll.playlistHint')} onPress={play}>
      <TileFrame ctx={ctx} bg={colors.purple}>
        <Decor />
        <Icon name="musical-notes-outline" size={44} color={colors.white} />
        <View style={{ position: 'absolute', right: 8, bottom: 8, width: 36, height: 36, borderRadius: 18, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
          <Icon name="play" size={18} color={colors.navy} />
        </View>
      </TileFrame>
      <TileCaption title={t('home.ll.playlist')} sub={sub} />
    </RailTile>
  );
}

/** A stable name for an uploaded picture, so a phone keeps it between reloads although the signed link changes every time (YouTube's thumbnails have a link that never changes). */
function pictureKey(item: MediaItem | null): string | undefined {
  const pic = item ? pictureOf(item) : null;
  return pic && 'path' in pic ? `media:${pic.path}` : undefined;
}

function PodcastsTileView({ latest, picture, ctx }: { latest: CardOf<'podcasts'>['latest']; picture: string | null; ctx: TileCtx }) {
  const t = useT();
  const router = useRouter();
  const sub = latest ? t('home.ll.latest', { title: latest.title }) : t('home.ll.podcastsLine');
  return (
    <RailTile ctx={ctx} label={[t('home.ll.podcasts'), sub, latest ? mediaSubtitle(t, latest) : null].filter(Boolean).join('. ')} hint={t('home.rail.openHint')} onPress={() => router.push({ pathname: '/media/[kind]', params: { kind: 'podcast' } })}>
      <TileFrame ctx={ctx} bg={colors.store}>
        <TilePicture
          uri={picture}
          cacheKey={pictureKey(latest)}
          fit="contain"
          what={`the picture of ${latest?.title ?? 'the podcasts'}`}
          fallback={
            <>
              <Decor />
              <Icon name={KIND_ICON.podcast} size={44} color={colors.white} />
            </>
          }
        />
      </TileFrame>
      <TileCaption title={t('home.ll.podcasts')} sub={sub} />
    </RailTile>
  );
}

function RecipesTileView({ latest, picture, ctx }: { latest: CardOf<'recipes'>['latest']; picture: string | null; ctx: TileCtx }) {
  const t = useT();
  const router = useRouter();
  const sub = latest ? t('home.ll.latest', { title: latest.title }) : t('home.ll.recipesLine');
  return (
    <RailTile ctx={ctx} label={[t('home.ll.recipes'), sub].join('. ')} hint={t('home.rail.openHint')} onPress={() => router.push({ pathname: '/media/[kind]', params: { kind: 'recipe', fullyJain: '1' } })}>
      <TileFrame ctx={ctx} bg={colors.greenTint}>
        <TilePicture uri={picture} cacheKey={pictureKey(latest)} what={`the photo of ${latest?.title ?? 'the recipes'}`} fallback={<Icon name={KIND_ICON.recipe} size={44} color={colors.green} />} />
      </TileFrame>
      <TileCaption title={t('home.ll.recipes')} sub={sub} />
    </RailTile>
  );
}

function PhotosTileView({ latest, url, ctx }: { latest: CardOf<'photos'>['latest']; url: string | null; ctx: TileCtx }) {
  const t = useT();
  const router = useRouter();
  const pal = paletteFor(latest?.albumId ?? 'photos');
  const sub = latest ? [latest.title, latest.date].filter(Boolean).join(' · ') : t('home.ll.photosLine');
  return (
    <RailTile ctx={ctx} label={[t('home.ll.photos'), sub].join('. ')} hint={t('home.ll.photosHint')} onPress={() => router.push({ pathname: '/events', params: { view: 'photos' } })}>
      <TileFrame ctx={ctx} bg={pal.tiles[0]}>
        <TilePicture
          uri={url}
          cacheKey={latest?.coverPath ? `photo:${latest.coverPath}:thumb` : undefined}
          what={`the cover of ${latest?.title ?? 'the latest album'}`}
          fallback={
            <>
              <Decor />
              <EventIcon name="photo" size={30} color={colors.white} />
            </>
          }
        />
      </TileFrame>
      <TileCaption title={t('home.ll.photos')} sub={sub} />
    </RailTile>
  );
}

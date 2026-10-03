import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import { Icon, type IconName } from '@/components/icon';
import { ErrorState, LoadingState } from '@/components/states';
import { StrokeIcon } from '@/components/stroke-icon';
import { Banner, Button, Card, Chevron, Row, Txt, VStack } from '@/components/ui';
import { listSpecialDays, nextTithiDates, type SpecialDay } from '@/lib/api/family';
import { listAlerts, loadFeedbackHome, loadHomeEvents, loadToday, type Alert, type FeedbackHome, type HomeEvents, type TodayInfo } from '@/lib/api/home';
import { reactivateAccount } from '@/lib/api/settings';
import { logError, report } from '@/lib/errors';
import { formatDay, formatTime, formatTimeOfDay, monthShortUpper, parseISODate, todayAt } from '@/lib/format';
import { TIME_TILE_PAD_X } from '@/lib/home-rails';
import { communityName } from '@/lib/learning';
import { lunchLines, nextOccurrence, tithiLabel } from '@/lib/rules';
import { readPref, writePref } from '@/lib/storage';
import { pointsLine } from '@/lib/survey-popup';
import { useLoad, type LoadState } from '@/lib/use-load';
import { useApp } from '@/providers/app';
import { useFeedback } from '@/providers/feedback';
import { useT } from '@/providers/settings';
import { colors, fonts, radii, space, touch } from '@/theme';

import { useConfirmPopup } from './confirm-popup';
import { splitAlerts } from './home-rules';
import { TodayDoors } from './today-doors';

/*
 * The pieces of Home that are not rows of tiles (owner, 2026-10-02; the order is set in
 * src/app/(app)/(tabs)/index.tsx): what needs you (the deactivated notice and urgent alerts above the first row;
 * the other alerts, today's lunch times and feedback requested under it, and the "Still coming?" pop-up),
 * Today at {center} (the first tile of the first row), and the guest sign-in card. The rows are in home-rails.tsx.
 */

/** A spinner in the size of a first-row tile (Today's height), so the rows below do not jump when its data arrives. */
export function TileLoading() {
  return (
    <Card hero style={{ flexGrow: 1, minHeight: 247, justifyContent: 'center' }}>
      <LoadingState />
    </Card>
  );
}

/**
 * Rounded in-card button that sizes to its label (prototype "align-self:
 * flex-start" pills). `size` "sm" (44) is for the compact strip;
 * `a11yLabel` names what it acts on when the label alone is not unique.
 */
export function PillButton({
  label,
  a11yLabel,
  onPress,
  tone,
  busy,
  disabled,
  fill,
  size = 'card',
}: {
  label: string;
  a11yLabel?: string;
  onPress: () => void;
  tone: 'purple' | 'brown' | 'green' | 'secondary' | 'plain';
  busy?: boolean;
  disabled?: boolean;
  fill?: boolean;
  size?: 'card' | 'sm';
}) {
  if (tone === 'plain') {
    return (
      <Pressable
        onPress={onPress}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={a11yLabel ?? label}
        style={({ pressed }) => ({ flex: fill ? 1 : undefined, minHeight: size === 'sm' ? touch.min : 46, borderRadius: radii.pill, borderWidth: 1, borderColor: colors.borderInput, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', paddingHorizontal: size === 'sm' ? space.md : space.lg, opacity: pressed ? 0.85 : 1 })}>
        <Txt variant="smallStrong" color="muted" center>
          {label}
        </Txt>
      </Pressable>
    );
  }
  return (
    <View style={fill ? { flex: 1 } : { alignSelf: 'flex-start' }}>
      <Button label={label} accessibilityLabel={a11yLabel} onPress={onPress} tone={tone} size={size} busy={busy} disabled={disabled} fill={!!fill} style={fill ? (size === 'sm' ? { paddingHorizontal: space.sm } : undefined) : { paddingHorizontal: 18 }} />
    </View>
  );
}

export function DeactivatedBanner() {
  const t = useT();
  const { member, center, refreshMember } = useApp();
  const { toast } = useFeedback();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!member || !center) return null;
  const reactivate = async () => {
    setBusy(true);
    setError(null);
    try {
      await reactivateAccount(center.id, member.person.id, member.userId);
      await refreshMember();
      toast(t('settings.reactivated'));
    } catch (err) {
      setError(report(err, 'reactivate your account').userMessage);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card tone="amber">
      <Row gap={space.md}>
        <View style={{ flex: 1 }}>
          <Txt variant="bodyStrong" color="brownDark" style={{ fontFamily: fonts.bodyBold }}>
            {t('home.deactivatedTitle')}
          </Txt>
          <Txt variant="caption" color="brownText" style={{ fontFamily: fonts.body }}>
            {t('home.deactivatedBody')}
          </Txt>
        </View>
        <Button label={t('settings.reactivate')} tone="green" size="sm" fill={false} onPress={reactivate} busy={busy} />
      </Row>
      {error ? <Banner tone="error" message={error} /> : null}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Today at {center}
// ---------------------------------------------------------------------------

/** One of Today's timings. Its side padding is TIME_TILE_PAD_X (4), not the 8 it was: the card is narrower beside My Jain Way and each time keeps the room for its words that the old card gave it. */
function TimeTile({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1, backgroundColor: colors.panel, borderRadius: radii.md, paddingVertical: 6, paddingHorizontal: TIME_TILE_PAD_X }}>
      <Txt variant="caption" color="muted" style={{ fontFamily: fonts.body }}>
        {label}
      </Txt>
      <Txt variant="bodyStrong">{value}</Txt>
    </View>
  );
}

const TODAY_HIDDEN_KEY = 'homeTodayHidden';

/** The day's tithi, timings and live darshan link. One load: Today and the My Jain Way tile beside it both read it. */
export function useTodayInfo(): LoadState<TodayInfo> {
  const { center } = useApp();
  return useLoad(() => (center ? loadToday(center) : Promise.reject(new Error('no center'))), [center?.id], "load today's timings");
}

/** Whether the member hid "Today at {center}" on this device (the one-line greeting stays in its place), and the switch. */
export function useTodayHidden(): [boolean, (hidden: boolean) => void] {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    let alive = true;
    readPref<boolean>(TODAY_HIDDEN_KEY, false).then((v) => {
      if (alive) setHidden(v);
    });
    return () => {
      alive = false;
    };
  }, []);
  const set = (v: boolean) => {
    setHidden(v);
    writePref(TODAY_HIDDEN_KEY, v).catch((err: unknown) => logError('remembering the Today card on this device', err));
  };
  return [hidden, set];
}

/** What stands in for Today at {center} while it is hidden: "Jai Jinendra, {family}" and a button to bring it back. */
export function TodayGreeting({ onShow }: { onShow: () => void }) {
  const t = useT();
  const { center, member } = useApp();
  const community = center?.short_name || center?.name || '';
  const family = member?.household?.display_name ?? null;
  return (
    <Row gap={space.sm}>
      <Txt variant="body" color="ink2" style={{ flex: 1 }}>
        {family ? (
          <>
            {`${t('home.greetingLead')} `}
            <Txt variant="bodyStrong" color="ink2">
              {family}
            </Txt>
          </>
        ) : (
          t('welcome.jaiJinendra')
        )}
      </Txt>
      <Pressable
        onPress={onShow}
        accessibilityRole="button"
        style={({ pressed }) => ({ minHeight: 40, borderRadius: radii.xl, borderWidth: 1, borderColor: colors.borderInput, backgroundColor: colors.card, paddingHorizontal: space.md, justifyContent: 'center', opacity: pressed ? 0.8 : 1 })}>
        <Txt variant="meta" color="navy" style={{ fontFamily: fonts.bodySemi }}>
          {t('home.showToday', { center: community })}
        </Txt>
      </Pressable>
    </Row>
  );
}

/**
 * "Today at {center}": the first tile of Home's first row. Greeting, date and tithi, timings, and the live
 * darshan and puja doors (prototype L50–69; the doors follow the access levels, today-doors.tsx). Its height
 * and content are what the card has always had; the row decides its width. The close button hides it (the
 * row then shows the greeting line instead).
 */
export function TodayTile({ state, onHide }: { state: LoadState<TodayInfo>; onHide: () => void }) {
  const t = useT();
  const { center, member } = useApp();
  const community = center?.short_name || center?.name || '';
  const family = member?.household?.display_name ?? null;
  if (state.data === undefined) return state.error ? <ErrorState error={state.error} onRetry={() => void state.reload()} /> : <TileLoading />;
  const { today, tithi, timings, darshan } = state.data;
  const tiles = [
    timings?.sunrise ? { label: t('home.sunrise'), value: formatTimeOfDay(timings.sunrise) } : null,
    timings?.navkarsi ? { label: t('home.navkarsi'), value: formatTimeOfDay(timings.navkarsi) } : null,
    timings?.chauvihar ? { label: t('home.chauvihar'), value: formatTimeOfDay(timings.chauvihar) } : null,
  ].filter((x): x is { label: string; value: string } => x !== null);
  const aarti = timings?.aarti ? formatTimeOfDay(timings.aarti) : null;

  return (
    <Card hero style={{ gap: space.sm, paddingVertical: space.md, flexGrow: 1 }}>
      <Row align="flex-start" gap={space.sm}>
        <View style={{ flex: 1 }}>
          <Txt variant="meta" color="muted">
            {family ? t('home.greetingFamily', { family }) : t('welcome.jaiJinendra')}
          </Txt>
          <Txt variant="cardTitle" accessibilityRole="header">
            {t('home.todayAt', { center: community })}
          </Txt>
          <Txt variant="meta" color="muted">
            {tithi ? `${formatDay(today)} · ${tithiLabel(tithi)}` : formatDay(today)}
          </Txt>
        </View>
        <Pressable
          onPress={onHide}
          accessibilityRole="button"
          accessibilityLabel={t('home.hideToday', { center: community })}
          hitSlop={4}
          style={({ pressed }) => ({ width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: colors.borderInput, backgroundColor: colors.ground, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}>
          <StrokeIcon name="close" size={16} color={colors.muted} strokeWidth={2} />
        </Pressable>
      </Row>
      {tiles.length ? (
        <Row gap={space.sm} align="stretch">
          {tiles.map((x) => (
            <TimeTile key={x.label} label={x.label} value={x.value} />
          ))}
        </Row>
      ) : (
        <Txt variant="small" color="muted">
          {t('home.noTimings')}
        </Txt>
      )}
      <TodayDoors hasStream={!!darshan} aarti={aarti} />
    </Card>
  );
}

// ---------------------------------------------------------------------------
// What needs you (alerts, feedback, lunch)
// ---------------------------------------------------------------------------

/** The alerts the community has up (RLS returns only those in their window): one load, shown in two places (AlertsStrip). `enabled` is false for guests and when the community switched alerts off. */
export function useHomeAlerts(enabled: boolean): LoadState<Alert[]> {
  const { center } = useApp();
  return useLoad(() => (enabled && center ? listAlerts(center.id) : Promise.resolve([])), [enabled, center?.id], 'load alerts');
}

/**
 * The alerts as banners. The urgent ones go above Home's first row, where they are seen first (and where a failure to read
 * the alerts says so, with Try again); the important and informational ones go under it with the other notices (feedback,
 * lunch times), so an alert that arrives late does not push Today down.
 */
export function AlertsStrip({ state, part }: { state: LoadState<Alert[]>; part: 'urgent' | 'other' }) {
  if (state.data === undefined) return state.error && part === 'urgent' ? <ErrorState error={state.error} onRetry={() => void state.reload()} /> : null;
  const alerts = splitAlerts(state.data)[part];
  if (alerts.length === 0) return null;
  return (
    <VStack gap={space.sm}>
      {alerts.map((a) => (
        <Banner key={a.id} tone={a.severity === 'urgent' ? 'error' : a.severity === 'important' ? 'warning' : 'info'} title={a.title} message={a.body} />
      ))}
    </VStack>
  );
}

/**
 * One load feeds the Home "Feedback requested" strip and the "How was <event>?"
 * pop-up. `enabled` is false for guests and when the community switched
 * surveys off: nothing is fetched then.
 */
export function useFeedbackHome(enabled: boolean): LoadState<FeedbackHome> {
  const { center, member } = useApp();
  return useLoad(
    () => (enabled && center && member ? loadFeedbackHome(center, member) : Promise.resolve({ requests: [], popup: null, today: '' })),
    [enabled, center?.id, member?.person.id, member?.isAdult],
    'load feedback requests',
  );
}

/** "FEEDBACK REQUESTED", compact: the most recent open survey the member has not answered, with a button to answer it (prototype L77–84). It stays until the survey closes. */
export function FeedbackStrip({ state }: { state: LoadState<FeedbackHome> }) {
  const t = useT();
  const router = useRouter();
  const { center } = useApp();
  if (state.data === undefined) return state.error ? <ErrorState error={state.error} onRetry={() => void state.reload()} /> : null;
  const first = state.data.requests[0];
  if (!first) return null;
  const { survey, eventName } = first;
  const title = eventName ? t('home.feedbackTitle', { event: eventName }) : survey.title;
  const earn = pointsLine(t, 'earn', survey.reward_points, communityName(center));
  return (
    <Card hero tone="outlinePurple" style={{ paddingVertical: space.md }}>
      <Row gap={space.md}>
        <View style={{ flex: 1, gap: 2 }}>
          <Txt variant="eyebrow" color="purple" style={{ fontFamily: fonts.bodySemi, letterSpacing: 0.48 }}>
            {t('home.feedbackRequested')}
          </Txt>
          <Txt variant="bodyStrong" numberOfLines={2}>
            {title}
          </Txt>
          {earn ? (
            <Txt variant="caption" color="purple" style={{ fontFamily: fonts.bodySemi }}>
              {earn}
            </Txt>
          ) : null}
        </View>
        <PillButton label={t('home.shareFeedback')} a11yLabel={`${t('home.shareFeedback')} · ${title}`} tone="purple" size="sm" onPress={() => router.push({ pathname: '/survey/[id]', params: { id: survey.id } })} />
      </Row>
    </Card>
  );
}

const NO_EVENTS = (timeZone: string): HomeEvents => ({ confirm: null, lunch: null, timeZone });

/** One load feeds the "Still coming?" pop-up and today's lunch times. `enabled` is false when neither may show. */
export function useHomeEvents(enabled = true): LoadState<HomeEvents> {
  const { center, member } = useApp();
  return useLoad(
    () => (!enabled ? Promise.resolve(NO_EVENTS(center?.time_zone ?? 'UTC')) : center ? loadHomeEvents(center, member) : Promise.reject(new Error('no center'))),
    [enabled, center?.id, member?.household?.id],
    'load upcoming events',
  );
}

/**
 * Opens the in-app "Still coming?" pop-up (once; "Remind me later" is respected) 24 hours before an event the
 * family has RSVPd to but not confirmed. It used to open from the Up next card; the same event's tile in the
 * Events row carries a Confirm chip, so the question is never lost when the pop-up is put off.
 */
export function ConfirmPrompt({ events }: { events: LoadState<HomeEvents> }) {
  const { showConfirm } = useConfirmPopup();
  const eventId = events.data?.confirm?.event.id ?? null;
  useEffect(() => {
    if (!eventId) return;
    showConfirm(eventId, { auto: true }).catch((err: unknown) => logError('showing the RSVP confirm pop-up', err));
  }, [eventId, showConfirm]);
  return null;
}

function IconTile({ icon, bg, fg }: { icon: IconName; bg: string; fg: string }) {
  return (
    <View style={{ width: 44, height: 48, borderRadius: radii.lg, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }} aria-hidden>
      <Icon name={icon} size={22} color={fg} />
    </View>
  );
}

/** Today's lunch times after check-in; opens the tickets. */
function LunchRow({ lunch, tz }: { lunch: NonNullable<HomeEvents['lunch']>; tz: string }) {
  const t = useT();
  const router = useRouter();
  const lead = lunch.checkedInAt ? t('home.lunchEyebrowCheckedIn', { event: lunch.event.name, time: formatTime(lunch.checkedInAt, tz) }) : t('home.lunchEyebrow', { event: lunch.event.name });
  const lines = lunch.card.state === 'ready' ? lunchLines(lunch.card) : [t('lunch.assigning')];
  const note = lunch.card.state === 'ready' ? (lunch.card.nowServing ? t('home.lunchReminderServing', { slot: lunch.card.nowServing }) : t('home.lunchReminder')) : null;
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/event/[id]/tickets', params: { id: lunch.event.id } })}
      accessibilityRole="button"
      accessibilityLabel={[t('home.lunchTitle'), lead, ...lines, note].filter(Boolean).join('. ')}
      style={({ pressed }) => ({ minHeight: touch.min, opacity: pressed ? 0.8 : 1 })}>
      <Row gap={space.md} align="flex-start">
        <IconTile icon="restaurant-outline" bg={colors.greenTint} fg={colors.green} />
        <View style={{ flex: 1, gap: 2 }}>
          <Txt variant="caption" color="green" style={{ fontFamily: fonts.bodySemi }}>
            {lead}
          </Txt>
          <Txt variant="bodyStrong">{t('home.lunchTitle')}</Txt>
          {lines.map((line) => (
            <Txt key={line} variant="meta" color="ink2">
              {line}
            </Txt>
          ))}
          {note ? (
            <Txt variant="fine" color="muted">
              {note}
            </Txt>
          ) : null}
        </View>
        <View style={{ alignSelf: 'center' }}>
          <Chevron />
        </View>
      </Row>
    </Pressable>
  );
}

/**
 * What the family has to act on today, under the first row: today's lunch times (on the day of an event they
 * RSVPd to with lunch, once someone has checked in; it was a row of the Up next card, and it is time-sensitive).
 * A failed load of the family's events shows here with Try again whether or not there is lunch to show, because
 * the "Still coming?" pop-up depends on the same load. `lunch` is false when the community switched lunch off.
 */
export function EventActionsStrip({ events, lunch }: { events: LoadState<HomeEvents>; lunch: boolean }) {
  if (events.data === undefined) return events.error ? <ErrorState error={events.error} onRetry={() => void events.reload()} /> : null;
  const refreshError = events.error ? <ErrorState error={events.error} onRetry={() => void events.reload()} /> : null;
  if (!lunch || !events.data.lunch) return refreshError;
  return (
    <>
      {refreshError}
      <Card hero>
        <LunchRow lunch={events.data.lunch} tz={events.data.timeZone} />
      </Card>
    </>
  );
}

// ---------------------------------------------------------------------------
// Special days on Home (the Plan a special day row)
// ---------------------------------------------------------------------------

const DISMISSED_KEY = 'specialDaysNotThisYear';

export type HomeSpecialDaysData = {
  /** Every saved day with the date it next falls on (null while a tithi's date is not published). */
  rows: { day: SpecialDay; next: string | null }[];
  /** "Not this year" choices made earlier on this device (specialDayDismissKey values); they still hide that year's day. */
  hidden: string[];
  /** The community's today. */
  today: string;
};

/** The last answer for each household, so that Home shows the row at once when it is mounted again and then checks it (stale while revalidate). */
const lastSpecialDays = new Map<string, HomeSpecialDaysData>();

/**
 * The family's special days with the date each next falls on, for the Plan a special day row. `enabled` is
 * false for guests and for someone without a household: nothing is fetched then. The load starts when Home does
 * (not when the row nears the screen): most of the page is below it, and a row that appears late moves everything
 * under it. The last answer is kept and shown while the new one loads.
 */
export function useHomeSpecialDays(enabled: boolean): LoadState<HomeSpecialDaysData> {
  const { center, member } = useApp();
  const key = center && member?.household ? `${center.id}:${member.household.id}` : null;
  const state = useLoad(
    async (): Promise<HomeSpecialDaysData> => {
      if (!enabled || !center || !member?.household) return { rows: [], hidden: [], today: '' };
      const today = todayAt(center.time_zone);
      const [all, hidden] = await Promise.all([listSpecialDays(member.household.id), readPref<string[]>(DISMISSED_KEY, [])]);
      const tithiDates = await nextTithiDates(
        center.id,
        today,
        all.filter((d) => d.show_on_home && !d.calendar_date && d.tithi && d.tithi_month).map((d) => ({ id: d.id, tithi: d.tithi as string, month: d.tithi_month as string })),
      );
      const rows = all.map((day) => ({ day, next: day.calendar_date ? nextOccurrence(day.calendar_date, today) : (tithiDates[day.id] ?? null) }));
      const answer = { rows, hidden: Array.isArray(hidden) ? hidden : [], today };
      lastSpecialDays.set(`${center.id}:${member.household.id}`, answer);
      return answer;
    },
    [enabled, center?.id, member?.household?.id],
    'load special days',
  );
  const kept = enabled && key ? lastSpecialDays.get(key) : undefined;
  return state.data === undefined && kept ? { ...state, data: kept } : state;
}

/** Square tile with the month and day of a special day (44 × 48). */
export function DateTile({ iso, bg, fg }: { iso: string | null; bg: string; fg: string }) {
  return (
    <View style={{ width: 44, height: 48, borderRadius: radii.lg, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }} aria-hidden>
      <Txt variant="fine" style={{ color: fg }}>
        {iso ? monthShortUpper(iso) : ''}
      </Txt>
      <Txt variant="section" style={{ color: fg, lineHeight: 20, fontFamily: fonts.bodyBold }}>
        {iso ? String(parseISODate(iso)?.d ?? '') : ''}
      </Txt>
    </View>
  );
}

export function GuestSignInCard() {
  const t = useT();
  const { setGuest } = useApp();
  return (
    <Card tone="panel">
      <Txt variant="cardTitle">{t('home.guestTitle')}</Txt>
      <Txt variant="small" color="ink2">
        {t('home.guestBody')}
      </Txt>
      <Button label={t('common.signIn')} onPress={() => setGuest(false)} size="md" />
    </Card>
  );
}

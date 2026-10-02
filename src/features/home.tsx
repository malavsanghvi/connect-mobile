import { useRouter, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { Icon, type IconName } from '@/components/icon';
import { ErrorState, LoadingState } from '@/components/states';
import { StrokeIcon } from '@/components/stroke-icon';
import { Banner, Button, Card, Chevron, Divider, ProgressBar, Row, Txt, VStack } from '@/components/ui';
import { canPlanLabh, listDisplayName, occasionOf, whenText } from '@/features/special-days';
import type { Translate } from '@/i18n';
import { confirmAttendance, listAttendees } from '@/lib/api/events';
import { listSpecialDays, nextTithiDates, type SpecialDay } from '@/lib/api/family';
import { listAlerts, loadFeedbackHome, loadHomeEvents, loadToday, type FeedbackHome, type HomeEvents } from '@/lib/api/home';
import { loadJainWayToday } from '@/lib/api/jainway';
import type { FamilyMember } from '@/lib/api/member';
import { reactivateAccount } from '@/lib/api/settings';
import { logError, report } from '@/lib/errors';
import { daysBetween, formatDay, formatTime, formatTimeOfDay, monthShortUpper, parseISODate, todayAt, zonedParts } from '@/lib/format';
import { communityName } from '@/lib/learning';
import { lunchLines, nextOccurrence, streakDisplay, streakLabel, tithiLabel } from '@/lib/rules';
import { readPref, writePref } from '@/lib/storage';
import { pointsLine } from '@/lib/survey-popup';
import { useLoad, type LoadState } from '@/lib/use-load';
import { useApp } from '@/providers/app';
import { useModule } from '@/providers/modules';
import { useDataVersion } from '@/providers/data-version';
import { useFeedback } from '@/providers/feedback';
import { useT } from '@/providers/settings';
import { colors, fonts, radii, space, touch } from '@/theme';

import { useConfirmPopup } from './confirm-popup';
import { EventIcon } from './event-icons';
import { pronounFor, relativeDay, shortWhen, specialDayDismissKey, specialDayLead, turnsAge } from './event-rules';
import { peopleLabel } from './events';
import { nextSpecialDay, reminderSpecialDay, upNextItems, type DayNext, type UpNextKind } from './home-rules';
import { PujaEntry } from './puja/puja-entry';

/*
 * Home cards (layout B, owner 2026-10-02; the order is set in
 * src/app/(app)/(tabs)/index.tsx): deactivated → Today → shortcuts grid →
 * alerts → Up next (confirm, lunch, next event, special day) → Giving
 * (rotating, home-giving.tsx) → Plan a special day → My Jain Way → Feedback →
 * "My {center}" guide → guest sign-in.
 */

function SectionLoading() {
  return (
    <Card hero>
      <LoadingState />
    </Card>
  );
}

/** Eyebrow row with a right-hand note (feedback, special day, giving cards). */
export function EyebrowRow({ left, right, color }: { left: string; right?: string | null; color: 'purple' | 'brown' | 'navy' }) {
  return (
    <Row style={{ justifyContent: 'space-between', flexWrap: 'wrap' }} gap={space.sm}>
      <Txt variant="eyebrow" color={color} style={color === 'navy' ? { fontFamily: fonts.bodySemi, letterSpacing: 0.48 } : null}>
        {left}
      </Txt>
      {right ? (
        <Txt variant="caption" color="muted" style={{ fontFamily: fonts.body }}>
          {right}
        </Txt>
      ) : null}
    </Row>
  );
}

/**
 * Rounded in-card button that sizes to its label (prototype "align-self:
 * flex-start" pills). `size` "sm" (44) is for the compact Up next rows;
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

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1, backgroundColor: colors.panel, borderRadius: radii.md, paddingVertical: 6, paddingHorizontal: space.sm }}>
      <Txt variant="caption" color="muted" style={{ fontFamily: fonts.body }}>
        {label}
      </Txt>
      <Txt variant="bodyStrong">{value}</Txt>
    </View>
  );
}

const TODAY_HIDDEN_KEY = 'homeTodayHidden';

/** "Today at {center}", compact: greeting, date and tithi, timings and the live darshan link (prototype L50–69). */
export function TodayCard() {
  const t = useT();
  const router = useRouter();
  const { center, member } = useApp();
  const [collapsed, setCollapsed] = useState(false);
  const state = useLoad(() => (center ? loadToday(center) : Promise.reject(new Error('no center'))), [center?.id], "load today's timings");
  // The darshan button opens My Jain Way › 3L › Look (content module).
  const libraryOn = useModule('content');
  const community = center?.short_name || center?.name || '';
  const family = member?.household?.display_name ?? null;

  useEffect(() => {
    let alive = true;
    readPref<boolean>(TODAY_HIDDEN_KEY, false).then((v) => {
      if (alive) setCollapsed(v);
    });
    return () => {
      alive = false;
    };
  }, []);

  const setHidden = (v: boolean) => {
    setCollapsed(v);
    writePref(TODAY_HIDDEN_KEY, v).catch((err: unknown) => logError('remembering the Today card on this device', err));
  };

  if (collapsed) {
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
          onPress={() => setHidden(false)}
          accessibilityRole="button"
          style={({ pressed }) => ({ minHeight: 40, borderRadius: radii.xl, borderWidth: 1, borderColor: colors.borderInput, backgroundColor: colors.card, paddingHorizontal: space.md, justifyContent: 'center', opacity: pressed ? 0.8 : 1 })}>
          <Txt variant="meta" color="navy" style={{ fontFamily: fonts.bodySemi }}>
            {t('home.showToday', { center: community })}
          </Txt>
        </Pressable>
      </Row>
    );
  }
  if (state.data === undefined) return state.error ? <ErrorState error={state.error} onRetry={() => void state.reload()} /> : <SectionLoading />;
  const { today, tithi, timings, darshan } = state.data;
  const tiles = [
    timings?.sunrise ? { label: t('home.sunrise'), value: formatTimeOfDay(timings.sunrise) } : null,
    timings?.navkarsi ? { label: t('home.navkarsi'), value: formatTimeOfDay(timings.navkarsi) } : null,
    timings?.chauvihar ? { label: t('home.chauvihar'), value: formatTimeOfDay(timings.chauvihar) } : null,
  ].filter((x): x is { label: string; value: string } => x !== null);
  const aarti = timings?.aarti ? formatTimeOfDay(timings.aarti) : null;

  return (
    <Card hero style={{ gap: space.sm, paddingVertical: space.md }}>
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
          onPress={() => setHidden(true)}
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
            <Tile key={x.label} label={x.label} value={x.value} />
          ))}
        </Row>
      ) : (
        <Txt variant="small" color="muted">
          {t('home.noTimings')}
        </Txt>
      )}
      {(darshan || aarti) && libraryOn ? (
        <Pressable
          onPress={() => router.push({ pathname: '/jain-way', params: { tab: 'three_l', section: 'look' } })}
          accessibilityRole="button"
          style={({ pressed }) => ({ minHeight: touch.min, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.borderInput, backgroundColor: colors.ground, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm, paddingHorizontal: space.md, opacity: pressed ? 0.8 : 1 })}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.live }} />
          <Txt variant="small" color="navy" style={{ fontFamily: fonts.bodyMedium }}>
            {aarti ? t('home.watchDarshanAarti', { time: aarti }) : t('home.watchDarshan')}
          </Txt>
        </Pressable>
      ) : null}
      <PujaEntry />
    </Card>
  );
}

export function AlertsSection() {
  const { center } = useApp();
  const state = useLoad(() => (center ? listAlerts(center.id) : Promise.resolve([])), [center?.id], 'load alerts');
  if (state.data === undefined) return state.error ? <ErrorState error={state.error} onRetry={() => void state.reload()} /> : null;
  if (state.data.length === 0) return null;
  return (
    <VStack gap={space.sm}>
      {state.data.map((a) => (
        <Banner key={a.id} tone={a.severity === 'urgent' ? 'error' : a.severity === 'important' ? 'warning' : 'info'} title={a.title} message={a.body} />
      ))}
    </VStack>
  );
}

export function JainWayCard() {
  const t = useT();
  const router = useRouter();
  const { center, member } = useApp();
  const state = useLoad(() => (center && member ? loadJainWayToday(center, member.person.id) : Promise.reject(new Error('not signed in'))), [center?.id, member?.person.id], 'load My Jain Way');
  if (state.data === undefined) return state.error ? <ErrorState error={state.error} onRetry={() => void state.reload()} /> : <SectionLoading />;
  const d = state.data;
  const n = d.selected.length;
  const done = d.doneIds.length;
  const streak = streakDisplay(d.streak, d.today);
  const next = d.selected.find((p) => !d.doneIds.includes(p.id));
  const community = center?.short_name || center?.name || '';
  return (
    <Card hero onPress={() => router.push('/jain-way')} accessibilityLabel={t('home.myWay')} style={{ gap: 10 }}>
      <Row style={{ justifyContent: 'space-between' }} align="baseline">
        <Txt variant="section">{t('home.myWay')}</Txt>
        <Txt variant="meta" color="green" style={{ fontFamily: fonts.bodySemi }}>
          {t('home.doneOf', { done, n })}
        </Txt>
      </Row>
      <ProgressBar value={n ? done / n : 0} track={colors.divider} label={t('home.doneOf', { done, n })} />
      <Row gap={space.xs}>
        <EventIcon name="flame" size={16} color={colors.flame2} />
        <Txt variant="meta" color="brown" style={{ fontFamily: fonts.bodySemi, flex: 1 }}>
          {`${streakLabel(streak.days)} · ${t('home.centerPoints', { points: d.pointsTotal.toLocaleString('en-US'), center: community })}`}
        </Txt>
      </Row>
      <Txt variant="meta" color="muted">
        {n === 0 ? t('home.choosePractices') : next ? t('home.nextPractice', { name: next.name }) : t('home.allDone')}
      </Txt>
    </Card>
  );
}

/**
 * One load feeds the Home "Feedback requested" card and the "How was <event>?"
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

/** "FEEDBACK REQUESTED" card: the most recent open survey the member has not answered (prototype L77–84). It stays until the survey closes. */
export function FeedbackCard({ state }: { state: LoadState<FeedbackHome> }) {
  const t = useT();
  const router = useRouter();
  const { center } = useApp();
  if (state.data === undefined) return state.error ? <ErrorState error={state.error} onRetry={() => void state.reload()} /> : null;
  const first = state.data.requests[0];
  if (!first) return null;
  const { survey, eventName } = first;
  const earn = pointsLine(t, 'earn', survey.reward_points, communityName(center));
  return (
    <Card hero tone="outlinePurple">
      <EyebrowRow left={t('home.feedbackRequested')} right={t('home.feedbackMeta')} color="purple" />
      <Txt variant="headline">{eventName ? t('home.feedbackTitle', { event: eventName }) : survey.title}</Txt>
      <Txt variant="meta" color="muted">
        {survey.description?.trim() || t('home.feedbackBody')}
      </Txt>
      {earn ? (
        <Txt variant="meta" color="purple" style={{ fontFamily: fonts.bodySemi }}>
          {earn}
        </Txt>
      ) : null}
      <PillButton label={t('home.shareFeedback')} tone="purple" onPress={() => router.push({ pathname: '/survey/[id]', params: { id: survey.id } })} />
    </Card>
  );
}

const NO_EVENTS = (timeZone: string): HomeEvents => ({ next: null, nextRsvp: null, nextCount: 0, confirm: null, lunch: null, timeZone });

/** One load feeds every event row of "Up next" (confirm, lunch, next event). `enabled` is false when none of them may show. */
export function useHomeEvents(enabled = true): LoadState<HomeEvents> {
  const { center, member } = useApp();
  return useLoad(
    () => (!enabled ? Promise.resolve(NO_EVENTS(center?.time_zone ?? 'UTC')) : center ? loadHomeEvents(center, member) : Promise.reject(new Error('no center'))),
    [enabled, center?.id, member?.household?.id],
    'load upcoming events',
  );
}

// ---------------------------------------------------------------------------
// Special days on Home ("Up next" reminder + "Plan a special day")
// ---------------------------------------------------------------------------

const DISMISSED_KEY = 'specialDaysNotThisYear';

export type HomeSpecialDaysData = {
  /** Every saved day with the date it next falls on (null while a tithi's date is not published). */
  rows: DayNext<SpecialDay>[];
  /** "Not this year" choices remembered on this device (specialDayDismissKey values). */
  hidden: string[];
  /** The community's today. */
  today: string;
  /** How many days the family has saved (the Plan card offers "Add a special day" at 0). */
  saved: number;
};

export type HomeSpecialDays = {
  state: LoadState<HomeSpecialDaysData>;
  /** Remembered "Not this year" choices plus the ones made since the load. */
  hidden: string[];
  /** "Not this year" for one occurrence: hides it on Home on this device until next year. */
  hide: (key: string, name: string) => void;
};

/** One load feeds the special-day row of "Up next" and the "Plan a special day" card. `enabled` is false for guests and when the card is switched off. */
export function useHomeSpecialDays(enabled: boolean): HomeSpecialDays {
  const t = useT();
  const { center, member } = useApp();
  const { toast } = useFeedback();
  const [justHidden, setJustHidden] = useState<string[]>([]);
  const state = useLoad(
    async (): Promise<HomeSpecialDaysData> => {
      if (!enabled || !center || !member?.household) return { rows: [], hidden: [], today: '', saved: 0 };
      const today = todayAt(center.time_zone);
      const [all, hidden] = await Promise.all([listSpecialDays(member.household.id), readPref<string[]>(DISMISSED_KEY, [])]);
      const tithiDates = await nextTithiDates(
        center.id,
        today,
        all.filter((d) => d.show_on_home && !d.calendar_date && d.tithi && d.tithi_month).map((d) => ({ id: d.id, tithi: d.tithi as string, month: d.tithi_month as string })),
      );
      const rows = all.map((day) => ({ day, next: day.calendar_date ? nextOccurrence(day.calendar_date, today) : (tithiDates[day.id] ?? null) }));
      return { rows, hidden: Array.isArray(hidden) ? hidden : [], today, saved: all.length };
    },
    [enabled, center?.id, member?.household?.id],
    'load special days',
  );
  const hidden = [...(state.data?.hidden ?? []), ...justHidden];
  const hide = (key: string, name: string) => {
    setJustHidden((prev) => (prev.includes(key) ? prev : [...prev, key]));
    readPref<string[]>(DISMISSED_KEY, [])
      .then((prev) => writePref(DISMISSED_KEY, [...new Set([...(Array.isArray(prev) ? prev : []), key])]))
      .then(() => toast(t('home.notThisYearToast', { name }), 'info'))
      .catch((err: unknown) => {
        // Not saved: show the day again, so Home never pretends it was hidden.
        setJustHidden((prev) => prev.filter((k) => k !== key));
        toast(report(err, 'hide this special day').userMessage, 'error');
      });
  };
  return { state, hidden, hide };
}

type DayWords = { title: string; lead: string; body: string };

/** "Anya turns 10", "In 2 weeks · special day" and the labh line for a special day on `next`. */
function describeSpecialDay(t: Translate, day: SpecialDay, next: string, today: string, members: FamilyMember[]): DayWords {
  const lead = specialDayLead(daysBetween(today, next));
  const person = day.person_id ? (members.find((m) => m.person.id === day.person_id)?.person ?? null) : null;
  const age = day.kind === 'birthday' && person ? turnsAge(person.date_of_birth, next) : null;
  const pronoun = pronounFor(person?.gender);
  const pronounWord = pronoun === 'her' ? t('home.pronounHer') : pronoun === 'his' ? t('home.pronounHis') : t('home.pronounTheir');
  const leadText =
    lead.kind === 'today'
      ? t('home.specialLeadToday')
      : lead.kind === 'tomorrow'
        ? t('home.specialLeadTomorrow')
        : lead.kind === 'weeks'
          ? lead.n === 1
            ? t('home.specialLeadWeek')
            : t('home.specialLeadWeeks', { n: lead.n })
          : t('home.specialLeadDays', { n: lead.n });
  return {
    title: person && age != null ? t('home.turns', { name: person.preferred_name || person.first_name, age }) : listDisplayName(t, day, members),
    lead: leadText,
    body: day.kind === 'birthday' && person ? t('home.specialBirthdayBody', { pronoun: pronounWord }) : t('home.specialBody'),
  };
}

// ---------------------------------------------------------------------------
// Up next
// ---------------------------------------------------------------------------

/** Square tile on the left of an "Up next" row: the month and day, or an icon. */
function DateTile({ iso, bg, fg }: { iso: string | null; bg: string; fg: string }) {
  return (
    <View style={{ width: 44, height: 48, borderRadius: radii.lg, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Txt variant="fine" style={{ color: fg }}>
        {iso ? monthShortUpper(iso) : ''}
      </Txt>
      <Txt variant="section" style={{ color: fg, lineHeight: 20, fontFamily: fonts.bodyBold }}>
        {iso ? String(parseISODate(iso)?.d ?? '') : ''}
      </Txt>
    </View>
  );
}

function IconTile({ icon, bg, fg }: { icon: IconName; bg: string; fg: string }) {
  return (
    <View style={{ width: 44, height: 48, borderRadius: radii.lg, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Icon name={icon} size={22} color={fg} />
    </View>
  );
}

/** Small label over an "Up next" row's title ("Please confirm", "Today · Paryushan"). */
function RowLead({ children, color }: { children: string; color: 'navy' | 'green' | 'brown' }) {
  return (
    <Txt variant="caption" color={color} style={{ fontFamily: fonts.bodySemi }}>
      {children}
    </Txt>
  );
}

/** "Please confirm": still coming? Yes / Change or cancel. Also opens the in-app pop-up once (auto, respecting "Remind me later"). */
function ConfirmRow({ confirm, tz }: { confirm: NonNullable<HomeEvents['confirm']>; tz: string }) {
  const t = useT();
  const router = useRouter();
  const { toast } = useFeedback();
  const { invalidate } = useDataVersion();
  const { showConfirm } = useConfirmPopup();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const eventId = confirm.event.id;

  useEffect(() => {
    showConfirm(eventId, { auto: true }).catch((err: unknown) => logError('showing the RSVP confirm pop-up', err));
  }, [eventId, showConfirm]);

  const eventIso = confirm.event.starts_at ? zonedParts(new Date(confirm.event.starts_at), tz).iso : null;
  const rel = relativeDay(eventIso, todayAt(tz));
  const title =
    rel === 'tomorrow'
      ? t('home.stillComingTomorrow', { event: confirm.event.name })
      : rel === 'today'
        ? t('home.stillComingToday', { event: confirm.event.name })
        : t('home.stillComing', { event: confirm.event.name, when: shortWhen(confirm.event.starts_at, tz) });

  const confirmYes = async () => {
    setBusy(true);
    setError(null);
    try {
      const attendees = (await listAttendees(confirm.rsvp.id)).filter((a) => a.status !== 'cancelled');
      await confirmAttendance(confirm.rsvp.id, attendees.map((a) => a.id), []);
      invalidate();
      toast(t('notif.confirmedToast', { people: peopleLabel(t, attendees.length) }));
    } catch (err) {
      setError(report(err, 'confirm your attendance').userMessage);
    } finally {
      setBusy(false);
    }
  };

  return (
    <VStack gap={space.sm}>
      <Row gap={space.md} align="flex-start">
        <IconTile icon="checkmark-done-outline" bg={colors.navyTint} fg={colors.navy} />
        <View style={{ flex: 1, gap: 2 }}>
          <RowLead color="navy">{t('home.pleaseConfirm')}</RowLead>
          <Txt variant="bodyStrong">{title}</Txt>
          <Txt variant="meta" color="muted">
            {t('home.confirmPeople', { people: peopleLabel(t, confirm.count) })}
          </Txt>
        </View>
      </Row>
      {error ? <Banner tone="error" message={error} action={{ label: t('common.retry'), onPress: () => void confirmYes() }} /> : null}
      <Row gap={space.sm}>
        <View style={{ flex: 1 }}>
          <Button label={t('events.yesComing')} accessibilityLabel={`${t('events.yesComing')} · ${confirm.event.name}`} tone="green" size="sm" onPress={confirmYes} busy={busy} style={{ paddingHorizontal: space.sm }} />
        </View>
        <View style={{ flex: 1 }}>
          <Button
            label={t('events.changeOrCancel')}
            accessibilityLabel={`${t('events.changeOrCancel')} · ${confirm.event.name}`}
            tone="secondary"
            size="sm"
            onPress={() => router.push({ pathname: '/event/[id]/confirm', params: { id: confirm.event.id } })}
            style={{ paddingHorizontal: space.sm }}
          />
        </View>
      </Row>
    </VStack>
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
          <RowLead color="green">{lead}</RowLead>
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

/** The next event: date tile, name, RSVP status, and an RSVP button when the family has not replied. */
function NextEventItem({ events }: { events: HomeEvents }) {
  const t = useT();
  const router = useRouter();
  const { member } = useApp();
  const { next, nextRsvp, nextCount, timeZone } = events;
  if (!next) return null;
  const when = shortWhen(next.starts_at, timeZone);
  const hasActiveRsvp = !!nextRsvp && nextRsvp.status !== 'cancelled';
  const status = !nextRsvp
    ? t('home.rsvpOpen', { when })
    : nextRsvp.status === 'cancelled'
      ? t('home.youCancelled')
      : nextRsvp.status === 'confirmed'
        ? t('home.nConfirmed', { n: nextCount, when })
        : t('home.nAttending', { n: nextCount, when });
  const iso = next.starts_at ? zonedParts(new Date(next.starts_at), timeZone).iso : null;
  const open = () => router.push(hasActiveRsvp ? { pathname: '/event/[id]/tickets', params: { id: next.id } } : { pathname: '/event/[id]', params: { id: next.id } });
  const needsRsvp = !hasActiveRsvp && member?.isAdult;
  return (
    <Row gap={space.md}>
      <Pressable onPress={open} accessibilityRole="button" accessibilityLabel={`${next.name}. ${status}`} style={({ pressed }) => ({ flex: 1, minHeight: touch.min, opacity: pressed ? 0.8 : 1 })}>
        <Row gap={space.md}>
          <DateTile iso={iso} bg={colors.navy} fg={colors.white} />
          <View style={{ flex: 1, gap: 2 }}>
            <Txt variant="bodyStrong">{next.name}</Txt>
            <Txt variant="meta" color="muted">
              {status}
            </Txt>
          </View>
          {needsRsvp ? null : <Chevron />}
        </Row>
      </Pressable>
      {needsRsvp ? (
        <Pressable
          onPress={open}
          accessibilityRole="button"
          accessibilityLabel={`${t('events.rsvp')} · ${next.name}`}
          style={({ pressed }) => ({ minHeight: touch.min, borderRadius: radii.pill, borderWidth: 1, borderColor: colors.navy, backgroundColor: colors.card, paddingHorizontal: 14, justifyContent: 'center', opacity: pressed ? 0.8 : 1 })}>
          <Txt variant="smallStrong" color="navy">
            {t('events.rsvp')}
          </Txt>
        </Pressable>
      ) : null}
    </Row>
  );
}

/** A special day whose reminder has started: "Choose a labh" (or "See special days") and "Not this year". */
function SpecialDayRow({ hit, today, days }: { hit: { day: SpecialDay; next: string }; today: string; days: HomeSpecialDays }) {
  const t = useT();
  const router = useRouter();
  const { member } = useApp();
  // A labh is a pledge: adults only, and only while Pledges & donations is on.
  const givingOn = useModule('giving');
  if (!member) return null;
  const words = describeSpecialDay(t, hit.day, hit.next, today, member.members);
  const labh = canPlanLabh({ givingOn, isAdult: member.isAdult, occasion: occasionOf(hit.day), labhPromptEnabled: hit.day.labh_prompt_enabled });
  return (
    <VStack gap={space.sm}>
      <Row gap={space.md} align="flex-start">
        <DateTile iso={hit.next} bg={colors.brownTint} fg={colors.brown} />
        <View style={{ flex: 1, gap: 2 }}>
          <RowLead color="brown">{words.lead}</RowLead>
          <Txt variant="bodyStrong">{words.title}</Txt>
          <Txt variant="meta" color="muted">
            {formatDay(hit.next)}
          </Txt>
        </View>
      </Row>
      <Row gap={space.sm}>
        {labh ? (
          <PillButton label={t('home.chooseLabh')} a11yLabel={t('home.planLabhA11y', { name: words.title })} tone="brown" size="sm" fill onPress={() => router.push(`/labh/${encodeURIComponent(hit.day.id)}` as Href)} />
        ) : (
          <PillButton label={t('home.planDay')} tone="brown" size="sm" fill onPress={() => router.push('/special-days')} />
        )}
        <PillButton label={t('home.notThisYear')} a11yLabel={`${t('home.notThisYear')} · ${words.title}`} tone="plain" size="sm" fill onPress={() => days.hide(specialDayDismissKey(hit.day.id, hit.next), words.title)} />
      </Row>
    </VStack>
  );
}

/**
 * "Up next": what is coming for this member in one card — the RSVP waiting
 * to be confirmed, today's lunch times, the next event and a special day
 * whose reminder has started — one compact row each with its action
 * (home-rules upNextItems). `show` carries the community's modules and the
 * adults-only rules. Hidden when there is nothing to show.
 */
export function UpNextCard({ events, days, show }: { events: LoadState<HomeEvents>; days: HomeSpecialDays; show: Record<UpNextKind, boolean> }) {
  const t = useT();
  const eventsShown = show.confirm || show.lunch || show.nextEvent;
  const ev = eventsShown ? events.data : undefined;
  const dd = show.specialDay ? days.state.data : undefined;
  const special = dd ? reminderSpecialDay(dd.rows, dd.today, days.hidden) : null;
  const items = upNextItems({
    confirmEventId: ev?.confirm?.event.id ?? null,
    lunchEventId: ev?.lunch?.event.id ?? null,
    nextEventId: ev?.next?.id ?? null,
    specialDayId: special?.day.id ?? null,
    show,
  });
  // A special-days failure is shown once, on the Plan a special day card.
  const eventsError = eventsShown ? events.error : null;
  const loading = (eventsShown && events.data === undefined && !events.error) || (show.specialDay && days.state.data === undefined && !days.state.error);
  if (items.length === 0 && !eventsError && !loading) return null;

  const row = (kind: UpNextKind) => {
    if (kind === 'confirm' && ev?.confirm) return <ConfirmRow confirm={ev.confirm} tz={ev.timeZone} />;
    if (kind === 'lunch' && ev?.lunch) return <LunchRow lunch={ev.lunch} tz={ev.timeZone} />;
    if (kind === 'nextEvent' && ev) return <NextEventItem events={ev} />;
    if (kind === 'specialDay' && special && dd) return <SpecialDayRow hit={special} today={dd.today} days={days} />;
    return null;
  };

  return (
    <Card hero style={{ gap: space.md }}>
      <Txt variant="eyebrow" color="navy" accessibilityRole="header" style={{ fontFamily: fonts.bodySemi, letterSpacing: 0.48 }}>
        {t('home.upNext')}
      </Txt>
      {eventsError ? <ErrorState error={eventsError} onRetry={() => void events.reload()} /> : null}
      {items.map((kind, i) => (
        <VStack key={kind} gap={space.md}>
          {i > 0 ? <Divider /> : null}
          {row(kind)}
        </VStack>
      ))}
      {loading ? (
        <Row gap={space.sm} style={{ minHeight: touch.min }}>
          <ActivityIndicator color={colors.navy} />
          <Txt variant="small" color="muted" accessibilityLiveRegion="polite">
            {t('common.loading')}
          </Txt>
        </Row>
      ) : null}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Plan a special day
// ---------------------------------------------------------------------------

/**
 * "Plan a special day": the family's next special day (Family › Special
 * days), however far off, with "Plan a labh" — or "See special days" for a
 * child, a punyatithi, a day without the labh prompt, or when Pledges &
 * donations is off. With no days saved an adult is offered "Add a special
 * day". `excludeReminder` is true while "Up next" shows the reminder row, so
 * the two cards never show the same day.
 */
export function PlanSpecialDayCard({ days, excludeReminder }: { days: HomeSpecialDays; excludeReminder: boolean }) {
  const t = useT();
  const router = useRouter();
  const { member } = useApp();
  const givingOn = useModule('giving');
  const s = days.state;
  if (!member?.household) return null;
  if (s.data === undefined) return s.error ? <ErrorState error={s.error} onRetry={() => void s.reload()} /> : null;
  const d = s.data;
  const refreshError = s.error ? <ErrorState error={s.error} onRetry={() => void s.reload()} /> : null;

  if (d.saved === 0) {
    if (!member.isAdult) return refreshError;
    return (
      <>
        {refreshError}
        <Card hero tone="outlineSaffron" style={{ gap: 10 }}>
          <EyebrowRow left={t('home.planEyebrow')} color="brown" />
          <Txt variant="headline">{t('home.planEmptyTitle')}</Txt>
          <Txt variant="meta" color="muted">
            {givingOn ? t('home.planEmptyBody') : t('home.planEmptyBodyNoLabh')}
          </Txt>
          <PillButton label={t('home.planAdd')} tone="brown" onPress={() => router.push('/special-days')} />
        </Card>
      </>
    );
  }

  const exclude = excludeReminder ? (reminderSpecialDay(d.rows, d.today, days.hidden)?.day.id ?? null) : null;
  const pick = nextSpecialDay(d.rows, days.hidden, exclude);
  if (!pick) return refreshError;
  const words = describeSpecialDay(t, pick.day, pick.next, d.today, member.members);
  const labh = canPlanLabh({ givingOn, isAdult: member.isAdult, occasion: occasionOf(pick.day), labhPromptEnabled: pick.day.labh_prompt_enabled });
  const inDays = daysBetween(d.today, pick.next);
  const when = inDays < 60 ? `${formatDay(pick.next)} · ${whenText(t, d.today, pick.next)}` : formatDay(pick.next);
  return (
    <>
      {refreshError}
      <Card hero tone="outlineSaffron" style={{ gap: 10 }}>
        <EyebrowRow left={t('home.planEyebrow')} color="brown" />
        <Row gap={space.md} align="flex-start">
          <DateTile iso={pick.next} bg={colors.brownTint} fg={colors.brown} />
          <View style={{ flex: 1, gap: 2 }}>
            <Txt variant="headline">{words.title}</Txt>
            <Txt variant="meta" color="muted">
              {when}
            </Txt>
          </View>
        </Row>
        {labh ? (
          <>
            <Txt variant="meta" color="muted">
              {words.body}
            </Txt>
            <PillButton label={t('home.planLabh')} a11yLabel={t('home.planLabhA11y', { name: words.title })} tone="brown" onPress={() => router.push(`/labh/${encodeURIComponent(pick.day.id)}` as Href)} />
          </>
        ) : (
          <PillButton label={t('home.planDay')} tone="brown" onPress={() => router.push('/special-days')} />
        )}
      </Card>
    </>
  );
}

export function GuideLink() {
  const t = useT();
  const router = useRouter();
  const { center } = useApp();
  const title = t('home.guideTitle', { center: center?.short_name || '' });
  return (
    <Card hero onPress={() => router.push('/guide')} accessibilityLabel={title} style={{ paddingVertical: 14 }}>
      <Row gap={space.md}>
        <View style={{ width: 44, height: 44, borderRadius: radii.card, backgroundColor: colors.navyTint, alignItems: 'center', justifyContent: 'center' }}>
          <Txt variant="subhead" color="navy" style={{ fontFamily: fonts.bodyBold }}>
            i
          </Txt>
        </View>
        <View style={{ flex: 1 }}>
          <Txt variant="bodyStrong">{title}</Txt>
          <Txt variant="caption" color="muted" style={{ fontFamily: fonts.body }}>
            {t('home.guideBody')}
          </Txt>
        </View>
        <Chevron />
      </Row>
    </Card>
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

import { useRouter, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import { ErrorState, LoadingState } from '@/components/states';
import { StrokeIcon } from '@/components/stroke-icon';
import { Banner, Button, Card, Chevron, ProgressBar, Row, Txt, VStack } from '@/components/ui';
import { listDisplayName } from '@/features/special-days';
import { confirmAttendance, listAttendees } from '@/lib/api/events';
import { listSpecialDays, nextTithiDates } from '@/lib/api/family';
import { listOpportunities } from '@/lib/api/giving';
import { listAlerts, listFeedbackRequests, loadHomeEvents, loadToday, type HomeEvents } from '@/lib/api/home';
import { loadJainWayToday } from '@/lib/api/jainway';
import { reactivateAccount } from '@/lib/api/settings';
import { logError, report } from '@/lib/errors';
import { daysBetween, formatCents, formatDay, formatTime, formatTimeOfDay, monthShortUpper, parseISODate, todayAt, zonedParts } from '@/lib/format';
import { isWithinReminder, nextOccurrence, streakDisplay, streakLabel, tithiLabel } from '@/lib/rules';
import { readPref, writePref } from '@/lib/storage';
import { useLoad, type LoadState } from '@/lib/use-load';
import { useApp } from '@/providers/app';
import { useDataVersion } from '@/providers/data-version';
import { useFeedback } from '@/providers/feedback';
import { useT } from '@/providers/settings';
import { colors, fonts, radii, space, touch } from '@/theme';

import { useConfirmPopup } from './confirm-popup';
import { EventIcon } from './event-icons';
import { confirmSchedule, pronounFor, relativeDay, shortWhen, specialDayDismissKey, specialDayLead, tierLadder, turnsAge } from './event-rules';
import { peopleLabel } from './events';

/*
 * Home cards, in prototype order (Main.dc.html L43–139): deactivated → Today →
 * My Jain Way → Feedback → Lunch → Special day → Please confirm → Store →
 * Giving → Next event → "New to {center}? Start here".
 */

function SectionLoading() {
  return (
    <Card hero>
      <LoadingState />
    </Card>
  );
}

/** Eyebrow row with a right-hand note (feedback, special day, confirm cards). */
function EyebrowRow({ left, right, color }: { left: string; right?: string | null; color: 'purple' | 'brown' | 'navy' }) {
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

/** Rounded in-card button that sizes to its label (prototype "align-self: flex-start" pills). */
function PillButton({ label, onPress, tone, busy, disabled, fill }: { label: string; onPress: () => void; tone: 'purple' | 'brown' | 'green' | 'secondary' | 'plain'; busy?: boolean; disabled?: boolean; fill?: boolean }) {
  if (tone === 'plain') {
    return (
      <Pressable
        onPress={onPress}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={({ pressed }) => ({ flex: fill ? 1 : undefined, minHeight: 46, borderRadius: radii.pill, borderWidth: 1, borderColor: colors.borderInput, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.lg, opacity: pressed ? 0.85 : 1 })}>
        <Txt variant="smallStrong" color="muted">
          {label}
        </Txt>
      </Pressable>
    );
  }
  return (
    <View style={fill ? { flex: 1 } : { alignSelf: 'flex-start' }}>
      <Button label={label} onPress={onPress} tone={tone} size="card" busy={busy} disabled={disabled} fill={!!fill} style={fill ? undefined : { paddingHorizontal: 18 }} />
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
    <View style={{ flex: 1, backgroundColor: colors.panel, borderRadius: radii.lg, padding: 10, gap: 2 }}>
      <Txt variant="caption" color="muted" style={{ fontFamily: fonts.body }}>
        {label}
      </Txt>
      <Txt variant="section">{value}</Txt>
    </View>
  );
}

const TODAY_HIDDEN_KEY = 'homeTodayHidden';

/** "Today at {center}": tithi, timings and the live darshan link (prototype L50–69). */
export function TodayCard() {
  const t = useT();
  const router = useRouter();
  const { center, member } = useApp();
  const [collapsed, setCollapsed] = useState(false);
  const state = useLoad(() => (center ? loadToday(center) : Promise.reject(new Error('no center'))), [center?.id], "load today's timings");
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
    <Card hero style={{ gap: space.md }}>
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
          hitSlop={2}
          style={({ pressed }) => ({ width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: colors.borderInput, backgroundColor: colors.ground, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}>
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
      {darshan || aarti ? (
        <Pressable
          onPress={() => router.push({ pathname: '/jain-way', params: { tab: 'library' } })}
          accessibilityRole="button"
          style={({ pressed }) => ({ minHeight: touch.min, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.borderInput, backgroundColor: colors.ground, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm, paddingHorizontal: space.md, opacity: pressed ? 0.8 : 1 })}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.live }} />
          <Txt variant="small" color="navy" style={{ fontFamily: fonts.bodyMedium }}>
            {aarti ? t('home.watchDarshanAarti', { time: aarti }) : t('home.watchDarshan')}
          </Txt>
        </Pressable>
      ) : null}
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

/** "FEEDBACK REQUESTED" card: the most recent open survey (prototype L77–84). */
export function FeedbackCard() {
  const t = useT();
  const router = useRouter();
  const { center, member } = useApp();
  const state = useLoad(() => (center && member ? listFeedbackRequests(center.id, member.person.id) : Promise.resolve([])), [center?.id, member?.person.id], 'load feedback requests');
  if (state.data === undefined) return state.error ? <ErrorState error={state.error} onRetry={() => void state.reload()} /> : null;
  const first = state.data[0];
  if (!first) return null;
  const { survey, eventName } = first;
  return (
    <Card hero tone="outlinePurple">
      <EyebrowRow left={t('home.feedbackRequested')} right={t('home.feedbackMeta')} color="purple" />
      <Txt variant="headline">{eventName ? t('home.feedbackTitle', { event: eventName }) : survey.title}</Txt>
      <Txt variant="meta" color="muted">
        {survey.description?.trim() || t('home.feedbackBody')}
      </Txt>
      <PillButton label={t('home.shareFeedback')} tone="purple" onPress={() => router.push({ pathname: '/survey/[id]', params: { id: survey.id } })} />
    </Card>
  );
}

/** One load feeds the lunch card, the confirm card and the next-event row. */
export function useHomeEvents(): LoadState<HomeEvents> {
  const { center, member } = useApp();
  return useLoad(() => (center ? loadHomeEvents(center, member) : Promise.reject(new Error('no center'))), [center?.id, member?.household?.id], 'load upcoming events');
}

/** Solid green "Your lunch times" card after check-in (prototype L85–91). */
export function LunchCard({ state }: { state: LoadState<HomeEvents> }) {
  const t = useT();
  const router = useRouter();
  const { member } = useApp();
  const lunch = state.data?.lunch;
  if (!lunch || member?.isAdult === false || !state.data) return null;
  const tz = state.data.timeZone;
  const eyebrow = lunch.checkedInAt ? t('home.lunchEyebrowCheckedIn', { event: lunch.event.name, time: formatTime(lunch.checkedInAt, tz) }) : t('home.lunchEyebrow', { event: lunch.event.name });
  return (
    <Card hero tone="greenSolid" onPress={() => router.push({ pathname: '/event/[id]/tickets', params: { id: lunch.event.id } })} accessibilityLabel={t('home.lunchTitle')}>
      <Txt variant="eyebrow" color="onStore">
        {eyebrow}
      </Txt>
      <Txt variant="title" color="white" style={{ fontFamily: fonts.display }}>
        {t('home.lunchTitle')}
      </Txt>
      {lunch.card.state === 'ready' ? (
        <>
          {lunch.card.groups.map((g) => (
            <Row key={g.startsAt} style={{ justifyContent: 'space-between' }} gap={10}>
              <Txt variant="small" color="white" style={{ flex: 1 }}>
                {g.names.join(', ')}
              </Txt>
              <Txt variant="small" color="white" style={{ fontFamily: fonts.bodyBold }}>
                {g.time}
              </Txt>
            </Row>
          ))}
          <Txt variant="caption" color="onStore" style={{ fontFamily: fonts.body }}>
            {lunch.card.nowServing ? t('home.lunchReminderServing', { slot: lunch.card.nowServing }) : t('home.lunchReminder')}
          </Txt>
        </>
      ) : (
        <Txt variant="small" color="white">
          {t('lunch.assigning')}
        </Txt>
      )}
    </Card>
  );
}

/** "PLEASE CONFIRM" card, 24 hours before (prototype L103–112); also opens the in-app pop-up once. */
export function ConfirmCard({ state }: { state: LoadState<HomeEvents> }) {
  const t = useT();
  const router = useRouter();
  const { member } = useApp();
  const { toast } = useFeedback();
  const { invalidate } = useDataVersion();
  const { showConfirm } = useConfirmPopup();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const confirm = state.data?.confirm ?? null;
  const confirmEventId = member?.isAdult ? (confirm?.event.id ?? null) : null;

  useEffect(() => {
    if (!confirmEventId) return;
    showConfirm(confirmEventId, { auto: true }).catch((err: unknown) => logError('showing the RSVP confirm pop-up', err));
  }, [confirmEventId, showConfirm]);

  if (!confirm || !member?.isAdult || !state.data) return null;
  const tz = state.data.timeZone;
  const eventIso = confirm.event.starts_at ? zonedParts(new Date(confirm.event.starts_at), tz).iso : null;
  const rel = relativeDay(eventIso, todayAt(tz));
  const title =
    rel === 'tomorrow'
      ? t('home.stillComingTomorrow', { event: confirm.event.name })
      : rel === 'today'
        ? t('home.stillComingToday', { event: confirm.event.name })
        : t('home.stillComing', { event: confirm.event.name, when: shortWhen(confirm.event.starts_at, tz) });
  const schedule = confirm.event.starts_at ? confirmSchedule(confirm.event.starts_at, tz, confirm.event.confirmation_hours_before) : null;

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
    <Card hero tone="outlineNavy" style={{ gap: 10 }}>
      <EyebrowRow left={t('home.pleaseConfirm')} right={schedule ? t('home.confirmSent', { when: schedule.sentAt, hours: confirm.event.confirmation_hours_before }) : null} color="navy" />
      <Txt variant="headline">{title}</Txt>
      <Txt variant="meta" color="muted">
        {t('home.confirmBody', { people: peopleLabel(t, confirm.count) })}
      </Txt>
      {error ? <Banner tone="error" message={error} /> : null}
      <Row gap={space.sm}>
        <View style={{ flex: 1 }}>
          <Button label={t('events.yesComing')} tone="green" size="md" onPress={confirmYes} busy={busy} style={{ borderRadius: radii.pill, paddingHorizontal: space.sm }} />
        </View>
        <View style={{ flex: 1 }}>
          <Button label={t('events.changeOrCancel')} tone="secondary" size="md" onPress={() => router.push({ pathname: '/event/[id]/confirm', params: { id: confirm.event.id } })} style={{ borderRadius: radii.pill, paddingHorizontal: space.sm }} />
        </View>
      </Row>
    </Card>
  );
}

/** Next event row: navy date block, name, status, RSVP pill or chevron (prototype L124–134). */
export function NextEventRow({ state }: { state: LoadState<HomeEvents> }) {
  const t = useT();
  const router = useRouter();
  const { member } = useApp();
  if (state.data === undefined) return state.error ? <ErrorState error={state.error} onRetry={() => void state.reload()} /> : <SectionLoading />;
  const { next, nextRsvp, nextCount, timeZone } = state.data;
  if (!next) {
    return (
      <Card tone="dashed" hero>
        <Txt variant="small" color="muted">
          {t('home.noEvents')}
        </Txt>
      </Card>
    );
  }
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
    <Card hero onPress={open} accessibilityLabel={`${next.name}. ${status}`}>
      <Row gap={space.md}>
        <View style={{ width: 48, height: 52, borderRadius: radii.lg, backgroundColor: colors.navy, alignItems: 'center', justifyContent: 'center' }}>
          <Txt variant="fine" color="white">
            {iso ? monthShortUpper(iso) : ''}
          </Txt>
          <Txt variant="subhead" color="white" style={{ lineHeight: 22 }}>
            {iso ? String(parseISODate(iso)?.d ?? '') : ''}
          </Txt>
        </View>
        <View style={{ flex: 1 }}>
          <Txt variant="bodyStrong">{next.name}</Txt>
          <Txt variant="meta" color="muted">
            {status}
          </Txt>
        </View>
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
        ) : (
          <View style={{ width: touch.min, height: touch.min, alignItems: 'center', justifyContent: 'center' }}>
            <StrokeIcon name="forward" size={20} color={colors.faint} strokeWidth={2} />
          </View>
        )}
      </Row>
    </Card>
  );
}

/** "NEW GIVING OPPORTUNITY" with the tier ladder when the campaign has fixed levels (prototype L119–123). */
export function GivingSection() {
  const t = useT();
  const router = useRouter();
  const { center } = useApp();
  const state = useLoad(() => (center ? listOpportunities(center.id) : Promise.resolve([])), [center?.id], 'load giving opportunities');
  if (state.data === undefined) return state.error ? <ErrorState error={state.error} onRetry={() => void state.reload()} /> : null;
  const opp = state.data[0];
  if (!opp) return null;
  const siblings = state.data.filter((o) => o.campaign_id === opp.campaign_id);
  const ladder = tierLadder(siblings, (c) => formatCents(c));
  const from = opp.amount_cents ?? opp.min_amount_cents;
  const title = ladder && opp.campaign ? opp.campaign.name : opp.name;
  const sub = ladder ?? [opp.campaign?.name, from ? t('give.from', { amount: formatCents(from) }) : t('give.anyAmount')].filter(Boolean).join(' · ');
  return (
    <Card hero tone="amber">
      <Txt variant="eyebrow" color="brown" style={{ fontFamily: fonts.bodySemi, letterSpacing: 0.48 }}>
        {t('home.newOpportunity')}
      </Txt>
      <Txt variant="headline">{title}</Txt>
      <Txt variant="small" color="brownText">
        {sub}
      </Txt>
      <PillButton label={t('home.viewAndSponsor')} tone="brown" onPress={() => router.push({ pathname: '/opportunity/[id]', params: { id: opp.id } })} />
    </Card>
  );
}

type SpecialHit = { dayId: string; title: string; body: string; lead: string; date: string; labh: boolean; dismissKey: string };

const DISMISSED_KEY = 'specialDaysNotThisYear';

/** Special-day card: "Choose a labh" and "Not this year" (prototype L93–102). */
export function SpecialDayCard() {
  const t = useT();
  const router = useRouter();
  const { center, member } = useApp();
  const { toast } = useFeedback();
  const [dismissed, setDismissed] = useState<string[]>([]);
  const state = useLoad(
    async (): Promise<SpecialHit | null> => {
      if (!center || !member?.household) return null;
      const today = todayAt(center.time_zone);
      const [all, hidden] = await Promise.all([listSpecialDays(member.household.id), readPref<string[]>(DISMISSED_KEY, [])]);
      const days = all.filter((d) => d.show_on_home);
      const tithiDates = await nextTithiDates(
        center.id,
        today,
        days.filter((d) => !d.calendar_date && d.tithi && d.tithi_month).map((d) => ({ id: d.id, tithi: d.tithi as string, month: d.tithi_month as string })),
      );
      const upcoming = days
        .map((d) => ({ day: d, next: d.calendar_date ? nextOccurrence(d.calendar_date, today) : (tithiDates[d.id] ?? null) }))
        .filter((x): x is { day: (typeof days)[number]; next: string } => !!x.next && isWithinReminder(x.next, today, x.day.reminder_days_before))
        .filter((x) => !hidden.includes(specialDayDismissKey(x.day.id, x.next)))
        .sort((a, b) => a.next.localeCompare(b.next));
      const hit = upcoming[0];
      if (!hit) return null;
      const lead = specialDayLead(daysBetween(today, hit.next));
      const person = hit.day.person_id ? (member.members.find((m) => m.person.id === hit.day.person_id)?.person ?? null) : null;
      const age = hit.day.kind === 'birthday' && person ? turnsAge(person.date_of_birth, hit.next) : null;
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
        dayId: hit.day.id,
        title: person && age != null ? t('home.turns', { name: person.preferred_name || person.first_name, age }) : listDisplayName(t, hit.day, member.members),
        body: hit.day.kind === 'birthday' && person ? t('home.specialBirthdayBody', { pronoun: pronounWord }) : t('home.specialBody'),
        lead: leadText,
        date: formatDay(hit.next),
        labh: hit.day.labh_prompt_enabled,
        dismissKey: specialDayDismissKey(hit.day.id, hit.next),
      };
    },
    [center?.id, member?.household?.id],
    'load special days',
  );
  if (state.data === undefined) return state.error ? <ErrorState error={state.error} onRetry={() => void state.reload()} /> : null;
  const hit = state.data;
  if (!hit || dismissed.includes(hit.dismissKey)) return null;

  const notThisYear = async () => {
    setDismissed([...dismissed, hit.dismissKey]);
    try {
      const prev = await readPref<string[]>(DISMISSED_KEY, []);
      await writePref(DISMISSED_KEY, [...new Set([...prev, hit.dismissKey])]);
      toast(t('home.notThisYearToast', { name: hit.title }), 'info');
    } catch (err) {
      toast(report(err, 'hide this special day').userMessage, 'error');
    }
  };

  return (
    <Card hero tone="outlineSaffron" style={{ gap: 10 }}>
      <EyebrowRow left={hit.lead} right={hit.date} color="brown" />
      <Txt variant="title" style={{ fontFamily: fonts.display }}>
        {hit.title}
      </Txt>
      <Txt variant="meta" color="muted">
        {hit.body}
      </Txt>
      <Row gap={space.sm}>
        {hit.labh ? (
          <PillButton label={t('home.chooseLabh')} tone="brown" fill onPress={() => router.push(`/labh/${encodeURIComponent(hit.dayId)}` as Href)} />
        ) : (
          <PillButton label={t('home.planDay')} tone="brown" fill onPress={() => router.push('/special-days')} />
        )}
        <PillButton label={t('home.notThisYear')} tone="plain" fill onPress={notThisYear} />
      </Row>
    </Card>
  );
}

export function StoreBanner() {
  const t = useT();
  const router = useRouter();
  const { center } = useApp();
  const flags = center?.feature_flags && typeof center.feature_flags === 'object' && !Array.isArray(center.feature_flags) ? (center.feature_flags as Record<string, unknown>) : {};
  if (flags.store === false) return null;
  return (
    <Card hero tone="store" onPress={() => router.push('/store')} accessibilityLabel={t('store.title')}>
      <Row gap={14}>
        <View style={{ width: 52, height: 52, borderRadius: radii.row, backgroundColor: colors.storeLight, alignItems: 'center', justifyContent: 'center' }}>
          <StrokeIcon name="bag" size={26} color={colors.white} />
        </View>
        <View style={{ flex: 1 }}>
          <Txt variant="eyebrow" color="onStore">
            {t('home.storeEyebrow', { center: center?.short_name || '' })}
          </Txt>
          <Txt variant="headline" color="white">
            {t('home.storeTitle')}
          </Txt>
          <Txt variant="caption" color="onStore" style={{ fontFamily: fonts.body }}>
            {t('home.storeBody')}
          </Txt>
        </View>
      </Row>
    </Card>
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

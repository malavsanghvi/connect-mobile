import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { View } from 'react-native';

import { Icon } from '@/components/icon';
import { ErrorState, LoadingState } from '@/components/states';
import { Banner, Button, Card, IconButton, ProgressBar, Row, Txt, VStack } from '@/components/ui';
import { listDisplayName } from '@/features/special-days';
import { confirmAttendance, listAttendees } from '@/lib/api/events';
import { listSpecialDays, nextTithiDates } from '@/lib/api/family';
import { listOpportunities } from '@/lib/api/giving';
import { listAlerts, listOpenSurveys, loadHomeEvents, loadToday } from '@/lib/api/home';
import { loadJainWayToday } from '@/lib/api/jainway';
import { reactivateAccount } from '@/lib/api/settings';
import { report } from '@/lib/errors';
import { daysBetween, formatCents, formatDate, formatDay, formatTime, formatTimeOfDay, monthShortUpper, parseISODate, todayAt, zonedParts } from '@/lib/format';
import { isWithinReminder, lunchLines, nextOccurrence, streakDisplay, streakLabel, tithiLabel } from '@/lib/rules';
import { useLoad } from '@/lib/use-load';
import { useApp } from '@/providers/app';
import { useDataVersion } from '@/providers/data-version';
import { useFeedback } from '@/providers/feedback';
import { useT } from '@/providers/settings';
import { colors, radii, space } from '@/theme';

function SectionLoading() {
  return (
    <Card>
      <LoadingState />
    </Card>
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
      <Txt variant="cardTitle" color="brownDark">
        {t('home.deactivatedTitle')}
      </Txt>
      <Txt variant="small" color="brownText">
        {t('home.deactivatedBody')}
      </Txt>
      {error ? <Banner tone="error" message={error} /> : null}
      <Button label={t('settings.reactivate')} tone="brown" size="md" onPress={reactivate} busy={busy} />
    </Card>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1, backgroundColor: colors.navyPanel, borderRadius: radii.lg, padding: space.md, gap: 2 }}>
      <Txt variant="caption" color="onNavy">
        {label}
      </Txt>
      <Txt variant="section" color="white">
        {value}
      </Txt>
    </View>
  );
}

/** "Today at JSH": tithi + timings + live darshan (prototype §2.1 item 2). */
export function TodayCard() {
  const t = useT();
  const { center, member } = useApp();
  const [collapsed, setCollapsed] = useState(false);
  const state = useLoad(() => (center ? loadToday(center) : Promise.reject(new Error('no center'))), [center?.id], "load today's timings");
  const greeting = member?.household ? t('home.greetingFamily', { family: member.household.display_name }) : t('welcome.jaiJinendra');

  if (collapsed) {
    return (
      <Row style={{ justifyContent: 'space-between' }}>
        <Txt variant="headline" color="navy">
          {greeting}
        </Txt>
        <Button label={t('home.showToday')} tone="ghost" size="sm" fill={false} onPress={() => setCollapsed(false)} />
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

  const openDarshan = async () => {
    if (!darshan) return;
    try {
      await WebBrowser.openBrowserAsync(darshan.url);
    } catch (err) {
      report(err, 'open the live darshan');
    }
  };

  return (
    <Card tone="navy">
      <Row style={{ justifyContent: 'space-between' }} align="flex-start">
        <VStack gap={2} style={{ flex: 1 }}>
          <Txt variant="small" color="onNavy">
            {greeting}
          </Txt>
          <Txt variant="title" color="white" accessibilityRole="header">
            {t('home.todayAt', { center: center?.short_name || center?.name || '' })}
          </Txt>
          <Txt variant="small" color="onNavy">
            {tithi ? `${formatDay(today)} · ${tithiLabel(tithi)}` : formatDay(today)}
          </Txt>
        </VStack>
        <IconButton icon="close" label={t('home.hideToday')} color={colors.onNavy} onPress={() => setCollapsed(true)} />
      </Row>
      {tiles.length ? (
        <Row gap={space.sm}>
          {tiles.map((x) => (
            <Tile key={x.label} label={x.label} value={x.value} />
          ))}
        </Row>
      ) : (
        <Txt variant="small" color="onNavy">
          {t('home.noTimings')}
        </Txt>
      )}
      {timings?.aarti ? (
        <Txt variant="small" color="onNavy">
          {t('home.aartiAt', { time: formatTimeOfDay(timings.aarti) })}
        </Txt>
      ) : null}
      {darshan ? <Button label={t('home.watchDarshan')} tone="light" size="md" icon="play-circle-outline" onPress={openDarshan} /> : null}
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
  return (
    <Card onPress={() => router.push('/jain-way')} accessibilityLabel={t('home.myWay')}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Txt variant="cardTitle">{t('home.myWay')}</Txt>
        <Txt variant="smallStrong" color="green">
          {t('home.doneOf', { done, n })}
        </Txt>
      </Row>
      <ProgressBar value={n ? done / n : 0} label={t('home.doneOf', { done, n })} />
      <Row gap={space.xs}>
        <Icon name="flame" size={18} color={colors.flame} />
        <Txt variant="small" color="ink2">
          {`${streakLabel(streak.days)} · ${t('home.points', { points: d.pointsTotal.toLocaleString('en-US') })}`}
        </Txt>
      </Row>
      <Txt variant="meta" color="muted">
        {n === 0 ? t('home.choosePractices') : next ? t('home.nextPractice', { name: next.name }) : t('home.allDone')}
      </Txt>
    </Card>
  );
}

export function SurveysSection() {
  const t = useT();
  const router = useRouter();
  const { center, member } = useApp();
  const state = useLoad(() => (center && member ? listOpenSurveys(center.id, member.person.id) : Promise.resolve([])), [center?.id, member?.person.id], 'load surveys');
  if (state.data === undefined) return state.error ? <ErrorState error={state.error} onRetry={() => void state.reload()} /> : null;
  return (
    <>
      {state.data.slice(0, 2).map((s) => (
        <Card key={s.id} tone="purple">
          <Txt variant="eyebrow" color="purple">
            {s.anonymous ? t('home.feedbackAnon') : t('home.feedbackRequested')}
          </Txt>
          <Txt variant="headline" color="purpleDark">
            {s.title}
          </Txt>
          {s.description ? (
            <Txt variant="small" color="ink2">
              {s.description}
            </Txt>
          ) : null}
          <Button label={t('home.shareFeedback')} tone="purple" size="md" onPress={() => router.push({ pathname: '/survey/[id]', params: { id: s.id } })} />
        </Card>
      ))}
    </>
  );
}

/** Lunch card, 24-hour confirmation prompt and the next event row. */
export function EventsSection() {
  const t = useT();
  const router = useRouter();
  const { center, member } = useApp();
  const { toast } = useFeedback();
  const { invalidate } = useDataVersion();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const state = useLoad(() => (center ? loadHomeEvents(center, member) : Promise.reject(new Error('no center'))), [center?.id, member?.household?.id], 'load upcoming events');
  if (state.data === undefined) return state.error ? <ErrorState error={state.error} onRetry={() => void state.reload()} /> : <SectionLoading />;
  const { next, nextRsvp, nextCount, confirm, lunch, timeZone } = state.data;

  const confirmYes = async () => {
    if (!confirm) return;
    setBusy(true);
    setError(null);
    try {
      const attendees = (await listAttendees(confirm.rsvp.id)).filter((a) => a.status !== 'cancelled');
      await confirmAttendance(confirm.rsvp.id, attendees.map((a) => a.id), []);
      invalidate();
      toast(t('events.confirmedToast', { n: attendees.length }));
    } catch (err) {
      setError(report(err, 'confirm your attendance').userMessage);
    } finally {
      setBusy(false);
    }
  };

  const nextStatus = (() => {
    if (!next) return '';
    const when = formatTime(next.starts_at, timeZone);
    if (!nextRsvp || nextRsvp.status === 'cancelled') return nextRsvp ? t('home.youCancelled') : t('home.rsvpOpen', { when: `${formatDate(next.starts_at, timeZone)} ${when}` });
    return nextRsvp.status === 'confirmed' ? t('home.nConfirmed', { n: nextCount, when }) : t('home.nAttending', { n: nextCount, when });
  })();
  const hasActiveRsvp = !!nextRsvp && nextRsvp.status !== 'cancelled';

  return (
    <>
      {lunch && member?.isAdult !== false ? (
        <Card tone="green" onPress={() => router.push({ pathname: '/event/[id]/tickets', params: { id: lunch.event.id } })} accessibilityLabel={t('home.lunchTitle')}>
          <Txt variant="eyebrow" color="greenDark">
            {t('home.lunchEyebrow', { event: lunch.event.name })}
          </Txt>
          <Txt variant="headline" color="greenDark">
            {t('home.lunchTitle')}
          </Txt>
          {lunch.card.state === 'ready' ? (
            <>
              {lunchLines(lunch.card).map((l) => (
                <Txt key={l} variant="bodyStrong" color="greenDark">
                  {l}
                </Txt>
              ))}
              <Txt variant="meta" color="greenDark">
                {lunch.card.nowServing ? t('home.lunchReminderServing', { slot: lunch.card.nowServing }) : t('home.lunchReminder')}
              </Txt>
            </>
          ) : (
            <Txt variant="small" color="greenDark">
              {t('lunch.assigning')}
            </Txt>
          )}
        </Card>
      ) : null}

      {confirm && member?.isAdult ? (
        <Card style={{ borderColor: colors.navy, borderWidth: 1.5 }}>
          <Txt variant="eyebrow" color="navy">
            {t('home.pleaseConfirm')}
          </Txt>
          <Txt variant="headline" color="navy">
            {t('home.stillComing', { event: confirm.event.name, when: formatDate(confirm.event.starts_at, timeZone) })}
          </Txt>
          <Txt variant="small" color="ink2">
            {t('home.confirmBody', { n: confirm.count })}
          </Txt>
          {error ? <Banner tone="error" message={error} /> : null}
          <Button label={t('events.yesComing')} onPress={confirmYes} busy={busy} />
          <Button label={t('events.changeOrCancel')} tone="secondary" onPress={() => router.push({ pathname: '/event/[id]/confirm', params: { id: confirm.event.id } })} />
        </Card>
      ) : null}

      {next ? (
        <Card onPress={() => router.push(hasActiveRsvp ? { pathname: '/event/[id]/tickets', params: { id: next.id } } : { pathname: '/event/[id]', params: { id: next.id } })} accessibilityLabel={`${next.name}. ${nextStatus}`}>
          <Row gap={space.md}>
            <View style={{ width: 56, borderRadius: radii.md, backgroundColor: colors.maroon, alignItems: 'center', paddingVertical: space.sm }}>
              <Txt variant="badge" color="onMaroon">
                {next.starts_at ? monthShortUpper(zonedParts(new Date(next.starts_at), timeZone).iso) : ''}
              </Txt>
              <Txt variant="title" color="white">
                {next.starts_at ? String(parseISODate(zonedParts(new Date(next.starts_at), timeZone).iso)?.d ?? '') : ''}
              </Txt>
            </View>
            <View style={{ flex: 1 }}>
              <Txt variant="cardTitle">{next.name}</Txt>
              <Txt variant="meta" color="muted">
                {nextStatus}
              </Txt>
            </View>
            {!hasActiveRsvp && member?.isAdult ? <Txt variant="smallStrong" color="maroon">{t('events.rsvp')}</Txt> : <Icon name="chevron-forward" size={18} color={colors.faint} />}
          </Row>
        </Card>
      ) : (
        <Card tone="dashed">
          <Txt variant="small" color="muted">
            {t('home.noEvents')}
          </Txt>
        </Card>
      )}
    </>
  );
}

export function GivingSection() {
  const t = useT();
  const router = useRouter();
  const { center } = useApp();
  const state = useLoad(() => (center ? listOpportunities(center.id) : Promise.resolve([])), [center?.id], 'load giving opportunities');
  if (state.data === undefined) return state.error ? <ErrorState error={state.error} onRetry={() => void state.reload()} /> : null;
  const opp = state.data[0];
  if (!opp) return null;
  const from = opp.amount_cents ?? opp.min_amount_cents;
  return (
    <Card tone="amber">
      <Txt variant="eyebrow" color="brown">
        {t('home.newOpportunity')}
      </Txt>
      <Txt variant="headline" color="brownDark">
        {opp.name}
      </Txt>
      <Txt variant="small" color="brownText">
        {[opp.campaign?.name, from ? t('give.from', { amount: formatCents(from) }) : t('give.anyAmount')].filter(Boolean).join(' · ')}
      </Txt>
      <Button label={t('home.viewAndSponsor')} tone="brown" size="md" onPress={() => router.push({ pathname: '/opportunity/[id]', params: { id: opp.id } })} />
    </Card>
  );
}

export function SpecialDaySection() {
  const t = useT();
  const router = useRouter();
  const { center, member } = useApp();
  const state = useLoad(
    async () => {
      if (!center || !member?.household) return null;
      const today = todayAt(center.time_zone);
      const days = (await listSpecialDays(member.household.id)).filter((d) => d.show_on_home);
      const tithiDates = await nextTithiDates(
        center.id,
        today,
        days.filter((d) => !d.calendar_date && d.tithi && d.tithi_month).map((d) => ({ id: d.id, tithi: d.tithi as string, month: d.tithi_month as string })),
      );
      const upcoming = days
        .map((d) => ({ day: d, next: d.calendar_date ? nextOccurrence(d.calendar_date, today) : (tithiDates[d.id] ?? null) }))
        .filter((x) => isWithinReminder(x.next, today, x.day.reminder_days_before))
        .sort((a, b) => (a.next ?? '').localeCompare(b.next ?? ''));
      return upcoming[0] ? { ...upcoming[0], today } : null;
    },
    [center?.id, member?.household?.id],
    'load special days',
  );
  if (state.data === undefined) return state.error ? <ErrorState error={state.error} onRetry={() => void state.reload()} /> : null;
  const hit = state.data;
  if (!hit || !hit.next || !member) return null;
  const inDays = daysBetween(hit.today, hit.next);
  return (
    <Card tone="amber" style={{ borderColor: colors.saffron }}>
      <Txt variant="eyebrow" color="brown">
        {inDays === 0 ? t('home.specialToday') : t('home.specialIn', { n: inDays, date: formatDay(hit.next) })}
      </Txt>
      <Txt variant="headline" color="brownDark">
        {listDisplayName(t, hit.day, member.members)}
      </Txt>
      <Txt variant="small" color="brownText">
        {t('home.specialBody')}
      </Txt>
      <Button label={t('home.planDay')} tone="brown" size="md" onPress={() => router.push('/special-days')} />
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
    <Card tone="store" onPress={() => router.push('/store')} accessibilityLabel={t('store.title')}>
      <Txt variant="eyebrow" color="onStore">
        {t('home.storeEyebrow', { center: center?.short_name || '' })}
      </Txt>
      <Txt variant="headline" color="white">
        {t('home.storeTitle')}
      </Txt>
      <Txt variant="small" color="onStore">
        {t('home.storeBody')}
      </Txt>
    </Card>
  );
}

export function GuideLink() {
  const t = useT();
  const router = useRouter();
  const { center } = useApp();
  return (
    <Card onPress={() => router.push('/guide')} accessibilityLabel={t('home.guideTitle', { center: center?.short_name || '' })}>
      <Row gap={space.md}>
        <Icon name="compass-outline" size={26} color={colors.navy} />
        <View style={{ flex: 1 }}>
          <Txt variant="bodyStrong">{t('home.guideTitle', { center: center?.short_name || '' })}</Txt>
          <Txt variant="meta" color="muted">
            {t('home.guideBody')}
          </Txt>
        </View>
        <Icon name="chevron-forward" size={18} color={colors.faint} />
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

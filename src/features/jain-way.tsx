import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Icon } from '@/components/icon';
import { EmptyState, ErrorState, Loaded } from '@/components/states';
import { Banner, Card, ProgressBar, Row, Txt, VStack } from '@/components/ui';
import { goalProgress, lastActivityByGoal, loadGyan, type GoalProgress, type GyanData, type GyanGoal } from '@/lib/api/gyan';
import { loadToday } from '@/lib/api/home';
import {
  addPractice,
  loadJainWayToday,
  loadSaathi,
  loadSaathiFeed,
  loadStanding,
  logPractice,
  removePractice,
  sendAnumodana,
  unlogPractice,
  type Practice,
  type Standing,
} from '@/lib/api/jainway';
import { logError, report } from '@/lib/errors';
import { formatDay, weekdayOf } from '@/lib/format';
import {
  behindDays,
  categoryLabel,
  circleStatus,
  communityName,
  pointRules,
  practiceTiming,
  relativeWhen,
  reminderClock,
  sortByTime,
  splitFeed,
  standingTone,
  type CircleStatus,
  type FeedItem,
  type PracticeTiming,
} from '@/lib/learning';
import { cancelLocalReminder, scheduleDailyLocalReminder } from '@/lib/push';
import { streakDisplay, streakLabel, tithiLabel } from '@/lib/rules';
import { readPref, writePref } from '@/lib/storage';
import { useLoad, type LoadState } from '@/lib/use-load';
import { useApp } from '@/providers/app';
import { useDataVersion } from '@/providers/data-version';
import { useFeedback } from '@/providers/feedback';
import { useT } from '@/providers/settings';
import { colors, fonts, radii, space, touch } from '@/theme';

import { FlameGlyph, InitialAvatar, MEMBER_COLORS } from './gyan-ui';

const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const REMINDER_PREF = 'practiceReminders';

type T = ReturnType<typeof useT>;

function timingLabel(tm: PracticeTiming, t: T): string {
  if (tm.kind === 'by') return t('jw.byTime', { time: tm.label });
  if (tm.kind === 'before') return t('jw.beforeTime', { time: tm.label });
  if (tm.kind === 'anytime') return t('jw.anytime');
  return tm.label;
}

// ---------------------------------------------------------------------------
// Today (prototype Main L580–633)
// ---------------------------------------------------------------------------

export function TodayPane() {
  const t = useT();
  const { center, member } = useApp();
  const { toast } = useFeedback();
  const { invalidate } = useDataVersion();
  const [editing, setEditing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reminders, setReminders] = useState<Record<string, string>>({});
  const community = communityName(center);
  const rules = pointRules(center?.rules);
  const state = useLoad(
    async () => {
      if (!center || !member) throw new Error('not signed in');
      const [way, today] = await Promise.all([loadJainWayToday(center, member.person.id), loadToday(center)]);
      return { ...way, tithi: today.tithi, timings: today.timings };
    },
    [center?.id, member?.person.id],
    'load My Jain Way',
  );
  const standing = useLoad(() => (member ? loadStanding(member.person.id) : Promise.resolve([])), [member?.person.id], 'load your standing this month');

  useEffect(() => {
    let alive = true;
    readPref<Record<string, string>>(REMINDER_PREF, {}).then((r) => {
      if (alive) setReminders(r);
    });
    return () => {
      alive = false;
    };
  }, []);

  const toggleDone = async (p: Practice, isDone: boolean, today: string) => {
    if (!center || !member) return;
    setBusyId(p.id);
    setError(null);
    try {
      if (isDone) {
        const res = await unlogPractice(member.person.id, p.id, today);
        invalidate();
        toast(res.pointsReversed > 0 ? t('jw.undoToast', { points: res.pointsReversed }) : t('jw.undoToastNoPoints'), 'info');
      } else {
        const res = await logPractice(center.id, p.id, today);
        invalidate();
        toast(res.dayComplete ? t('jw.dayCompleteToast', { points: res.pointsAwarded, days: res.streakDays }) : t('jw.pointsToast', { points: res.pointsAwarded }));
      }
    } catch (err) {
      setError(report(err, isDone ? 'unmark this practice' : 'log this practice').userMessage);
    } finally {
      setBusyId(null);
    }
  };

  const toggleSelection = async (p: Practice, selected: boolean) => {
    if (!center || !member) return;
    setBusyId(p.id);
    setError(null);
    try {
      if (selected) await removePractice(member.person.id, p.id);
      else await addPractice(center.id, member.person.id, p.id);
      invalidate();
    } catch (err) {
      setError(report(err, selected ? 'remove this practice' : 'add this practice').userMessage);
    } finally {
      setBusyId(null);
    }
  };

  const toggleReminder = async (p: Practice, tm: PracticeTiming) => {
    setError(null);
    const existing = reminders[p.id];
    try {
      const next = { ...reminders };
      if (existing) {
        await cancelLocalReminder(existing);
        delete next[p.id];
        toast(t('jw.reminderOffToast'), 'info');
      } else {
        if (tm.minutes === null) {
          setError(t('jw.reminderNoTime', { name: p.name }));
          return;
        }
        const { hour, minute } = reminderClock(tm.minutes);
        const id = await scheduleDailyLocalReminder(t('jw.reminderTitle', { name: p.name }), t('jw.reminderBody'), hour, minute);
        if (!id) {
          setError(t('jw.reminderUnavailable'));
          return;
        }
        next[p.id] = id;
        toast(t('jw.reminderSetToast'));
      }
      setReminders(next);
      await writePref(REMINDER_PREF, next).catch((err: unknown) => logError('saving practice reminders on this device', err));
    } catch (err) {
      setError(report(err, 'set a reminder').userMessage);
    }
  };

  return (
    <Loaded state={state}>
      {(d) => {
        const n = d.selected.length;
        const done = d.doneIds.length;
        const streak = streakDisplay(d.streak, d.today);
        const allDone = n > 0 && done >= n;
        const timing = (p: Practice) => practiceTiming(p, d.timings);
        const selected = sortByTime(d.selected, (p) => timing(p).minutes);
        return (
          <VStack gap={14}>
            <View style={{ backgroundColor: colors.navy, borderRadius: radii.xxl, paddingVertical: 18, paddingHorizontal: 20, gap: space.md }}>
              <Row style={{ justifyContent: 'space-between' }} align="flex-start">
                <View style={{ flex: 1 }}>
                  <Txt variant="meta" color="onNavy">
                    {d.tithi ? t('jw.todayTithi', { tithi: tithiLabel(d.tithi) }) : t('jw.todayDate', { date: formatDay(d.today) })}
                  </Txt>
                  <Txt variant="display" color="white" accessibilityRole="header" style={{ fontFamily: fonts.display }}>
                    {t('home.doneOf', { done, n })}
                  </Txt>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Txt variant="caption" color="onNavy" style={{ fontFamily: fonts.body }}>
                    {t('jw.points', { center: community })}
                  </Txt>
                  <Text style={{ fontFamily: fonts.bodyBold, fontSize: 24, lineHeight: 30, color: colors.white }}>{d.pointsTotal.toLocaleString('en-US')}</Text>
                  <Txt variant="caption" color="onNavyGreen" style={{ fontFamily: fonts.bodySemi }}>
                    {t('jw.pointsToday', { points: d.pointsToday })}
                  </Txt>
                </View>
              </Row>
              <ProgressBar value={n ? done / n : 0} color={colors.onNavyGreen} track={colors.navyPanel} label={t('home.doneOf', { done, n })} />
              <Row gap={10} style={{ backgroundColor: colors.navyPanel2, borderRadius: radii.card, paddingVertical: 10, paddingHorizontal: 12 }}>
                <FlameGlyph size={30} />
                <View style={{ flex: 1 }}>
                  <Txt variant="section" color="white" style={{ fontFamily: fonts.bodyBold }}>
                    {streakLabel(streak.days)}
                  </Txt>
                  <Txt variant="caption" color="onNavy" style={{ fontFamily: fonts.body }}>
                    {streak.completedToday ? t('jw.bestStreak', { best: streak.best }) : streak.atRisk ? t('jw.keepStreak', { days: streak.days + 1 }) : t('jw.startStreak')}
                  </Txt>
                </View>
              </Row>
              <Row gap={4}>
                {d.week.map((w) => {
                  const isToday = w.date === d.today;
                  const on = w.complete;
                  const status = on ? t('jw.dayComplete') : isToday ? t('jw.dayToday') : w.any ? t('jw.dayPartial') : t('jw.dayNone');
                  return (
                    <View key={w.date} style={{ flex: 1, alignItems: 'center', gap: 4 }} accessible accessibilityLabel={`${formatDay(w.date)}: ${status}`}>
                      <View
                        style={{
                          width: 30,
                          height: 30,
                          borderRadius: 15,
                          alignItems: 'center',
                          justifyContent: 'center',
                          borderWidth: 2,
                          backgroundColor: on ? colors.flame : isToday ? colors.white : colors.navyPanel,
                          borderColor: on || isToday ? colors.flame : colors.navyPanel,
                        }}>
                        <Text style={{ fontFamily: fonts.bodyBold, fontSize: 13, color: colors.navy }}>{on ? '✓' : isToday ? '·' : ''}</Text>
                      </View>
                      <Text style={{ fontFamily: fonts.body, fontSize: 11, color: colors.onNavy }}>{DOW[weekdayOf(w.date)]}</Text>
                    </View>
                  );
                })}
              </Row>
            </View>

            {allDone ? (
              <View style={{ backgroundColor: colors.greenTint, borderColor: colors.greenBorder, borderWidth: 1, borderRadius: radii.xl, paddingVertical: 14, paddingHorizontal: 16, gap: 2 }} accessibilityLiveRegion="polite">
                <Txt variant="section" color="greenDark" style={{ fontFamily: fonts.bodyBold }}>
                  {t('jw.dayCompleteTitle')}
                </Txt>
                <Txt variant="meta" color="greenDark2">
                  {t('jw.dayCompleteBody', { days: streak.days, bonus: rules.dayBonus })}
                </Txt>
              </View>
            ) : null}
            {error ? <Banner tone="error" message={error} /> : null}

            {n > 0 ? <StandingCard state={standing} /> : null}

            {n === 0 && !editing ? <EmptyState icon="flower-outline" title={t('jw.noPractices')} body={t('jw.noPracticesBody')} action={{ label: t('jw.choose'), onPress: () => setEditing(true) }} /> : null}

            {n > 0 ? (
              <Txt variant="meta" color="muted">
                {t('jw.remindersNote')}
              </Txt>
            ) : null}
            {selected.map((p) => {
              const isDone = d.doneIds.includes(p.id);
              const tm = timing(p);
              const reminderOn = !!reminders[p.id];
              return (
                <View key={p.id} style={{ backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radii.row, paddingVertical: 10, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: space.md }}>
                  <Pressable
                    onPress={() => toggleDone(p, isDone, d.today)}
                    disabled={busyId !== null}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: isDone, disabled: busyId !== null, busy: busyId === p.id }}
                    accessibilityLabel={isDone ? t('jw.markUndone', { name: p.name }) : t('jw.markDone', { name: p.name })}
                    style={({ pressed }) => ({
                      width: 44,
                      height: 44,
                      borderRadius: 22,
                      borderWidth: 2,
                      borderColor: colors.green,
                      backgroundColor: isDone ? colors.green : colors.card,
                      alignItems: 'center',
                      justifyContent: 'center',
                      opacity: pressed || busyId === p.id ? 0.6 : 1,
                    })}>
                    <Text style={{ fontFamily: fonts.bodyBold, fontSize: 18, color: colors.white }}>{isDone ? '✓' : ''}</Text>
                  </Pressable>
                  <View style={{ flex: 1 }}>
                    <Txt variant="body" color={isDone ? 'faint' : 'ink'} style={{ fontFamily: fonts.bodyMedium }}>
                      {p.name}
                    </Txt>
                    <Txt variant="caption" color="muted" style={{ fontFamily: fonts.body }}>
                      {`${timingLabel(tm, t)} · ${categoryLabel(p.category, t)}`}
                    </Txt>
                  </View>
                  <View style={{ backgroundColor: isDone ? colors.green : colors.brownTint, borderRadius: radii.md, paddingVertical: 4, paddingHorizontal: 8 }}>
                    <Text style={{ fontFamily: fonts.bodyBold, fontSize: 13, color: isDone ? colors.white : colors.brown }}>{t('jw.plusPoints', { points: p.points })}</Text>
                  </View>
                  <Pressable
                    onPress={() => toggleReminder(p, tm)}
                    accessibilityRole="switch"
                    accessibilityState={{ checked: reminderOn }}
                    accessibilityLabel={reminderOn ? t('jw.reminderOn', { name: p.name }) : t('jw.reminderOff', { name: p.name })}
                    hitSlop={10}
                    style={({ pressed }) => ({ width: 26, height: touch.min, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}>
                    <Icon name={reminderOn ? 'notifications' : 'notifications-outline'} size={18} color={reminderOn ? colors.navy : colors.faint} />
                  </Pressable>
                </View>
              );
            })}

            {n > 0 || editing ? (
              <Pressable
                onPress={() => setEditing(!editing)}
                accessibilityRole="button"
                style={({ pressed }) => ({
                  borderWidth: 1,
                  borderStyle: 'dashed',
                  borderColor: colors.dashed,
                  backgroundColor: colors.ground,
                  borderRadius: radii.row,
                  minHeight: touch.cta,
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: pressed ? 0.8 : 1,
                })}>
                <Txt variant="bodyStrong" color="navy">
                  {editing ? t('jw.doneAdding') : t('jw.addRemove')}
                </Txt>
              </Pressable>
            ) : null}

            {editing ? (
              <View style={{ backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radii.xl, paddingVertical: 2, paddingHorizontal: 16 }}>
                {d.catalog.map((p, i) => {
                  const isSelected = d.selected.some((s) => s.id === p.id);
                  return (
                    <View key={p.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: i < d.catalog.length - 1 ? 1 : 0, borderBottomColor: colors.divider }}>
                      <View style={{ flex: 1 }}>
                        <Txt variant="body" style={{ fontFamily: fonts.bodyMedium }}>
                          {p.name}
                        </Txt>
                        <Txt variant="caption" color="muted" style={{ fontFamily: fonts.body }}>
                          {t('jw.catalogMeta', { cat: categoryLabel(p.category, t), points: p.points, time: timingLabel(timing(p), t) })}
                        </Txt>
                      </View>
                      <Pressable
                        onPress={() => toggleSelection(p, isSelected)}
                        disabled={busyId !== null}
                        accessibilityRole="button"
                        accessibilityState={{ selected: isSelected, busy: busyId === p.id }}
                        accessibilityLabel={`${isSelected ? t('jw.added') : t('jw.add')}: ${p.name}`}
                        style={({ pressed }) => ({
                          borderWidth: 1,
                          borderColor: colors.navy,
                          backgroundColor: isSelected ? colors.navy : colors.card,
                          borderRadius: radii.xxl,
                          minHeight: touch.min,
                          paddingHorizontal: 14,
                          alignItems: 'center',
                          justifyContent: 'center',
                          opacity: pressed || busyId === p.id ? 0.7 : 1,
                        })}>
                        <Text style={{ fontFamily: fonts.bodySemi, fontSize: 13, color: isSelected ? colors.white : colors.navy }}>{isSelected ? t('jw.added') : t('jw.add')}</Text>
                      </Pressable>
                    </View>
                  );
                })}
                {d.catalog.length === 0 ? (
                  <Txt variant="small" color="muted" style={{ paddingVertical: space.md }}>
                    {t('jw.catalogEmpty')}
                  </Txt>
                ) : null}
              </View>
            ) : null}
            <Txt variant="fine" color="muted">
              {t('jw.privacyNote')}
            </Txt>
          </VStack>
        );
      }}
    </Loaded>
  );
}

/** "Your standing this month · Private to you" (prototype Main L602–612; app.my_practice_standing). */
function StandingCard({ state }: { state: LoadState<Standing[]> }) {
  const t = useT();
  if (state.error) return <ErrorState error={state.error} onRetry={() => void state.reload()} />;
  const rows = (state.data ?? []).filter((r) => r.practicesCount > 0 || r.doneToday > 0);
  if (rows.length === 0) return null;
  return (
    <Card>
      <Row style={{ justifyContent: 'space-between' }} align="baseline">
        <Txt variant="bodyStrong">{t('jw.standingTitle')}</Txt>
        <Txt variant="caption" color="muted" style={{ fontFamily: fonts.body }}>
          {t('jw.standingPrivate')}
        </Txt>
      </Row>
      {rows.map((r) => {
        const color = standingTone(r.topPercent) === 'green' ? colors.green : colors.saffron;
        const count = r.practicesCount === 1 ? t('jw.practiceOne') : t('jw.practiceMany', { n: r.practicesCount });
        return (
          <View key={r.category} style={{ gap: 5, marginTop: 4 }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Txt variant="small" style={{ fontFamily: fonts.bodyMedium, flex: 1 }}>
                {categoryLabel(r.category, t)}
              </Txt>
              {r.topPercent !== null ? (
                <Text style={{ fontFamily: fonts.bodyBold, fontSize: 14, color }}>{t('jw.standingTop', { percent: r.topPercent })}</Text>
              ) : (
                <Txt variant="caption" color="muted">
                  {t('jw.standingTooFew')}
                </Txt>
              )}
            </Row>
            <ProgressBar value={r.topPercent !== null ? (100 - r.topPercent) / 100 : 0} color={color} track={colors.divider} height={8} label={categoryLabel(r.category, t)} />
            <Txt variant="caption" color="muted" style={{ fontFamily: fonts.body }}>
              {r.doneToday ? t('jw.standingSubDone', { n: count, k: r.doneToday }) : t('jw.standingSubNone', { n: count })}
            </Txt>
          </View>
        );
      })}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Gyan Path progress (Saathi circle, Gyan Path goals). The Learn and Library
// panes became 3L · Look, Listen, Learn (src/features/three-l/).
// ---------------------------------------------------------------------------

/** The goal a person is working on now (most recent step), else their latest finished one. */
export function activeGoal(g: GyanData, personId: string): { goal: GyanGoal; p: GoalProgress } | null {
  const last = lastActivityByGoal(g, personId);
  const started = g.goals
    .filter((goal) => last.has(goal.id))
    .map((goal) => ({ goal, p: goalProgress(goal, g.progress, personId) }))
    .sort((a, b) => (last.get(b.goal.id) ?? '').localeCompare(last.get(a.goal.id) ?? ''));
  return started.find((x) => !x.p.complete) ?? started[0] ?? null;
}

// ---------------------------------------------------------------------------
// Saathi (prototype Main L662–697)
// ---------------------------------------------------------------------------

const STATUS_COLOR: Record<CircleStatus, string> = {
  met: colors.green,
  completed: colors.green,
  onTrack: colors.navy,
  behind: colors.danger,
  encouraged: colors.purple,
  private: colors.faint,
};

export function SaathiPane() {
  const t = useT();
  const { center, member } = useApp();
  const { toast } = useFeedback();
  const { invalidate } = useDataVersion();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picks, setPicks] = useState<Record<string, number>>({});
  const [together, setTogether] = useState<Record<string, boolean>>({});
  const community = communityName(center);
  const rules = pointRules(center?.rules);
  const state = useLoad(
    async () => {
      if (!center || !member) throw new Error('not signed in');
      const ids = member.members.map((m) => m.person.id);
      const [saathi, feed, gyan] = await Promise.all([
        loadSaathi(center, member),
        member.household ? loadSaathiFeed(member.household.id) : Promise.resolve([] as FeedItem[]),
        loadGyan(center, ids),
      ]);
      return { ...saathi, feed, gyan };
    },
    [center?.id, member?.person.id, member?.household?.id],
    'load your family circle',
  );

  const send = async (key: string, to: string, name: string, kind: 'celebrate' | 'support', message: string | null, onDone?: () => void) => {
    if (!center) return;
    setBusy(key);
    setError(null);
    try {
      const pts = await sendAnumodana(center.id, to, kind, message);
      onDone?.();
      invalidate();
      if (pts <= 0) toast(t('saathi.sentNoPoints', { name }));
      else if (kind === 'celebrate') toast(t('saathi.sentToast', { points: pts, center: community }));
      else if (onDone) toast(t('saathi.helpTogetherToast'));
      else toast(t('saathi.helpSentToast', { name, points: pts, center: community }));
    } catch (err) {
      setError(report(err, kind === 'support' ? 'send your encouragement' : 'send anumodana').userMessage);
    } finally {
      setBusy(null);
    }
  };

  return (
    <VStack gap={14}>
      <Txt variant="small" color="ink2" style={{ lineHeight: 21 }}>
        {t('saathi.intro', { anumodana: rules.anumodana, support: rules.support })}
      </Txt>
      {error ? <Banner tone="error" message={error} /> : null}
      <Loaded state={state}>
        {(d) => {
          if (!member) return null;
          const { celebrate, behind } = splitFeed(d.feed);
          const now = new Date();
          return (
            <VStack gap={14}>
              <Card>
                <Row style={{ justifyContent: 'space-between' }} align="baseline">
                  <Txt variant="section" style={{ fontFamily: fonts.bodyBold }}>
                    {t('saathi.circle')}
                  </Txt>
                  <Txt variant="caption" color="muted" style={{ fontFamily: fonts.body }}>
                    {t('saathi.circleSub')}
                  </Txt>
                </Row>
                {d.circle.map((m, i) => {
                  const act = m.visible ? activeGoal(d.gyan, m.personId) : null;
                  const behindItem = behind.find((b) => b.person_id === m.personId) ?? null;
                  const completedGoal = d.feed.some((f) => f.kind === 'goal_completed' && f.person_id === m.personId);
                  const status = circleStatus({ visible: m.visible, doneToday: m.doneToday, selected: m.selected, behind: behindItem, completedGoal });
                  const days = behindItem ? behindDays(behindItem.detail) : null;
                  const statusLabel = status === 'behind' ? (days ? t('saathi.status.behind', { n: days }) : t('saathi.status.behindUnknown')) : t(`saathi.status.${status}`);
                  const goalLine = act
                    ? act.p.complete
                      ? t(act.p.levelsTotal === 1 ? 'saathi.goalLineDoneOne' : 'saathi.goalLineDone', { goal: act.goal.name, n: act.p.levelsTotal })
                      : t('saathi.goalLine', { goal: act.goal.name, level: act.p.levelsDone + 1, n: act.p.levelsTotal })
                    : null;
                  const daily = m.selected > 0 ? t('saathi.dailyLine', { done: m.doneToday, n: m.selected }) : t('saathi.noPractices');
                  const streakPart = m.streakDays > 0 ? t('saathi.streakPart', { days: m.streakDays }) : null;
                  const line = !m.visible ? t('saathi.private') : goalLine ? [goalLine, m.selected > 0 ? daily : null].filter(Boolean).join(' · ') : [daily, streakPart].filter(Boolean).join(' · ');
                  const pct = !m.visible ? 0 : act ? (act.p.levelsTotal ? act.p.levelsDone / act.p.levelsTotal : 0) : m.selected ? m.doneToday / m.selected : 0;
                  return (
                    <View key={m.personId} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }} accessible accessibilityLabel={`${m.isMe ? t('saathi.you') : m.name}: ${statusLabel}. ${line}`}>
                      <InitialAvatar name={m.name} color={MEMBER_COLORS[i % MEMBER_COLORS.length]} />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Row style={{ justifyContent: 'space-between' }} gap={6}>
                          <Txt variant="smallStrong" style={{ flexShrink: 1 }}>
                            {m.isMe ? t('saathi.you') : m.name}
                          </Txt>
                          <Text style={{ fontFamily: fonts.bodyBold, fontSize: 11, color: STATUS_COLOR[status] }}>{statusLabel}</Text>
                        </Row>
                        <Txt variant="caption" color="muted" numberOfLines={1} style={{ fontFamily: fonts.body }}>
                          {line}
                        </Txt>
                        <View style={{ marginTop: 4 }}>
                          <ProgressBar value={pct} color={STATUS_COLOR[status]} track={colors.divider} height={5} />
                        </View>
                      </View>
                    </View>
                  );
                })}
              </Card>

              {celebrate.map((c) => {
                const w = relativeWhen(c.occurred_at, now, center?.time_zone);
                const key = `c:${c.person_id}:${c.occurred_at}`;
                const headline =
                  c.kind === 'goal_completed'
                    ? t(/^1 levels?$/.test(c.detail) ? 'saathi.headlineGoalOne' : 'saathi.headlineGoal', { name: c.person_name, title: c.title.charAt(0).toLowerCase() + c.title.slice(1), detail: c.detail })
                    : t('saathi.headlineDaily', { name: c.person_name, detail: c.detail });
                const others = c.i_sent
                  ? t('saathi.othersSentMine', { points: rules.anumodana, center: community })
                  : c.anumodana_count > 1
                    ? t('saathi.othersSentMany', { n: c.anumodana_count })
                    : c.anumodana_count === 1
                      ? t('saathi.othersSentOne')
                      : t('saathi.beFirst');
                return (
                  <View key={key} style={{ backgroundColor: colors.celebrateBg, borderWidth: 1, borderColor: colors.celebrateBorder, borderRadius: radii.xl, paddingVertical: 14, paddingHorizontal: 16, gap: space.sm }}>
                    <Row style={{ justifyContent: 'space-between' }}>
                      <Text style={{ fontFamily: fonts.bodyBold, fontSize: 12, letterSpacing: 0.5, color: colors.brown }}>{t('saathi.celebrate', { when: t(w.key, { n: w.n ?? 0 }) }).toUpperCase()}</Text>
                      <Txt variant="caption" color="muted" style={{ fontFamily: fonts.body }}>
                        {c.kind === 'goal_completed' ? t('saathi.tagLearning') : t('saathi.tagDaily')}
                      </Txt>
                    </Row>
                    <Txt variant="headline" style={{ fontSize: 18, lineHeight: 23 }}>
                      {headline}
                    </Txt>
                    <Txt variant="caption" color="brownText" style={{ fontFamily: fonts.body }}>
                      {others}
                    </Txt>
                    <Pressable
                      onPress={() => {
                        if (!c.i_sent) void send(key, c.person_id, c.person_name, 'celebrate', null);
                      }}
                      disabled={c.i_sent || busy !== null}
                      accessibilityRole="button"
                      accessibilityState={{ disabled: c.i_sent || busy !== null, busy: busy === key }}
                      style={({ pressed }) => ({ backgroundColor: c.i_sent ? colors.green : colors.saffron, borderRadius: radii.pill, minHeight: 46, alignItems: 'center', justifyContent: 'center', opacity: pressed || busy === key ? 0.8 : 1 })}>
                      <Txt variant="smallStrong" color="white" style={{ fontFamily: fonts.bodyBold }}>
                        {c.i_sent ? t('saathi.sentCta') : t('saathi.sendCta', { points: rules.anumodana })}
                      </Txt>
                    </Pressable>
                  </View>
                );
              })}

              {member.isAdult
                ? behind.map((b) => {
                    const key = `s:${b.person_id}`;
                    const days = behindDays(b.detail);
                    const msgs = [t('saathi.helpMsg1', { name: b.person_name }), t('saathi.helpMsg2'), t('saathi.helpMsg3')];
                    const pick = picks[b.person_id];
                    return (
                      <View key={key} style={{ backgroundColor: colors.card, borderWidth: 2, borderColor: colors.purple, borderRadius: radii.xl, paddingVertical: 14, paddingHorizontal: 16, gap: 10 }}>
                        <Text style={{ fontFamily: fonts.bodyBold, fontSize: 12, letterSpacing: 0.5, color: colors.purple }}>{t('saathi.helpEyebrow', { name: b.person_name }).toUpperCase()}</Text>
                        <Txt variant="headline" style={{ fontSize: 18, lineHeight: 23 }}>
                          {days ? t('saathi.helpHeadline', { name: b.person_name, n: days }) : t('saathi.helpHeadlineNoDays', { name: b.person_name })}
                        </Txt>
                        <Txt variant="meta" color="muted">
                          {t('saathi.helpBody', { name: b.person_name })}
                        </Txt>
                        {b.i_sent ? (
                          <View style={{ backgroundColor: colors.purpleTint, borderRadius: radii.lg, paddingVertical: 10, paddingHorizontal: 12 }} accessibilityLiveRegion="polite">
                            <Txt variant="meta" color="purpleDark" style={{ fontFamily: fonts.bodySemi }}>
                              {together[b.person_id]
                                ? t('saathi.helpTogetherText', { name: b.person_name, points: rules.support, center: community })
                                : t('saathi.helpSentText', { name: b.person_name, points: rules.support, center: community })}
                            </Txt>
                          </View>
                        ) : (
                          <VStack gap={6}>
                            {msgs.map((msg, mi) => (
                              <Pressable
                                key={mi}
                                onPress={() => setPicks({ ...picks, [b.person_id]: mi })}
                                accessibilityRole="radio"
                                accessibilityState={{ selected: pick === mi }}
                                style={{ borderWidth: 2, borderColor: pick === mi ? colors.purple : colors.borderInput, backgroundColor: pick === mi ? colors.purpleTint : colors.card, borderRadius: radii.card, minHeight: 48, paddingVertical: 8, paddingHorizontal: 12, justifyContent: 'center' }}>
                                <Txt variant="meta" style={{ fontFamily: fonts.bodyMedium }}>
                                  {msg}
                                </Txt>
                              </Pressable>
                            ))}
                            <Row gap={space.sm} style={{ paddingTop: 4 }}>
                              <Pressable
                                onPress={() => {
                                  if (pick === undefined) setError(t('saathi.helpPick'));
                                  else void send(key, b.person_id, b.person_name, 'support', msgs[pick]);
                                }}
                                disabled={busy !== null}
                                accessibilityRole="button"
                                accessibilityState={{ busy: busy === key }}
                                style={({ pressed }) => ({ flex: 1, backgroundColor: colors.purple, borderRadius: radii.pill, minHeight: 46, alignItems: 'center', justifyContent: 'center', opacity: pressed || busy === key ? 0.8 : 1 })}>
                                <Txt variant="smallStrong" color="white" style={{ fontFamily: fonts.bodyBold }}>
                                  {t('saathi.helpSend', { points: rules.support })}
                                </Txt>
                              </Pressable>
                              <Pressable
                                onPress={() => void send(`${key}:t`, b.person_id, b.person_name, 'support', t('saathi.helpTogetherMsg'), () => setTogether({ ...together, [b.person_id]: true }))}
                                disabled={busy !== null}
                                accessibilityRole="button"
                                accessibilityState={{ busy: busy === `${key}:t` }}
                                style={({ pressed }) => ({ flex: 1, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.purple, borderRadius: radii.pill, minHeight: 46, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6, opacity: pressed || busy === `${key}:t` ? 0.8 : 1 })}>
                                <Txt variant="meta" color="purple" center style={{ fontFamily: fonts.bodyBold }}>
                                  {t('saathi.helpTogether')}
                                </Txt>
                              </Pressable>
                            </Row>
                          </VStack>
                        )}
                      </View>
                    );
                  })
                : null}

              <Card tone="purple">
                <Txt variant="section" color="purpleDark">
                  {t('saathi.received')}
                </Txt>
                {d.received.length === 0 ? (
                  <Txt variant="small" color="muted">
                    {t('saathi.noneReceived')}
                  </Txt>
                ) : (
                  d.received.slice(0, 10).map((a) => (
                    <View key={a.id}>
                      <Txt variant="small" color="purpleDark">
                        {a.kind === 'support' ? t('saathi.receivedSupport', { name: a.fromName }) : t('saathi.receivedCelebrate', { name: a.fromName })}
                      </Txt>
                      {a.message ? (
                        <Txt variant="meta" color="muted">
                          {`“${a.message}”`}
                        </Txt>
                      ) : null}
                    </View>
                  ))
                )}
              </Card>
            </VStack>
          );
        }}
      </Loaded>
    </VStack>
  );
}

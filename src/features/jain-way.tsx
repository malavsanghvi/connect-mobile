import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Icon } from '@/components/icon';
import { EmptyState, ErrorState, Loaded, LoadingState } from '@/components/states';
import { Banner, Button, Card, Chevron, Divider, ProgressBar, Row, Txt, VStack } from '@/components/ui';
import { goalProgress, loadGyan, loadPathshala, type GoalProgress, type GyanData, type GyanGoal } from '@/lib/api/gyan';
import { loadToday } from '@/lib/api/home';
import {
  addPractice,
  listContent,
  loadJainWayToday,
  loadSaathi,
  loadSaathiFeed,
  loadStanding,
  logPractice,
  removePractice,
  sendAnumodana,
  unlogPractice,
  type ContentItem,
  type Practice,
  type Standing,
} from '@/lib/api/jainway';
import { logError, report } from '@/lib/errors';
import { formatDay, formatTimeOfDay, weekdayOf } from '@/lib/format';
import {
  behindDays,
  categoryLabel,
  circleStatus,
  communityName,
  continueGoalId,
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
import { LEARN_PART_MODULE } from '@/lib/modules';
import { useLoad, type LoadState } from '@/lib/use-load';
import { useApp } from '@/providers/app';
import { useDataVersion } from '@/providers/data-version';
import { useFeedback } from '@/providers/feedback';
import { useModules } from '@/providers/modules';
import { useT } from '@/providers/settings';
import { colors, fonts, radii, space, touch } from '@/theme';

import { clock, useInAppAudio } from './audio';
import { FlameGlyph, InitialAvatar, MEMBER_COLORS, PlayGlyph } from './gyan-ui';

const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const REMINDER_PREF = 'practiceReminders';

type T = ReturnType<typeof useT>;

function timingLabel(tm: PracticeTiming, t: T): string {
  if (tm.kind === 'by') return t('jw.byTime', { time: tm.label });
  if (tm.kind === 'before') return t('jw.beforeTime', { time: tm.label });
  if (tm.kind === 'anytime') return t('jw.anytime');
  return tm.label;
}

function meta(item: ContentItem): Record<string, unknown> {
  return item.metadata && typeof item.metadata === 'object' && !Array.isArray(item.metadata) ? (item.metadata as Record<string, unknown>) : {};
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
// Learn (prototype Main L636–659)
// ---------------------------------------------------------------------------

/** When the person last completed a step in each goal. */
function lastActivityByGoal(g: GyanData, personId: string): Map<string, string> {
  const last = new Map<string, string>();
  for (const goal of g.goals) {
    const stepIds = new Set(goal.levels.flatMap((l) => l.steps.map((s) => s.id)));
    const latest = g.progress
      .filter((pr) => pr.person_id === personId && pr.completed_at && stepIds.has(pr.step_id))
      .map((pr) => pr.completed_at as string)
      .sort()
      .pop();
    if (latest) last.set(goal.id, latest);
  }
  return last;
}

/** The goal a person is working on now (most recent step), else their latest finished one. */
export function activeGoal(g: GyanData, personId: string): { goal: GyanGoal; p: GoalProgress } | null {
  const last = lastActivityByGoal(g, personId);
  const started = g.goals
    .filter((goal) => last.has(goal.id))
    .map((goal) => ({ goal, p: goalProgress(goal, g.progress, personId) }))
    .sort((a, b) => (last.get(b.goal.id) ?? '').localeCompare(last.get(a.goal.id) ?? ''));
  return started.find((x) => !x.p.complete) ?? started[0] ?? null;
}

export function LearnPane() {
  const t = useT();
  const router = useRouter();
  const { center, member } = useApp();
  // Gyan Path, Pathshala and the audio lessons (Library content) are separate modules.
  const { isOn } = useModules();
  const gyanOn = isOn(LEARN_PART_MODULE.gyan);
  const pathshalaOn = isOn(LEARN_PART_MODULE.pathshala);
  const lessonsOn = isOn(LEARN_PART_MODULE.lessons);
  const gyan = useLoad(
    () => (!gyanOn ? Promise.resolve(null) : center && member ? loadGyan(center, [member.person.id]) : Promise.reject(new Error('no center'))),
    [center?.id, member?.person.id, gyanOn],
    'load Gyan Path',
  );
  const pathshala = useLoad(() => (pathshalaOn && member?.household ? loadPathshala(member.household.id) : Promise.resolve([])), [member?.household?.id, pathshalaOn], 'load Pathshala');
  const lessons = useLoad(() => (lessonsOn && center ? listContent(center.id, 'audio_lesson') : Promise.resolve([])), [center?.id, lessonsOn], 'load lessons');
  const audio = useInAppAudio(t('learn.audioFailed'));
  const minutes = member?.person.gyan_daily_minutes ?? null;

  return (
    <VStack gap={14}>
      <Loaded state={gyan}>
        {(g) => {
          if (!member || !g) return null;
          if (g.goals.length === 0) return <EmptyState icon="school-outline" title={t('learn.noGoals')} body={t('learn.noGoalsBody')} />;
          const id = continueGoalId(g.goals, lastActivityByGoal(g, member.person.id), (goal) => goalProgress(goal, g.progress, member.person.id).complete);
          const goal = g.goals.find((x) => x.id === id) ?? g.goals[0];
          const p = goalProgress(goal, g.progress, member.person.id);
          const levelNo = Math.min(p.levelsDone + 1, Math.max(p.levelsTotal, 1));
          const eyebrow = p.complete ? t('learn.heroEyebrowDone') : t('learn.heroEyebrow', { level: levelNo, n: p.levelsTotal });
          const title = p.currentLevel ? `${goal.name} · ${p.currentLevel.name}` : goal.name;
          const sub = p.stepsDone === 0 ? t('learn.heroStart') : minutes ? t('learn.heroContinue', { min: minutes }) : t('learn.heroContinueNoGoal');
          return (
            <Pressable
              onPress={() => router.push('/gyan')}
              accessibilityRole="button"
              accessibilityLabel={`${eyebrow}. ${title}. ${sub}`}
              style={({ pressed }) => ({ backgroundColor: colors.navy, borderRadius: radii.xxl, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14, opacity: pressed ? 0.92 : 1 })}>
              <View style={{ backgroundColor: colors.brown, borderRadius: 18, paddingBottom: 4 }}>
                <View style={{ width: 56, height: 56, borderRadius: 18, backgroundColor: colors.badge, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontFamily: fonts.displayBold, fontSize: 24, color: colors.white }}>{String(levelNo)}</Text>
                </View>
              </View>
              <View style={{ flex: 1, gap: 1 }}>
                <Txt variant="eyebrow" color="gold">
                  {eyebrow}
                </Txt>
                <Txt variant="headline" color="white" style={{ fontSize: 18, lineHeight: 24 }}>
                  {title}
                </Txt>
                <Txt variant="caption" color="onNavy" style={{ fontFamily: fonts.body }}>
                  {sub}
                </Txt>
              </View>
              <Text style={{ fontSize: 22, color: colors.onNavy }}>{'›'}</Text>
            </Pressable>
          );
        }}
      </Loaded>

      {pathshalaOn ? <Txt variant="section">{t('learn.pathshala')}</Txt> : null}
      {pathshalaOn ? (
        <Loaded state={pathshala}>
          {(rows) =>
            rows.length === 0 ? (
              <EmptyState icon="school-outline" title={t('learn.noEnrollments')} body={t('learn.noEnrollmentsBody')} />
            ) : (
              <Card>
                {rows.map((r, i) => {
                  const student = member?.members.find((m) => m.person.id === r.student_person_id);
                  const name = student?.person.preferred_name || student?.person.first_name || '';
                  const level = r.levelName ?? r.className ?? r.termName ?? '';
                  const enrolled = r.status === 'placed' || r.status === 'active';
                  const pending = r.status === 'requested' || r.status === 'waitlisted';
                  const canScan = !!student && enrolled && (student.person.id === member?.person.id || !!member?.isAdult);
                  const statusLabel = t(`enroll.${r.status}` as 'enroll.requested');
                  return (
                    <View key={r.id} style={{ gap: 6 }}>
                      {i > 0 ? <Divider /> : null}
                      {pending ? (
                        <Text style={{ fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: colors.muted }}>
                          {`${[name, level, statusLabel].filter(Boolean).join(' · ')} · `}
                          <Text onPress={() => router.push('/guide/ask')} accessibilityRole="link" style={{ color: colors.navy, textDecorationLine: 'underline' }}>
                            {t('learn.completeEnrollment')}
                          </Text>
                        </Text>
                      ) : (
                        <>
                          <Row style={{ justifyContent: 'space-between' }}>
                            <Txt variant="bodyStrong" style={{ flex: 1 }}>
                              {[name, level].filter(Boolean).join(' · ')}
                            </Txt>
                            <Txt variant="meta" color={enrolled || r.status === 'completed' ? 'green' : 'muted'} style={{ fontFamily: fonts.bodySemi }}>
                              {statusLabel}
                            </Txt>
                          </Row>
                          {enrolled ? (
                            <Txt variant="meta" color="muted">
                              {[r.schedule, t('learn.attendanceByQr')].filter(Boolean).join(' · ')}
                            </Txt>
                        ) : null}
                      </>
                    )}
                    {canScan ? (
                      <Button
                        label={t('learn.scanAttendance')}
                        tone="secondary"
                        size="sm"
                        icon="qr-code-outline"
                        fill={false}
                        onPress={() => router.push({ pathname: '/pathshala-scan', params: { person: r.student_person_id } })}
                      />
                    ) : null}
                  </View>
                );
              })}
            </Card>
          )
        }
      </Loaded>
      ) : null}

      {lessonsOn ? <Txt variant="section">{t('learn.listen')}</Txt> : null}
      {audio.error ? <Banner tone="error" message={audio.error} /> : null}
      {lessonsOn ? (
        <Loaded state={lessons}>
          {(items) =>
            items.length === 0 ? (
              <Txt variant="small" color="muted">
                {t('learn.noLessons')}
              </Txt>
            ) : (
              <VStack gap={space.sm}>
                {items.map((c) => {
                  const m = meta(c);
                  const mins = typeof m.minutes === 'number' ? `${m.minutes} min` : typeof m.duration === 'string' ? m.duration : null;
                  const sub = [typeof m.course === 'string' ? m.course : null, mins].filter(Boolean).join(' · ');
                  const isCurrent = audio.current === c.id;
                  const playing = isCurrent && audio.playing;
                  const url = c.media_url;
                  return (
                    <Pressable
                      key={c.id}
                      disabled={!url}
                      onPress={() => {
                        if (url) audio.toggle(c.id, url);
                      }}
                      accessibilityRole="button"
                      accessibilityState={{ disabled: !url, selected: playing }}
                      accessibilityLabel={[c.title, sub, !url ? t('learn.lessonNoAudio') : null].filter(Boolean).join('. ')}
                      style={({ pressed }) => ({ backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radii.row, paddingVertical: 12, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: space.md, opacity: pressed ? 0.85 : 1 })}>
                      <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.panel, alignItems: 'center', justifyContent: 'center' }}>
                        <PlayGlyph size={18} paused={playing} color={url ? colors.navy : colors.faint} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Txt variant="body" style={{ fontFamily: fonts.bodyMedium }}>
                          {c.title}
                        </Txt>
                        <Txt variant="caption" color="muted" style={{ fontFamily: fonts.body }}>
                          {!url ? t('learn.lessonNoAudio') : isCurrent && (audio.playing || audio.position > 0) ? t('learn.playing', { time: clock(audio.position) }) : sub}
                        </Txt>
                      </View>
                    </Pressable>
                  );
                })}
              </VStack>
            )
          }
        </Loaded>
      ) : null}
    </VStack>
  );
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
                      ? t('saathi.goalLineDone', { goal: act.goal.name, n: act.p.levelsTotal })
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
                    ? t('saathi.headlineGoal', { name: c.person_name, title: c.title.charAt(0).toLowerCase() + c.title.slice(1), detail: c.detail })
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

// ---------------------------------------------------------------------------
// Library (prototype Main L700–720)
// ---------------------------------------------------------------------------

export function LibraryPane() {
  const t = useT();
  const router = useRouter();
  const { center } = useApp();
  const community = communityName(center);
  const pach = useLoad(() => (center ? listContent(center.id, 'pachchakhan') : Promise.resolve([])), [center?.id], 'load the pachchakhan library');
  const today = useLoad(() => (center ? loadToday(center) : Promise.reject(new Error('no center'))), [center?.id], 'load live darshan');
  const darshan = today.data?.darshan ?? null;
  const aarti = today.data?.timings?.aarti ? formatTimeOfDay(today.data.timings.aarti) : null;
  const [openError, setOpenError] = useState<string | null>(null);

  const openDarshan = async () => {
    if (!darshan) return;
    setOpenError(null);
    try {
      await WebBrowser.openBrowserAsync(darshan.url);
    } catch (err) {
      setOpenError(report(err, 'open the live darshan').userMessage);
    }
  };

  return (
    <VStack gap={14}>
      <Txt variant="small" color="ink2" style={{ lineHeight: 21 }}>
        {t('library.intro', { center: community })}
      </Txt>
      {today.error && !today.data ? (
        <ErrorState error={today.error} onRetry={() => void today.reload()} />
      ) : today.loading && !today.data ? (
        <LoadingState />
      ) : (
        <View style={{ height: 196, borderRadius: radii.xxl, backgroundColor: colors.videoTile, alignItems: 'center', justifyContent: 'center' }}>
          {darshan ? (
            <>
              <View style={{ position: 'absolute', top: 12, left: 12, backgroundColor: colors.live, borderRadius: radii.sm, paddingVertical: 3, paddingHorizontal: 8 }}>
                <Text style={{ fontFamily: fonts.bodyBold, fontSize: 12, color: colors.white }}>{t('library.live').toUpperCase()}</Text>
              </View>
              <Text style={{ position: 'absolute', bottom: 12, left: 14, right: 14, fontFamily: fonts.body, fontSize: 13, color: colors.frame }} numberOfLines={1}>
                {aarti ? t('library.darshanCaption', { title: darshan.title, time: aarti }) : darshan.title}
              </Text>
              <Pressable
                onPress={openDarshan}
                accessibilityRole="button"
                accessibilityLabel={t('library.darshanPlay')}
                style={({ pressed }) => ({ width: 64, height: 64, borderRadius: 32, backgroundColor: colors.ground, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.85 : 1 })}>
                <PlayGlyph size={26} />
              </Pressable>
            </>
          ) : (
            <View style={{ alignItems: 'center', gap: 4, paddingHorizontal: space.lg }} accessible>
              <Text style={{ fontFamily: fonts.bodySemi, fontSize: 15, color: colors.frame }}>{t('library.darshanOffline')}</Text>
              {aarti ? <Text style={{ fontFamily: fonts.body, fontSize: 13, color: colors.lockMeta }}>{t('library.darshanOfflineSub', { time: aarti })}</Text> : null}
            </View>
          )}
        </View>
      )}
      {openError ? <Banner tone="error" message={openError} /> : null}
      <Txt variant="section">{t('library.pachchakhan')}</Txt>
      <Loaded state={pach}>
        {(items) =>
          items.length === 0 ? (
            <EmptyState icon="book-outline" title={t('library.none')} />
          ) : (
            <View style={{ backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radii.xl, paddingVertical: 2, paddingHorizontal: 16 }}>
              {items.map((c, i) => {
                const when = typeof meta(c).when === 'string' ? (meta(c).when as string) : null;
                return (
                  <Pressable
                    key={c.id}
                    onPress={() => router.push({ pathname: '/pachchakhan/[id]', params: { id: c.id } })}
                    accessibilityRole="button"
                    accessibilityLabel={when ? `${c.title}. ${when}` : c.title}
                    style={({ pressed }) => ({ minHeight: touch.row, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: i < items.length - 1 ? 1 : 0, borderBottomColor: colors.divider, opacity: pressed ? 0.7 : 1 })}>
                    <View style={{ flex: 1 }}>
                      <Txt variant="body" style={{ fontFamily: fonts.bodyMedium }}>
                        {c.title}
                      </Txt>
                      {when ? (
                        <Txt variant="caption" color="muted" style={{ fontFamily: fonts.body }}>
                          {when}
                        </Txt>
                      ) : null}
                    </View>
                    <Chevron />
                  </Pressable>
                );
              })}
            </View>
          )
        }
      </Loaded>
      <Pressable
        onPress={() => router.push('/guide')}
        accessibilityRole="button"
        accessibilityLabel={`${t('library.guide', { center: community })}. ${t('library.guideSub')}`}
        style={({ pressed }) => ({ backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radii.xxl, paddingVertical: 14, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: space.md, opacity: pressed ? 0.85 : 1 })}>
        <View style={{ width: 44, height: 44, borderRadius: radii.card, backgroundColor: colors.navyTint, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontFamily: fonts.bodyBold, fontSize: 18, color: colors.navy }}>i</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Txt variant="body" style={{ fontFamily: fonts.bodySemi }}>
            {t('library.guide', { center: community })}
          </Txt>
          <Txt variant="caption" color="muted" style={{ fontFamily: fonts.body }}>
            {t('library.guideSub')}
          </Txt>
        </View>
        <Chevron />
      </Pressable>
    </VStack>
  );
}

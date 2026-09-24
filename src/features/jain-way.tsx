import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Icon } from '@/components/icon';
import { EmptyState, ErrorState, Loaded, LoadingState } from '@/components/states';
import { Avatar, Banner, Button, Card, Divider, ListRow, Pill, ProgressBar, Row, SectionTitle, Txt, VStack } from '@/components/ui';
import { goalProgress, loadGyan, loadPathshala } from '@/lib/api/gyan';
import { loadToday } from '@/lib/api/home';
import { addPractice, listContent, loadJainWayToday, loadSaathi, logPractice, removePractice, sendAnumodana, type Practice } from '@/lib/api/jainway';
import { report } from '@/lib/errors';
import { formatDay, weekdayOf } from '@/lib/format';
import { streakDisplay, streakLabel, tithiLabel } from '@/lib/rules';
import { useLoad } from '@/lib/use-load';
import { useApp } from '@/providers/app';
import { useDataVersion } from '@/providers/data-version';
import { useFeedback } from '@/providers/feedback';
import { useT } from '@/providers/settings';
import { colors, radii, space, touch } from '@/theme';

const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function practiceSub(p: Practice): string {
  return [p.default_minutes ? `${p.default_minutes} min` : null, p.category.charAt(0).toUpperCase() + p.category.slice(1)].filter(Boolean).join(' · ');
}

// ---------------------------------------------------------------------------
// Today
// ---------------------------------------------------------------------------

export function TodayPane() {
  const t = useT();
  const { center, member } = useApp();
  const { toast } = useFeedback();
  const { invalidate } = useDataVersion();
  const [editing, setEditing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const state = useLoad(
    async () => {
      if (!center || !member) throw new Error('not signed in');
      const [way, today] = await Promise.all([loadJainWayToday(center, member.person.id), loadToday(center)]);
      return { ...way, tithi: today.tithi };
    },
    [center?.id, member?.person.id],
    'load My Jain Way',
  );

  const tick = async (practiceId: string, today: string) => {
    if (!center) return;
    setBusyId(practiceId);
    setError(null);
    try {
      const res = await logPractice(center.id, practiceId, today);
      invalidate();
      toast(res.dayComplete ? t('jw.dayCompleteToast', { points: res.pointsAwarded, days: res.streakDays }) : t('jw.pointsToast', { points: res.pointsAwarded }));
    } catch (err) {
      setError(report(err, 'log this practice').userMessage);
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

  return (
    <Loaded state={state}>
      {(d) => {
        const n = d.selected.length;
        const done = d.doneIds.length;
        const streak = streakDisplay(d.streak, d.today);
        const allDone = n > 0 && done >= n;
        return (
          <VStack gap={space.lg}>
            <Card tone="navy">
              <Txt variant="small" color="onNavy">
                {d.tithi ? t('jw.todayTithi', { tithi: tithiLabel(d.tithi) }) : t('jw.todayDate', { date: formatDay(d.today) })}
              </Txt>
              <Row style={{ justifyContent: 'space-between' }} align="flex-end">
                <Txt variant="display" color="white" accessibilityRole="header">
                  {t('home.doneOf', { done, n })}
                </Txt>
                <View style={{ alignItems: 'flex-end' }}>
                  <Txt variant="caption" color="onNavy">
                    {t('jw.points')}
                  </Txt>
                  <Txt variant="section" color="white">
                    {d.pointsTotal.toLocaleString('en-US')}
                  </Txt>
                  <Txt variant="caption" color="onNavyGreen">
                    {t('jw.pointsToday', { points: d.pointsToday })}
                  </Txt>
                </View>
              </Row>
              <ProgressBar value={n ? done / n : 0} color={colors.onNavyGreen} track={colors.navyPanel} label={t('home.doneOf', { done, n })} />
              <Row gap={space.xs}>
                <Icon name="flame" size={20} color={colors.flame} />
                <View style={{ flex: 1 }}>
                  <Txt variant="smallStrong" color="white">
                    {streakLabel(streak.days)}
                  </Txt>
                  <Txt variant="caption" color="onNavy">
                    {streak.completedToday ? t('jw.bestStreak', { best: streak.best }) : streak.atRisk ? t('jw.keepStreak', { days: streak.days + 1 }) : t('jw.startStreak')}
                  </Txt>
                </View>
              </Row>
              <Row style={{ justifyContent: 'space-between' }}>
                {d.week.map((w) => (
                  <View key={w.date} style={{ alignItems: 'center', gap: 4 }} accessibilityLabel={`${formatDay(w.date)}: ${w.complete ? t('jw.dayComplete') : w.any ? t('jw.dayPartial') : t('jw.dayNone')}`}>
                    <Txt variant="caption" color="onNavy">
                      {DOW[weekdayOf(w.date)]}
                    </Txt>
                    <View style={{ width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: w.complete ? colors.green : w.any ? colors.navyPanel : 'transparent', borderWidth: 1.5, borderColor: w.complete ? colors.green : colors.onNavy }}>
                      {w.complete ? <Icon name="checkmark" size={16} color={colors.white} /> : null}
                    </View>
                  </View>
                ))}
              </Row>
            </Card>

            {allDone ? <Banner tone="success" title={t('jw.dayCompleteTitle')} message={t('jw.dayCompleteBody', { days: streak.days })} /> : null}
            {error ? <Banner tone="error" message={error} /> : null}

            {n === 0 && !editing ? <EmptyState icon="flower-outline" title={t('jw.noPractices')} body={t('jw.noPracticesBody')} action={{ label: t('jw.choose'), onPress: () => setEditing(true) }} /> : null}

            {!editing && n > 0 ? (
              <Card>
                {d.selected.map((p, i) => {
                  const isDone = d.doneIds.includes(p.id);
                  return (
                    <View key={p.id}>
                      {i > 0 ? <Divider /> : null}
                      <Pressable
                        onPress={() => !isDone && tick(p.id, d.today)}
                        disabled={isDone || busyId !== null}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: isDone, disabled: isDone || busyId !== null }}
                        accessibilityLabel={`${p.name}, ${t('jw.plusPoints', { points: p.points })}`}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: touch.row, paddingVertical: space.sm }}>
                        <View style={{ width: 32, height: 32, borderRadius: 16, borderWidth: 2, borderColor: isDone ? colors.green : colors.dashed, backgroundColor: isDone ? colors.green : colors.card, alignItems: 'center', justifyContent: 'center' }}>
                          {isDone ? <Icon name="checkmark" size={18} color={colors.white} /> : null}
                        </View>
                        <View style={{ flex: 1 }}>
                          <Txt variant="bodyStrong" color={isDone ? 'muted' : 'ink'}>
                            {p.name}
                          </Txt>
                          <Txt variant="meta" color="muted">
                            {practiceSub(p)}
                          </Txt>
                        </View>
                        <Pill label={t('jw.plusPoints', { points: p.points })} tone={isDone ? 'green' : 'amber'} />
                      </Pressable>
                    </View>
                  );
                })}
              </Card>
            ) : null}

            {editing ? (
              <Card>
                <Txt variant="section">{t('jw.catalog')}</Txt>
                {d.catalog.map((p) => {
                  const selected = d.selected.some((s) => s.id === p.id);
                  return (
                    <Row key={p.id} gap={space.md} style={{ minHeight: touch.row }}>
                      <View style={{ flex: 1 }}>
                        <Txt variant="bodyStrong">{p.name}</Txt>
                        <Txt variant="meta" color="muted">
                          {`${practiceSub(p)} · ${t('jw.plusPoints', { points: p.points })}`}
                        </Txt>
                      </View>
                      <Button label={selected ? t('jw.added') : t('jw.add')} tone={selected ? 'green' : 'secondary'} size="sm" fill={false} busy={busyId === p.id} onPress={() => toggleSelection(p, selected)} />
                    </Row>
                  );
                })}
                {d.catalog.length === 0 ? (
                  <Txt variant="small" color="muted">
                    {t('jw.catalogEmpty')}
                  </Txt>
                ) : null}
              </Card>
            ) : null}
            {n > 0 || editing ? <Button label={editing ? t('jw.doneAdding') : t('jw.addRemove')} tone="secondary" icon={editing ? 'checkmark' : 'add'} onPress={() => setEditing(!editing)} /> : null}
            <Txt variant="meta" color="muted">
              {t('jw.remindersNote')}
            </Txt>
          </VStack>
        );
      }}
    </Loaded>
  );
}

// ---------------------------------------------------------------------------
// Learn
// ---------------------------------------------------------------------------

export function LearnPane() {
  const t = useT();
  const router = useRouter();
  const { center, member } = useApp();
  const people = member ? (member.isAdult ? member.members.map((m) => m.person.id) : [member.person.id]) : [];
  const gyan = useLoad(() => (center ? loadGyan(center, people) : Promise.reject(new Error('no center'))), [center?.id, people.join(',')], 'load Gyan Path');
  const pathshala = useLoad(() => (member?.household ? loadPathshala(member.household.id) : Promise.resolve([])), [member?.household?.id], 'load Pathshala');
  const lessons = useLoad(() => (center ? listContent(center.id, 'audio_lesson') : Promise.resolve([])), [center?.id], 'load lessons');

  const openLesson = async (url: string | null) => {
    if (!url) return;
    try {
      await WebBrowser.openBrowserAsync(url);
    } catch (err) {
      report(err, 'open this lesson');
    }
  };

  return (
    <VStack gap={space.lg}>
      <SectionTitle>{t('learn.gyanPath')}</SectionTitle>
      <Loaded state={gyan}>
        {(g) => {
          if (!member) return null;
          if (g.goals.length === 0) return <EmptyState icon="school-outline" title={t('learn.noGoals')} body={t('learn.noGoalsBody')} />;
          const children = member.isAdult ? member.members.filter((m) => !m.isAdult) : [];
          return (
            <VStack gap={space.md}>
              {g.goals.map((goal) => {
                const p = goalProgress(goal, g.progress, member.person.id);
                const line = p.complete ? t('learn.complete') : p.levelsDone === 0 && p.stepsDone === 0 ? t('learn.notStarted', { n: p.levelsTotal }) : t('learn.levelOf', { level: p.levelsDone + 1, n: p.levelsTotal });
                return (
                  <Card key={goal.id} onPress={() => router.push({ pathname: '/gyan/[goalId]', params: { goalId: goal.id } })} accessibilityLabel={`${goal.name}. ${line}`}>
                    <Row gap={space.md}>
                      <View style={{ width: 48, height: 48, borderRadius: radii.lg, backgroundColor: colors.purpleTint, alignItems: 'center', justifyContent: 'center' }}>
                        <Txt variant="headline" color="purple">
                          {String(Math.min(p.levelsDone + 1, Math.max(p.levelsTotal, 1)))}
                        </Txt>
                      </View>
                      <View style={{ flex: 1, gap: 2 }}>
                        <Txt variant="cardTitle">{goal.name}</Txt>
                        <Txt variant="meta" color="muted">
                          {line}
                        </Txt>
                      </View>
                      <Icon name="chevron-forward" size={18} color={colors.faint} />
                    </Row>
                    <ProgressBar value={p.levelsTotal ? p.levelsDone / p.levelsTotal : 0} color={colors.purple} label={line} />
                  </Card>
                );
              })}
              {children.length ? (
                <Card>
                  <Txt variant="section">{t('learn.withFamily')}</Txt>
                  {children.map((c) => {
                    const started = g.goals.map((goal) => ({ goal, p: goalProgress(goal, g.progress, c.person.id) })).filter((x) => x.p.stepsDone > 0);
                    return (
                      <ListRow
                        key={c.person.id}
                        left={<Avatar name={c.person.first_name} size={36} tone="purple" />}
                        title={c.person.preferred_name || c.person.first_name}
                        subtitle={started.length ? started.map((x) => `${x.goal.name} · ${t('learn.levelOf', { level: Math.min(x.p.levelsDone + 1, x.p.levelsTotal), n: x.p.levelsTotal })}`).join('\n') : t('learn.childNotStarted')}
                      />
                    );
                  })}
                </Card>
              ) : null}
            </VStack>
          );
        }}
      </Loaded>

      <SectionTitle>{t('learn.pathshala')}</SectionTitle>
      <Loaded state={pathshala}>
        {(rows) =>
          rows.length === 0 ? (
            <EmptyState icon="school-outline" title={t('learn.noEnrollments')} body={t('learn.noEnrollmentsBody')} />
          ) : (
            <Card>
              {rows.map((r) => {
                const student = member?.members.find((m) => m.person.id === r.student_person_id);
                const canScan = !!student && (r.status === 'placed' || r.status === 'active') && (student.person.id === member?.person.id || !!member?.isAdult);
                return (
                  <View key={r.id}>
                    <ListRow
                      left={<Avatar name={student?.person.first_name ?? '?'} size={36} tone="purple" />}
                      title={`${student?.person.preferred_name || student?.person.first_name || ''} · ${r.className ?? r.levelName ?? r.termName ?? ''}`}
                      subtitle={[t(`enroll.${r.status}` as 'enroll.requested'), r.schedule, r.termName].filter(Boolean).join(' · ')}
                    />
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

      <Loaded state={lessons}>
        {(items) =>
          items.length ? (
            <VStack gap={space.sm}>
              <SectionTitle>{t('learn.listen')}</SectionTitle>
              <Card>
                {items.map((c) => (
                  <ListRow key={c.id} title={c.title} subtitle={typeof (c.metadata as Record<string, unknown>)?.duration === 'string' ? ((c.metadata as Record<string, unknown>).duration as string) : null} onPress={c.media_url ? () => openLesson(c.media_url) : undefined} left={<Icon name="headset-outline" size={22} color={colors.purple} />} />
                ))}
              </Card>
            </VStack>
          ) : null
        }
      </Loaded>
    </VStack>
  );
}

// ---------------------------------------------------------------------------
// Saathi
// ---------------------------------------------------------------------------

export function SaathiPane() {
  const t = useT();
  const { center, member } = useApp();
  const { toast } = useFeedback();
  const { invalidate } = useDataVersion();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const state = useLoad(() => (center && member ? loadSaathi(center, member) : Promise.reject(new Error('not signed in'))), [center?.id, member?.person.id], 'load your family circle');

  const send = async (to: string, name: string, kind: 'celebrate' | 'support') => {
    if (!center) return;
    setBusy(`${to}:${kind}`);
    setError(null);
    try {
      const pts = await sendAnumodana(center.id, to, kind, null);
      invalidate();
      toast(pts > 0 ? t(kind === 'support' ? 'saathi.supportSent' : 'saathi.sent', { name, points: pts }) : t('saathi.sentNoPoints', { name }));
    } catch (err) {
      setError(report(err, 'send anumodana').userMessage);
    } finally {
      setBusy(null);
    }
  };

  return (
    <VStack gap={space.lg}>
      <Txt variant="small" color="ink2">
        {t('saathi.intro')}
      </Txt>
      {error ? <Banner tone="error" message={error} /> : null}
      <Loaded state={state}>
        {(d) => (
          <VStack gap={space.lg}>
            <Card>
              <Txt variant="section">{t('saathi.circle')}</Txt>
              {d.circle.map((m) => (
                <View key={m.personId} style={{ paddingVertical: space.sm, gap: space.xs }}>
                  <Row gap={space.md}>
                    <Avatar name={m.name} size={40} tone={m.isMe ? 'navy' : 'purple'} />
                    <View style={{ flex: 1 }}>
                      <Txt variant="bodyStrong">{m.isMe ? t('saathi.you') : m.name}</Txt>
                      <Txt variant="meta" color="muted">
                        {m.visible ? `${streakLabel(m.streakDays)} · ${t('saathi.today', { done: m.doneToday, n: m.selected })}` : t('saathi.private')}
                      </Txt>
                    </View>
                  </Row>
                  {m.visible && m.selected > 0 ? <ProgressBar value={m.doneToday / m.selected} color={colors.purple} label={t('saathi.today', { done: m.doneToday, n: m.selected })} /> : null}
                  {!m.isMe ? (
                    <Row gap={space.sm}>
                      <Button label={t('saathi.sendAnumodana')} tone="purple" size="sm" fill={false} busy={busy === `${m.personId}:celebrate`} onPress={() => send(m.personId, m.name, 'celebrate')} />
                      {member?.isAdult && m.visible && m.streakDays === 0 ? (
                        <Button label={t('saathi.encourage')} tone="secondary" size="sm" fill={false} busy={busy === `${m.personId}:support`} onPress={() => send(m.personId, m.name, 'support')} />
                      ) : null}
                    </Row>
                  ) : null}
                </View>
              ))}
            </Card>
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
                  <Txt key={a.id} variant="small" color="purpleDark">
                    {a.kind === 'support' ? t('saathi.receivedSupport', { name: a.fromName }) : t('saathi.receivedCelebrate', { name: a.fromName })}
                  </Txt>
                ))
              )}
            </Card>
          </VStack>
        )}
      </Loaded>
    </VStack>
  );
}

// ---------------------------------------------------------------------------
// Library
// ---------------------------------------------------------------------------

export function LibraryPane() {
  const t = useT();
  const router = useRouter();
  const { center } = useApp();
  const pach = useLoad(() => (center ? listContent(center.id, 'pachchakhan') : Promise.resolve([])), [center?.id], 'load the pachchakhan library');
  const today = useLoad(() => (center ? loadToday(center) : Promise.reject(new Error('no center'))), [center?.id], 'load live darshan');
  const darshan = today.data?.darshan ?? null;

  const openDarshan = async () => {
    if (!darshan) return;
    try {
      await WebBrowser.openBrowserAsync(darshan.url);
    } catch (err) {
      report(err, 'open the live darshan');
    }
  };

  return (
    <VStack gap={space.lg}>
      {darshan ? (
        <Card tone="navy" onPress={openDarshan} accessibilityLabel={t('home.watchDarshan')}>
          <Row gap={space.sm}>
            <View style={{ backgroundColor: colors.live, borderRadius: radii.sm, paddingHorizontal: 8, paddingVertical: 2 }}>
              <Txt variant="badge" color="white">
                {t('events.live')}
              </Txt>
            </View>
            <Txt variant="bodyStrong" color="white" style={{ flex: 1 }}>
              {darshan.title}
            </Txt>
            <Icon name="play-circle" size={28} color={colors.white} />
          </Row>
        </Card>
      ) : today.error ? (
        <ErrorState error={today.error} onRetry={() => void today.reload()} />
      ) : today.loading ? (
        <LoadingState />
      ) : null}
      <SectionTitle>{t('library.pachchakhan')}</SectionTitle>
      <Loaded state={pach}>
        {(items) =>
          items.length === 0 ? (
            <EmptyState icon="book-outline" title={t('library.none')} />
          ) : (
            <Card>
              {items.map((c, i) => (
                <View key={c.id}>
                  {i > 0 ? <Divider /> : null}
                  <ListRow title={c.title} subtitle={typeof (c.metadata as Record<string, unknown>)?.when === 'string' ? ((c.metadata as Record<string, unknown>).when as string) : null} onPress={() => router.push({ pathname: '/pachchakhan/[id]', params: { id: c.id } })} />
                </View>
              ))}
            </Card>
          )
        }
      </Loaded>
      <Card onPress={() => router.push('/guide')} accessibilityLabel={t('library.guide')}>
        <Row gap={space.md}>
          <Icon name="compass-outline" size={24} color={colors.navy} />
          <Txt variant="bodyStrong" style={{ flex: 1 }}>
            {t('library.guide')}
          </Txt>
          <Icon name="chevron-forward" size={18} color={colors.faint} />
        </Row>
      </Card>
    </VStack>
  );
}

import { useRouter } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { EmptyState, Loaded } from '@/components/states';
import { Button, Card, Chevron, Divider, LinkText, Row, Txt, VStack } from '@/components/ui';
import { goalProgress, lastActivityByGoal, loadGyan, loadPathshala, nextGyanLevel } from '@/lib/api/gyan';
import { formatDay } from '@/lib/format';
import { attendanceSummary, communityName, continueGoalId } from '@/lib/learning';
import { LEARN_PART_MODULE } from '@/lib/modules';
import { useLoad } from '@/lib/use-load';
import { useApp } from '@/providers/app';
import { useModules } from '@/providers/modules';
import { useT } from '@/providers/settings';
import { colors, fonts, radii, space } from '@/theme';

/**
 * 3L › Learn: the Gyan Path hero (straight into the next level), Pathshala
 * enrollments and attendance, and the community guide. Gyan Path and
 * Pathshala are separate modules; guests see the guide.
 */
export function LearnSection() {
  const t = useT();
  const { member } = useApp();
  const { isOn } = useModules();
  const gyanOn = isOn(LEARN_PART_MODULE.gyan);
  const pathshalaOn = isOn(LEARN_PART_MODULE.pathshala);
  return (
    <VStack gap={14}>
      {member && gyanOn ? <GyanHero /> : null}
      {member && pathshalaOn ? <PathshalaBlock /> : null}
      {!member && (gyanOn || pathshalaOn) ? (
        <Txt variant="small" color="muted">
          {t('threeL.guestLearn')}
        </Txt>
      ) : null}
      <GuideCard />
    </VStack>
  );
}

/** Navy Gyan Path hero (prototype Main L636): opens the next level, or the goals when every level is done. */
function GyanHero() {
  const t = useT();
  const router = useRouter();
  const { center, member } = useApp();
  const gyan = useLoad(() => (center && member ? loadGyan(center, [member.person.id]) : Promise.reject(new Error('no center'))), [center?.id, member?.person.id], 'load Gyan Path');
  const minutes = member?.person.gyan_daily_minutes ?? null;

  return (
    <Loaded state={gyan}>
      {(g) => {
        if (!member) return null;
        if (g.goals.length === 0) return <EmptyState icon="school-outline" title={t('learn.noGoals')} body={t('learn.noGoalsBody')} />;
        const personId = member.person.id;
        const id = continueGoalId(g.goals, lastActivityByGoal(g, personId), (goal) => goalProgress(goal, g.progress, personId).complete);
        const goal = g.goals.find((x) => x.id === id) ?? g.goals[0];
        const p = goalProgress(goal, g.progress, personId);
        const next = nextGyanLevel(g, personId);
        const levelNo = Math.min(p.levelsDone + 1, Math.max(p.levelsTotal, 1));
        const eyebrow = p.complete ? t('learn.heroEyebrowDone') : t('learn.heroEyebrow', { level: levelNo, n: p.levelsTotal });
        const title = p.currentLevel ? `${goal.name} · ${p.currentLevel.name}` : goal.name;
        const sub = !next ? t('threeL.heroAllDone') : p.stepsDone === 0 ? t('threeL.heroStart') : minutes ? t('learn.heroContinue', { min: minutes }) : t('learn.heroContinueNoGoal');
        const open = () => {
          if (next) router.push({ pathname: '/gyan/[goalId]/level/[levelId]', params: { goalId: next.goal.id, levelId: next.level.id } });
          else router.push('/gyan');
        };
        return (
          <VStack gap={4}>
            <Pressable
              onPress={open}
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
            <Row style={{ justifyContent: 'flex-end' }}>
              <LinkText label={t('threeL.allGoals')} onPress={() => router.push('/gyan')} />
            </Row>
          </VStack>
        );
      }}
    </Loaded>
  );
}

/** Pathshala enrollments, attendance and reports (formerly Learn), with enroll and teach. */
function PathshalaBlock() {
  const t = useT();
  const router = useRouter();
  const { member } = useApp();
  const pathshala = useLoad(() => (member?.household ? loadPathshala(member.household.id) : Promise.resolve([])), [member?.household?.id], 'load Pathshala');

  return (
    <VStack gap={14}>
      <Txt variant="section" accessibilityRole="header">
        {t('learn.pathshala')}
      </Txt>
      <Loaded state={pathshala}>
        {(rows) =>
          rows.length === 0 ? (
            <EmptyState
              icon="school-outline"
              title={t('learn.noEnrollments')}
              body={t('learn.noEnrollmentsBody')}
              action={member?.isAdult ? { label: t('enrollReq.cta'), onPress: () => router.push('/pathshala-enroll') } : undefined}
            />
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
                const a = attendanceSummary(r.attendance);
                return (
                  <View key={r.id} style={{ gap: 6 }}>
                    {i > 0 ? <Divider /> : null}
                    {pending ? (
                      <Text style={{ fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: colors.muted }}>
                        {`${[name, level, statusLabel].filter(Boolean).join(' · ')} · `}
                        <Text onPress={() => router.push('/pathshala-enroll')} accessibilityRole="link" style={{ color: colors.navy, textDecorationLine: 'underline' }}>
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
                        {a.last ? (
                          <Txt variant="meta" color="ink2">
                            {[
                              t('learn.lastClass', { date: formatDay(a.last.held_on), status: t(`attendStatus.${a.last.status}` as 'attendStatus.present') }),
                              t('learn.attended', { n: a.attended, total: a.total }),
                            ].join(' · ')}
                          </Txt>
                        ) : null}
                        {r.reports[0] ? (
                          <Txt variant="meta" color="ink2">
                            {[
                              t('learn.report', { period: r.reports[0].period }),
                              t('learn.reportAttendance', { present: r.reports[0].attendance_present + r.reports[0].attendance_late, total: r.reports[0].attendance_total }),
                              r.reports[0].teacher_comments,
                            ]
                              .filter(Boolean)
                              .join(' · ')}
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
      {member?.isAdult ? (
        <Row style={{ flexWrap: 'wrap' }}>
          {(pathshala.data?.length ?? 0) > 0 ? <Button label={t('enrollReq.cta')} tone="secondary" size="sm" icon="school-outline" fill={false} onPress={() => router.push('/pathshala-enroll')} /> : null}
          <Button label={t('teach.cta')} tone="secondary" size="sm" icon="people-outline" fill={false} onPress={() => router.push('/pathshala-teach')} />
        </Row>
      ) : null}
    </VStack>
  );
}

/** "{center} guide and directory" (formerly Library). */
function GuideCard() {
  const t = useT();
  const router = useRouter();
  const { center } = useApp();
  const community = communityName(center);
  return (
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
  );
}

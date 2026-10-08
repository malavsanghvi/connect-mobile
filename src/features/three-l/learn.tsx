import { useRouter } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { FeatureNotice } from '@/components/feature-notice';
import { EmptyState, Loaded } from '@/components/states';
import { Button, Card, Divider, LinkText, Row, Txt, VStack } from '@/components/ui';
import { EnrollmentFee } from '@/features/pathshala/enrollment-fee';
import { useNow, whenText } from '@/features/pathshala/shared';
import { goalProgress, lastActivityByGoal, loadGyan, loadPathshala, nextGyanLevel } from '@/lib/api/gyan';
import { formatDay } from '@/lib/format';
import { attendanceSummary, continueGoalId } from '@/lib/learning';
import { LEARN_PART_MODULE } from '@/lib/modules';
import { enrollmentStatus, stateDetail, statusText } from '@/lib/pathshala-registration';
import { useLoad } from '@/lib/use-load';
import { useFeature } from '@/providers/access';
import { useApp } from '@/providers/app';
import { useModules } from '@/providers/modules';
import { useT } from '@/providers/settings';
import { colors, fonts, radii } from '@/theme';

/**
 * 3L › Learn: the Gyan Path hero (the whole level map) and Pathshala
 * enrollments and attendance. Gyan Path and Pathshala are separate modules.
 * Gyan Path is an area of the organization's access levels: a visitor is
 * asked to sign in, a member below the level it asks for is told which level
 * it takes. Pathshala is for signed-in members of the community.
 */
export function LearnSection() {
  const t = useT();
  const { member } = useApp();
  const { isOn } = useModules();
  const canLearn = useFeature('learn').allowed && !!member;
  const gyanOn = isOn(LEARN_PART_MODULE.gyan);
  const pathshalaOn = isOn(LEARN_PART_MODULE.pathshala);
  return (
    <VStack gap={14}>
      {gyanOn && canLearn ? <GyanHero /> : null}
      {gyanOn && !canLearn ? <FeatureNotice feature="learn" /> : null}
      {member && pathshalaOn ? <PathshalaBlock /> : null}
      {!member && pathshalaOn ? (
        <Txt variant="small" color="muted">
          {t('threeL.guestPathshala')}
        </Txt>
      ) : null}
    </VStack>
  );
}

/** Navy Gyan Path hero (prototype Main L636): opens the whole path (the level map) of the goal you are on, or the goals when every level is done. The map has the Play button for the next level. */
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
        const sub = !next ? t('threeL.heroAllDone') : p.stepsDone === 0 ? t('threeL.heroStart') : minutes ? t('learn.heroContinue', { min: minutes }) : t('threeL.heroPath');
        const open = () => {
          if (next) router.push({ pathname: '/gyan/[goalId]', params: { goalId: next.goal.id } });
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

/**
 * Pathshala enrollments, attendance and reports (formerly Learn), with Register and teach. Each line says where it
 * stands (registered, a seat held until a time, a seat offered from the waitlist, waitlisted, waiting for membership,
 * the waiver or the office); a household adult also sees the fee with Pay (a held seat: its countdown, Pay for the
 * registration's held seats and "Pay at the office instead" when the term allows it). An adult another adult
 * registered agrees to the waiver from their own line. A child never sees fees, nor the holds about them (plan P30).
 */
function PathshalaBlock() {
  const t = useT();
  const router = useRouter();
  const { center, member } = useApp();
  const adult = !!member?.isAdult;
  const viewer = { adult };
  const pathshala = useLoad(() => (member?.household ? loadPathshala(member.household.id, { adult }) : Promise.resolve([])), [member?.household?.id, adult], 'load Pathshala');
  const anyHeld = (pathshala.data ?? []).some((r) => enrollmentStatus(r.status, r.hold, viewer).heldForPayment);
  const now = useNow(30000, adult && anyHeld);
  const nameOf = (personId: string) => {
    const p = member?.members.find((m) => m.person.id === personId)?.person;
    return p ? p.preferred_name || p.first_name : '';
  };

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
                // A seat released because the fee was not paid in time: the database's sentence stays for the adults (it is never a child's).
                const released = r.status === 'withdrawn' && !!r.withdrawalReason;
                const pending = r.status === 'requested' || r.status === 'waitlisted' || released;
                const canScan = !!student && enrolled && (student.person.id === member?.person.id || !!member?.isAdult);
                const view = enrollmentStatus(r.status, r.hold, viewer);
                const statusLabel = released ? t('reg.status.released') : pending ? statusText(view, t, whenText(view.until, center?.time_zone)) : t(`enroll.${r.status}` as 'enroll.requested');
                // Where the registration stands in the database's own words, for a line the app has no specific words for (adults only).
                const detail = adult && !released ? stateDetail(view, r.state) : null;
                // Another adult registered me: I agree to the waiver in my own app, and the same registration goes ahead.
                const myWaiver = adult && r.status === 'requested' && r.hold.holdReason === 'waiver' && r.student_person_id === member?.person.id;
                const a = attendanceSummary(r.attendance);
                return (
                  <View key={r.id} style={{ gap: 6 }}>
                    {i > 0 ? <Divider /> : null}
                    {pending ? (
                      // Where a request stands, never "Complete enrollment" again (plan F6): held, offered, waitlisted, or waiting.
                      <View style={{ gap: 2 }}>
                        <Txt variant="bodyStrong">{[name, level].filter(Boolean).join(' · ')}</Txt>
                        <Txt variant="meta" color={view.heldForPayment ? 'brownDark' : 'muted'} style={{ fontFamily: fonts.bodySemi }}>
                          {statusLabel}
                        </Txt>
                        {released ? (
                          <Txt variant="small" color="ink2">
                            {r.withdrawalReason}
                          </Txt>
                        ) : null}
                        {detail ? (
                          <Txt variant="small" color="ink2">
                            {detail}
                          </Txt>
                        ) : null}
                        {myWaiver ? (
                          <Row style={{ flexWrap: 'wrap' }}>
                            <Button label={t('learn.agreeWaiver')} tone="secondary" size="sm" fill={false} onPress={() => router.push({ pathname: '/pathshala-enroll', params: { term: r.term_id } })} />
                          </Row>
                        ) : null}
                      </View>
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
                    {adult ? <EnrollmentFee row={r} rows={rows} nameOf={nameOf} now={now} timeZone={center?.time_zone ?? null} /> : null}
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
      {member?.isAdult && (pathshala.data?.length ?? 0) > 0 ? (
        <Row style={{ flexWrap: 'wrap' }}>
          <Button label={t('enrollReq.cta')} tone="secondary" size="sm" icon="school-outline" fill={false} onPress={() => router.push('/pathshala-enroll')} />
        </Row>
      ) : null}
    </VStack>
  );
}

import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';

import { Icon } from '@/components/icon';
import { Band, Screen } from '@/components/screen';
import { EmptyState, Loaded } from '@/components/states';
import { Banner, Button, Card, ProgressBar, Row, Txt, VStack } from '@/components/ui';
import { goalProgress, isLevelDone, loadGyan } from '@/lib/api/gyan';
import { useLoad } from '@/lib/use-load';
import { useApp } from '@/providers/app';
import { useFeedback } from '@/providers/feedback';
import { useT } from '@/providers/settings';
import { colors, radii, space, touch } from '@/theme';

/** Gyan Path map for one goal: levels unlock strictly in order (docs/PROTOTYPE_GYAN_PATH.md §3.3). */
export default function GyanGoalScreen() {
  const t = useT();
  const router = useRouter();
  const { goalId } = useLocalSearchParams<{ goalId: string }>();
  const { center, member } = useApp();
  const { toast } = useFeedback();
  const state = useLoad(() => (center && member ? loadGyan(center, [member.person.id]) : Promise.reject(new Error('not signed in'))), [center?.id, member?.person.id], 'load Gyan Path');

  return (
    <Screen title={t('learn.gyanPath')}>
      <Loaded state={state}>
        {(g) => {
          const goal = g.goals.find((x) => x.id === goalId);
          if (!goal || !member) return <EmptyState title={t('learn.goalMissing')} />;
          const p = goalProgress(goal, g.progress, member.person.id);
          const last = goal.levels[goal.levels.length - 1];
          const signoff = last ? g.signoffs.find((s) => s.level_id === last.id && s.person_id === member.person.id) : undefined;
          return (
            <VStack gap={space.lg}>
              <Band color={colors.purple} eyebrow={t('learn.levelOf', { level: Math.min(p.levelsDone + 1, Math.max(p.levelsTotal, 1)), n: p.levelsTotal })} title={goal.name} subtitle={goal.description ?? undefined}>
                <ProgressBar value={p.levelsTotal ? p.levelsDone / p.levelsTotal : 0} color={colors.onNavyGreen} track={colors.purpleDark} label={t('learn.progress', { done: p.levelsDone, n: p.levelsTotal })} />
              </Band>
              {p.complete ? (
                <Banner
                  tone={signoff?.status === 'approved' ? 'success' : 'info'}
                  message={signoff?.status === 'approved' ? t('learn.signedOff') : signoff?.status === 'needs_work' ? t('learn.needsWork') : signoff ? t('learn.signoffRequested') : t('learn.goalDoneSignoff')}
                />
              ) : null}
              {goal.levels.length === 0 ? <EmptyState title={t('learn.noLevels')} /> : null}
              {goal.levels.map((level, i) => {
                const done = isLevelDone(level, g.progress, member.person.id);
                const current = i === p.levelsDone;
                const locked = i > p.levelsDone;
                const isBoss = i === goal.levels.length - 1;
                const onPress = () => {
                  if (locked) toast(t('learn.locked', { level: p.levelsDone + 1 }), 'info');
                  else router.push({ pathname: '/gyan/[goalId]/level/[levelId]', params: { goalId: goal.id, levelId: level.id } });
                };
                return (
                  <Pressable
                    key={level.id}
                    onPress={onPress}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: locked }}
                    accessibilityLabel={`${t('learn.level', { n: i + 1 })}: ${level.name}. ${done ? t('learn.done') : current ? t('learn.current') : t('learn.lockedShort')}`}
                    style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}>
                    <Card style={current ? { borderColor: colors.saffron, borderWidth: 2 } : undefined}>
                      <Row gap={space.md}>
                        <View
                          style={{
                            width: touch.min + 8,
                            height: touch.min + 8,
                            borderRadius: isBoss ? radii.lg : (touch.min + 8) / 2,
                            backgroundColor: done ? colors.green : current ? colors.saffron : colors.chip,
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}>
                          {done ? (
                            <Icon name="checkmark" size={24} color={colors.white} />
                          ) : locked && (level.treasure || isBoss) ? (
                            <Icon name={isBoss ? 'trophy-outline' : 'diamond-outline'} size={22} color={colors.faint} />
                          ) : (
                            <Txt variant="section" color={current ? 'white' : 'faint'}>
                              {String(i + 1)}
                            </Txt>
                          )}
                        </View>
                        <View style={{ flex: 1, gap: 2 }}>
                          <Txt variant="bodyStrong" color={locked ? 'muted' : 'ink'}>
                            {level.name}
                          </Txt>
                          <Txt variant="meta" color="muted">
                            {[
                              t('learn.steps', { n: level.steps.length }),
                              level.points ? t('jw.plusPoints', { points: level.points }) : null,
                              level.treasure ? t('learn.treasure', { reward: level.treasure }) : null,
                              isBoss && level.requires_teacher_signoff ? t('learn.teacherSignoff') : null,
                            ]
                              .filter(Boolean)
                              .join(' · ')}
                          </Txt>
                        </View>
                        {locked ? <Icon name="lock-closed-outline" size={18} color={colors.faint} /> : <Icon name="chevron-forward" size={18} color={colors.faint} />}
                      </Row>
                    </Card>
                  </Pressable>
                );
              })}
              {p.currentLevel ? (
                <Button
                  label={t('learn.play', { level: p.levelsDone + 1, name: p.currentLevel.name })}
                  tone="purple"
                  onPress={() => router.push({ pathname: '/gyan/[goalId]/level/[levelId]', params: { goalId: goal.id, levelId: (p.currentLevel as { id: string }).id } })}
                />
              ) : null}
              <Txt variant="fine" color="muted">
                {t('learn.contentNote')}
              </Txt>
            </VStack>
          );
        }}
      </Loaded>
    </Screen>
  );
}

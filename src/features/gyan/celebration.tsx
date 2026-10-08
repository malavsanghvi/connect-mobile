import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Pressable, ScrollView, View } from 'react-native';

import { Screen } from '@/components/screen';
import { Banner, Button, Txt } from '@/components/ui';
import { GyanHeaderChips } from '@/features/gyan-header';
import { Button3D, StarGlyph } from '@/features/gyan-ui';
import { HomeworkSection } from '@/features/homework/cards';
import type { HomeworkLoad } from '@/features/homework/use-homework';
import { loadPointsAndStreak } from '@/lib/api/jainway';
import { loadLevelAwards, requestSignoff, type GyanData, type GyanGoal, type GyanLevel } from '@/lib/api/gyan';
import { report } from '@/lib/errors';
import { todayAt } from '@/lib/format';
import { itemsForLevel, levelPointsWait } from '@/lib/homework';
import { accuracyPercent, communityName, levelStars } from '@/lib/learning';
import { streakDisplay } from '@/lib/rules';
import { useLoad } from '@/lib/use-load';
import { useApp } from '@/providers/app';
import { useDataVersion } from '@/providers/data-version';
import { useT } from '@/providers/settings';
import { colors, fonts, radii, space } from '@/theme';

import { Confetti } from './confetti';
import { haptic, useReduceMotion } from './motion';
import { levelAwards } from './points';

export type RunResult = { stars: Record<string, number>; correct: number; questions: number; practicePoints: number };

/** Ledger rows a little older than the lesson's start still count, in case the phone's clock runs ahead of the server's. */
export const CLOCK_SKEW_MS = 10 * 60 * 1000;

/**
 * Level complete (GyanPath.dc.html §3.5): stars, points with the level bonus
 * and treasure, streak, accuracy. The points are what the server paid during
 * the lesson (the ledger for the step, level and treasure points; the try
 * answers for practice), never the phone's own sum.
 */
export function Celebration({
  data,
  goal,
  level,
  index,
  run,
  alreadyDone,
  wasLevelDone,
  startedAt,
  homework,
}: {
  data: GyanData;
  goal: GyanGoal;
  level: GyanLevel;
  index: number;
  run: RunResult;
  alreadyDone: Set<string>;
  wasLevelDone: boolean;
  startedAt: number;
  /** The lesson's own load of the homework (one for the whole lesson, asked for again when the lesson is back in front). */
  homework: HomeworkLoad;
}) {
  const t = useT();
  const router = useRouter();
  const reduce = useReduceMotion();
  const { center, member } = useApp();
  const { invalidate } = useDataVersion();
  const community = communityName(center);
  const me = member?.person.id ?? '';
  const standing = useLoad(() => (center && member ? loadPointsAndStreak(center, member.person.id) : Promise.resolve(null)), [center?.id, member?.person.id], 'load your streak');
  const paid = useLoad(() => loadLevelAwards(me, level, new Date(startedAt - CLOCK_SKEW_MS).toISOString()), [me, level.id, startedAt], 'load the points from this level');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requested, setRequested] = useState(false);
  const stars = levelStars(level.steps.map((s) => run.stars[s.id] ?? data.progress.find((p) => p.person_id === me && p.step_id === s.id)?.stars ?? 0));
  const awards = paid.data ? levelAwards(paid.data, { stepIds: level.steps.map((s) => s.id), levelId: level.id, alreadyDone, wasLevelDone }) : null;
  const earned = awards ? awards.steps + awards.bonus + awards.treasure + run.practicePoints : null;
  const streak = standing.data && center ? streakDisplay(standing.data.streak, todayAt(center.time_zone)).days : null;
  const levelHomework = homework.homework ? itemsForLevel(homework.homework.items, level.id, me) : [];
  // The steps are done, but the database pays the level's points and treasure only once the required homework is accepted.
  const wait = levelPointsWait(levelHomework);
  const next = goal.levels[index + 1] ?? null;
  const isFinal = !next;
  const signoff = data.signoffs.find((s) => s.level_id === level.id && s.person_id === me);
  const needsSignoff = isFinal && level.requires_teacher_signoff;
  const [pop] = useState(() => new Animated.Value(0.6));
  const [seed] = useState(() => level.id.length * 7919 + index);
  useEffect(() => {
    haptic('complete');
  }, []);
  useEffect(() => {
    // A bouncy pop for the stars, or none with Reduce Motion (wait until the setting is known).
    if (reduce === null) return;
    if (reduce) {
      pop.setValue(1);
      return;
    }
    const anim = Animated.spring(pop, { toValue: 1, useNativeDriver: true, friction: 5 });
    anim.start();
    return () => anim.stop();
  }, [pop, reduce]);
  useEffect(() => {
    if (earned) AccessibilityInfo.announceForAccessibility(t('gyan.plusPointsSaid', { n: earned }));
  }, [earned, t]);

  const askSignoff = async () => {
    if (!center) return;
    setBusy(true);
    setError(null);
    try {
      await requestSignoff(center.id, me, level.id);
      setRequested(true);
      invalidate();
    } catch (err) {
      setError(report(err, 'request a teacher sign-off').userMessage);
    } finally {
      setBusy(false);
    }
  };

  const stat = (value: string, label: string, color: string) => (
    <View style={{ flex: 1, backgroundColor: colors.navyPanel2, borderRadius: radii.card, paddingVertical: 12, paddingHorizontal: 6, alignItems: 'center' }} accessible accessibilityLabel={`${value} ${label}`}>
      <Txt variant="headline" style={{ fontFamily: fonts.bodyBold, color }}>
        {value}
      </Txt>
      <Txt variant="fine" color="onNavy" center>
        {label}
      </Txt>
    </View>
  );
  const parts = awards
    ? [
        awards.steps > 0 ? t('gyan.breakdownSteps', { n: awards.steps }) : null,
        awards.bonus > 0 ? t('gyan.breakdownBonus', { n: awards.bonus }) : null,
        awards.treasure > 0 ? t('gyan.breakdownTreasure', { n: awards.treasure }) : null,
        run.practicePoints > 0 ? t('gyan.breakdownPractice', { n: run.practicePoints }) : null,
      ].filter((x): x is string => !!x)
    : [];

  return (
    <Screen title={goal.name} tabBar={false} scroll={false} headerRight={<GyanHeaderChips />} contentStyle={{ flex: 1, paddingHorizontal: 0, paddingTop: 0, paddingBottom: 0, gap: 0 }}>
      <View style={{ flex: 1 }}>
        <ScrollView style={{ flex: 1, backgroundColor: colors.navy }} contentContainerStyle={{ flexGrow: 1, alignItems: 'center', paddingTop: 30, paddingHorizontal: 24, paddingBottom: 24, gap: 14 }}>
          <Txt variant="eyebrow" style={{ color: colors.gold, letterSpacing: 1 }}>
            {t('learn.doneEyebrow', { n: index + 1 })}
          </Txt>
          <Txt variant="hero" color="white" center accessibilityRole="header">
            {level.name}
          </Txt>
          <Animated.View style={{ flexDirection: 'row', gap: 10, paddingVertical: 8, transform: [{ scale: pop }] }} accessible accessibilityLabel={t('gyan.starsA11y', { n: stars })}>
            {[0, 1, 2].map((k) => (
              <StarGlyph key={k} size={64} color={k < stars ? colors.gold : colors.starOff} />
            ))}
          </Animated.View>
          <View style={{ flexDirection: 'row', gap: space.sm, alignSelf: 'stretch' }}>
            {stat(earned !== null ? `+${earned}` : paid.error ? '–' : '…', t('learn.donePoints', { center: community }), colors.gold)}
            {stat(streak === null ? '–' : String(streak), t('learn.doneStreak'), colors.flame)}
            {stat(`${accuracyPercent(run.correct, run.questions)}%`, t('learn.doneAccuracy'), colors.onNavyGreen)}
          </View>
          {paid.error ? (
            <View style={{ alignSelf: 'stretch' }}>
              <Banner tone="error" message={paid.error.userMessage} action={{ label: t('common.retry'), onPress: () => void paid.reload() }} />
            </View>
          ) : null}
          {parts.length > 1 ? (
            <Txt variant="caption" color="onNavy" center>
              {parts.join(' · ')}
            </Txt>
          ) : null}
          {wait ? (
            <Txt variant="caption" color="onNavy" center>
              {t(wait.key, wait.vars)}
            </Txt>
          ) : null}
          {earned === 0 && wasLevelDone ? (
            <Txt variant="caption" color="onNavy" center>
              {t('learn.doneReplayPoints')}
            </Txt>
          ) : null}
          {needsSignoff && level.points > 0 ? (
            <Txt variant="caption" color="onNavy" center>
              {t('learn.doneSignoffPoints', { points: level.points, center: community })}
            </Txt>
          ) : null}
          {level.treasure && !wasLevelDone && !wait ? (
            <View style={{ alignSelf: 'stretch', backgroundColor: colors.gold, borderRadius: radii.row, paddingVertical: 12, paddingHorizontal: 14 }}>
              <Txt variant="smallStrong" color="treasureInk" style={{ fontFamily: fonts.bodyBold }}>
                {awards && awards.treasure > 0 ? t('gyan.treasurePoints', { reward: level.treasure, points: awards.treasure }) : t('learn.treasureUnlocked', { reward: level.treasure })}
              </Txt>
            </View>
          ) : null}
          <Txt variant="small" color="onNavy" center>
            {next ? t('learn.nextUp', { n: index + 2, name: next.name }) : needsSignoff ? t('learn.goalFinished', { goal: goal.name }) : t('learn.goalFinishedNoSignoff', { goal: goal.name })}
          </Txt>
          {needsSignoff ? (
            signoff || requested ? (
              <Txt variant="smallStrong" color="onNavyGreen" center>
                {signoff?.status === 'approved' ? t('learn.signedOff') : signoff?.status === 'needs_work' ? t('learn.needsWork') : t('learn.signoffRequested')}
              </Txt>
            ) : (
              <Button label={t('learn.requestSignoff')} tone="light" size="md" busy={busy} onPress={() => void askSignoff()} />
            )
          ) : null}
          {error ? (
            <View style={{ alignSelf: 'stretch' }}>
              <Banner tone="error" message={error} />
            </View>
          ) : null}
          <View style={{ alignSelf: 'stretch', paddingTop: space.sm }}>
            <HomeworkSection load={homework} items={levelHomework} title={t('hw.sectionLevel')} today={todayAt(center?.time_zone)} viewer="learner" onNavy />
          </View>
          <View style={{ flexGrow: 1 }} />
          <Button3D
            style={{ alignSelf: 'stretch' }}
            label={next ? t('learn.nextLevel') : t('learn.chooseGoal')}
            bg={colors.saffron}
            edge={colors.brown}
            onPress={() => {
              if (next) router.replace({ pathname: '/gyan/[goalId]/level/[levelId]', params: { goalId: goal.id, levelId: next.id } });
              else router.dismissTo('/gyan');
            }}
          />
          <Pressable onPress={() => router.back()} accessibilityRole="button" style={{ minHeight: 44, justifyContent: 'center' }}>
            <Txt variant="smallStrong" color="onNavy">
              {t('learn.backToPath')}
            </Txt>
          </Pressable>
        </ScrollView>
        {(earned ?? 0) > 0 || !wasLevelDone ? <Confetti seed={seed} top={90} /> : null}
      </View>
    </Screen>
  );
}

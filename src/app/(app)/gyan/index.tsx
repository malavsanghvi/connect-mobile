import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Screen } from '@/components/screen';
import { EmptyState, Loaded } from '@/components/states';
import { Banner, ProgressBar, Txt, VStack } from '@/components/ui';
import { activeGoal } from '@/features/jain-way';
import { GyanHeaderChips } from '@/features/gyan-header';
import { InitialAvatar, MEMBER_COLORS } from '@/features/gyan-ui';
import { goalProgress, loadGyan, setDailyMinutes } from '@/lib/api/gyan';
import { report } from '@/lib/errors';
import { DAILY_MINUTES, goalMark, type DailyMinutes } from '@/lib/learning';
import { useLoad } from '@/lib/use-load';
import { useApp } from '@/providers/app';
import { useFeedback } from '@/providers/feedback';
import { useT } from '@/providers/settings';
import { colors, fonts, radii, space } from '@/theme';

const DAILY_SUB = { 5: 'learn.daily5', 10: 'learn.daily10', 15: 'learn.daily15' } as const;

/** Gyan Path goals (GyanPath.dc.html L36–69): greeting, daily goal, learning goals, learning with family. */
export default function GyanGoalsScreen() {
  const t = useT();
  const router = useRouter();
  const { center, member, refreshMember } = useApp();
  const { toast } = useFeedback();
  const [daily, setDaily] = useState<DailyMinutes | null>(null);
  const [error, setError] = useState<string | null>(null);
  const kids = member?.isAdult ? member.members.filter((m) => !m.isAdult) : [];
  const ids = member ? [member.person.id, ...kids.map((k) => k.person.id)] : [];
  const state = useLoad(() => (center && member ? loadGyan(center, ids) : Promise.reject(new Error('not signed in'))), [center?.id, ids.join(',')], 'load Gyan Path');
  const chosen = daily ?? (member?.person.gyan_daily_minutes as DailyMinutes | null | undefined) ?? null;

  const pickDaily = async (m: DailyMinutes) => {
    if (!member) return;
    const prev = daily;
    setDaily(m);
    setError(null);
    try {
      await setDailyMinutes(member.person.id, m);
      toast(t('learn.dailySaved', { n: m }));
      await refreshMember();
    } catch (err) {
      setDaily(prev);
      setError(report(err, 'save your daily goal').userMessage);
    }
  };

  return (
    <Screen title={t('learn.gyanPath')} tabBar={false} niva={false} headerRight={<GyanHeaderChips />}>
      <View style={{ backgroundColor: colors.navy, borderRadius: radii.pill, paddingVertical: 18, paddingHorizontal: 20, gap: space.sm }}>
        <Txt variant="meta" color="onNavy">
          {t('learn.goalsGreeting', { name: member?.person.preferred_name || member?.person.first_name || '' })}
        </Txt>
        <Text style={{ fontFamily: fonts.display, fontSize: 24, lineHeight: 29, color: colors.white }} accessibilityRole="header">
          {t('learn.goalsTitle')}
        </Text>
        <Txt variant="meta" color="onNavy">
          {t('learn.goalsBody')}
        </Txt>
      </View>

      <VStack gap={6}>
        <Txt variant="eyebrow" color="muted">
          {t('learn.dailyGoal')}
        </Txt>
        <View style={{ flexDirection: 'row', gap: 6 }} accessibilityRole="radiogroup">
          {DAILY_MINUTES.map((m) => {
            const on = chosen === m;
            return (
              <Pressable
                key={m}
                onPress={() => void pickDaily(m)}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                accessibilityLabel={`${t('learn.dailyMin', { n: m })}, ${t(DAILY_SUB[m])}`}
                style={({ pressed }) => ({ flex: 1, borderWidth: 1, borderColor: colors.navy, backgroundColor: on ? colors.navy : colors.card, borderRadius: radii.card, minHeight: 52, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.85 : 1 })}>
                <Text style={{ fontFamily: fonts.bodyBold, fontSize: 15, color: on ? colors.white : colors.navy }}>{t('learn.dailyMin', { n: m })}</Text>
                <Text style={{ fontFamily: fonts.body, fontSize: 11, color: on ? colors.white : colors.navy, opacity: 0.85 }}>{t(DAILY_SUB[m])}</Text>
              </Pressable>
            );
          })}
        </View>
      </VStack>
      {error ? <Banner tone="error" message={error} /> : null}

      <Txt variant="eyebrow" color="muted" style={{ paddingTop: 4 }}>
        {t('learn.learningGoals')}
      </Txt>
      <Loaded state={state}>
        {(g) => {
          if (!member) return null;
          if (g.goals.length === 0) return <EmptyState icon="school-outline" title={t('learn.noGoals')} body={t('learn.noGoalsBody')} />;
          return (
            <VStack gap={14}>
              {g.goals.map((goal) => {
                const p = goalProgress(goal, g.progress, member.person.id);
                const tint = goal.tint ?? colors.navy;
                const progress = p.complete ? t('learn.complete') : p.stepsDone === 0 ? t('learn.notStarted') : t('learn.levelOfDone', { level: p.levelsDone + 1, n: p.levelsTotal, done: p.levelsDone });
                const sub = [goal.description, t('learn.goalLevels', { n: p.levelsTotal })].filter(Boolean).join(' · ');
                return (
                  <Pressable
                    key={goal.id}
                    onPress={() => router.push({ pathname: '/gyan/[goalId]', params: { goalId: goal.id } })}
                    accessibilityRole="button"
                    accessibilityLabel={[goal.name, goal.recommended ? t('learn.forYou') : null, sub, progress].filter(Boolean).join('. ')}
                    style={({ pressed }) => ({ borderWidth: 2, borderColor: goal.recommended ? tint : colors.border, backgroundColor: colors.card, borderRadius: radii.xxl, padding: 14, flexDirection: 'row', gap: 14, alignItems: 'center', opacity: pressed ? 0.9 : 1 })}>
                    <View style={{ width: 56, height: 56, borderRadius: 18, backgroundColor: tint, alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontFamily: fonts.displayBold, fontSize: 22, color: colors.white }}>{goalMark(goal)}</Text>
                    </View>
                    <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <Txt variant="section" style={{ fontFamily: fonts.bodyBold }}>
                          {goal.name}
                        </Txt>
                        {goal.recommended ? (
                          <View style={{ backgroundColor: colors.brownTint, borderRadius: radii.sm, paddingVertical: 2, paddingHorizontal: 6 }}>
                            <Text style={{ fontFamily: fonts.bodyBold, fontSize: 10, color: colors.brown }}>{t('learn.forYou').toUpperCase()}</Text>
                          </View>
                        ) : null}
                      </View>
                      <Txt variant="caption" color="muted" style={{ fontFamily: fonts.body }}>
                        {sub}
                      </Txt>
                      <ProgressBar value={p.levelsTotal ? p.levelsDone / p.levelsTotal : 0} color={tint} track={colors.divider} />
                      <Txt variant="fine" color="muted" style={{ fontFamily: fonts.bodySemi }}>
                        {progress}
                      </Txt>
                    </View>
                  </Pressable>
                );
              })}
              {kids.length ? (
                <View style={{ backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radii.xl, paddingVertical: 14, paddingHorizontal: 16, gap: space.sm }}>
                  <Txt variant="bodyStrong" style={{ fontFamily: fonts.bodyBold }}>
                    {t('learn.withFamily')}
                  </Txt>
                  {kids.map((k, i) => {
                    const name = k.person.preferred_name || k.person.first_name;
                    const act = activeGoal(g, k.person.id);
                    return (
                      <View key={k.person.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                        <InitialAvatar name={name} color={MEMBER_COLORS[(i + 2) % MEMBER_COLORS.length]} size={34} />
                        <Txt variant="small" style={{ flex: 1 }}>
                          <Text style={{ fontFamily: fonts.bodySemi }}>{name}</Text>
                          {` · ${act ? act.goal.name : t('learn.childNotStarted')}`}
                        </Txt>
                        {act ? (
                          <Text style={{ fontFamily: fonts.bodyBold, fontSize: 12, color: colors.green }}>
                            {act.p.complete ? t('learn.complete') : t('learn.levelOf', { level: act.p.levelsDone + 1, n: act.p.levelsTotal })}
                          </Text>
                        ) : null}
                      </View>
                    );
                  })}
                </View>
              ) : null}
            </VStack>
          );
        }}
      </Loaded>
      <Txt variant="fine" color="faint" center>
        {t('learn.contentNote')}
      </Txt>
    </Screen>
  );
}

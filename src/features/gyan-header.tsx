import { useEffect } from 'react';
import { Pressable, Text } from 'react-native';

import { loadPointsAndStreak } from '@/lib/api/jainway';
import { communityName } from '@/lib/learning';
import { streakDisplay, type StreakRow } from '@/lib/rules';
import { todayAt } from '@/lib/format';
import { useLoad } from '@/lib/use-load';
import { useApp } from '@/providers/app';
import { useFeedback } from '@/providers/feedback';
import { useT } from '@/providers/settings';
import { colors, fonts } from '@/theme';

import { HeaderChips } from './gyan-ui';

/**
 * Last totals shown, per person, so the chips don't blink empty while a new
 * lesson screen reloads them (each Gyan Path step is its own screen).
 */
const lastShown = new Map<string, { points: number; streak: StreakRow }>();

/** Streak + points chips for every Gyan Path header (shared with My Jain Way). */
export function GyanHeaderChips() {
  const t = useT();
  const { center, member } = useApp();
  const { toast } = useFeedback();
  const key = `${center?.id ?? ''}:${member?.person.id ?? ''}`;
  const state = useLoad(() => (center && member ? loadPointsAndStreak(center, member.person.id) : Promise.resolve(null)), [center?.id, member?.person.id], 'load your points and streak');
  useEffect(() => {
    if (state.data) lastShown.set(key, state.data);
  }, [key, state.data]);
  const data = state.data ?? lastShown.get(key) ?? null;
  if (state.error && !data) {
    // Too small for a banner: a tappable "!" chip that says what failed and retries.
    return (
      <Pressable
        onPress={() => {
          toast(state.error?.userMessage ?? '', 'error');
          void state.reload();
        }}
        accessibilityRole="button"
        accessibilityLabel={`${state.error.userMessage} ${t('common.retry')}`}
        style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontFamily: fonts.bodyBold, fontSize: 16, color: colors.danger }}>!</Text>
      </Pressable>
    );
  }
  if (!data || !center) return null;
  const streak = streakDisplay(data.streak, todayAt(center.time_zone)).days;
  return (
    <HeaderChips
      streak={streak}
      points={data.points}
      streakLabel={t('learn.streakChip', { days: streak })}
      pointsLabel={t('learn.pointsChip', { points: data.points.toLocaleString('en-US'), center: communityName(center) })}
    />
  );
}

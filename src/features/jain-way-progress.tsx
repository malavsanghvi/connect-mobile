import type { ReactNode } from 'react';
import { Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { ProgressBar, Row, Txt } from '@/components/ui';
import type { JainWayToday } from '@/lib/api/jainway';
import { formatDay, weekdayOf } from '@/lib/format';
import { streakDisplay, streakLabel, tithiLabel, type TithiDay } from '@/lib/rules';
import { useT } from '@/providers/settings';
import { colors, fonts, radii, space } from '@/theme';

import { FlameGlyph } from './gyan-ui';

const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/** What the card reads of the member's day (api/jainway loadJainWayToday). */
export type JainWayProgress = Pick<JainWayToday, 'today' | 'selected' | 'doneIds' | 'pointsTotal' | 'pointsToday' | 'streak' | 'week'>;

/**
 * The navy progress card of My Jain Way (prototype Main L580–633): today's date or tithi, how many practices
 * are done, the community's points, the streak and the dots of the week. It is the top of the My Jain Way
 * tab (TodayPane) and the second tile of Home's first row, which wraps it in a button to that tab.
 *
 * `footer` is drawn inside the card under the week (Home adds "Next: …" there). `asHeader` is false when the
 * card sits inside a button, where a heading would be read twice. `style` lets the card fill a tile.
 * `compact` is the Home tile: the same numbers in the height of the Today card beside it (closer spacing, and the
 * streak's second line is left to the My Jain Way tab), spread over whatever height the row gives it.
 */
export function JainWayProgressCard({
  d,
  tithi,
  community,
  footer,
  asHeader = true,
  compact = false,
  style,
}: {
  d: JainWayProgress;
  tithi: TithiDay | null;
  community: string;
  footer?: ReactNode;
  asHeader?: boolean;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useT();
  const n = d.selected.length;
  const done = d.doneIds.length;
  const streak = streakDisplay(d.streak, d.today);
  return (
    <View
      style={[
        { backgroundColor: colors.navy, borderRadius: radii.xxl, paddingVertical: compact ? 14 : 18, paddingHorizontal: compact ? 16 : 20, gap: compact ? 10 : space.md },
        compact ? { justifyContent: 'space-between' } : null,
        style,
      ]}>
      <Row style={{ justifyContent: 'space-between' }} align="flex-start">
        <View style={{ flex: 1 }}>
          <Txt variant="meta" color="onNavy">
            {tithi ? t('jw.todayTithi', { tithi: tithiLabel(tithi) }) : t('jw.todayDate', { date: formatDay(d.today) })}
          </Txt>
          <Txt variant="display" color="white" accessibilityRole={asHeader ? 'header' : undefined} style={{ fontFamily: fonts.display }}>
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
      <Row gap={10} style={{ backgroundColor: colors.navyPanel2, borderRadius: radii.card, paddingVertical: compact ? 8 : 10, paddingHorizontal: 12 }}>
        <FlameGlyph size={30} />
        <View style={{ flex: 1 }}>
          <Txt variant="section" color="white" style={{ fontFamily: fonts.bodyBold }}>
            {streakLabel(streak.days)}
          </Txt>
          {compact ? null : (
            <Txt variant="caption" color="onNavy" style={{ fontFamily: fonts.body }}>
              {streak.completedToday ? t('jw.bestStreak', { best: streak.best }) : streak.atRisk ? t('jw.keepStreak', { days: streak.days + 1 }) : t('jw.startStreak')}
            </Txt>
          )}
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
      {footer}
    </View>
  );
}

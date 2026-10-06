import { useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';

import { ErrorState } from '@/components/states';
import { Chevron, Row, Txt } from '@/components/ui';
import { firstNameOf, needsYourOk, type HomeworkItem } from '@/lib/homework';
import { useApp } from '@/providers/app';
import { useT } from '@/providers/settings';
import { colors, fonts, radii, space, touch } from '@/theme';

import { openHomework } from './cards';
import type { HomeworkLoad } from './use-homework';

/**
 * "Needs your OK" on Home, between the first row and the second, for a household adult: one line per child's answer
 * that waits for a parent, oldest first; a tap opens it. Nothing when there is none, when the portal has no homework
 * yet, or for a child; a failed load says so with Try again.
 */
export function NeedsOkStrip({ load }: { load: HomeworkLoad }) {
  const t = useT();
  const router = useRouter();
  const { member } = useApp();
  if (!member) return null;
  // A failed load is said even when there is nothing else to show: the load before the access check answered gave
  // nothing (not an error), and useLoad keeps that as the data, so the error is never read off `data` alone.
  const problem = load.state.error ? <ErrorState error={load.state.error} onRetry={() => void load.state.reload()} /> : null;
  if (!load.homework) return problem;
  const items = needsYourOk(load.homework.items, member.person.id);
  if (items.length === 0) return problem;
  const nameOf = (item: HomeworkItem) => {
    const fm = member.members.find((m) => m.person.id === item.personId)?.person;
    return fm ? fm.preferred_name || fm.first_name : firstNameOf(load.homework?.people.find((p) => p.personId === item.personId)?.name ?? '');
  };
  return (
    <View style={{ backgroundColor: colors.card, borderWidth: 2, borderColor: colors.saffron, borderRadius: radii.xxl, paddingVertical: space.md, paddingHorizontal: space.lg, gap: space.xs }}>
      {problem}
      <Txt variant="eyebrow" color="brown" style={{ fontFamily: fonts.bodySemi, letterSpacing: 0.48 }} accessibilityRole="header">
        {t('hw.strip.eyebrow')}
      </Txt>
      {items.map((item) => {
        const line = t('hw.strip.item', { name: nameOf(item), title: item.assignment.title });
        return (
          <Pressable key={`${item.assignment.id}:${item.personId}`} onPress={() => openHomework(router, item)} accessibilityRole="button" accessibilityLabel={`${line}. ${t('hw.strip.check')}`} accessibilityHint={t('hw.strip.hint')} style={({ pressed }) => ({ minHeight: touch.min, justifyContent: 'center', opacity: pressed ? 0.8 : 1 })}>
            <Row gap={space.sm}>
              <Txt variant="bodyStrong" style={{ flex: 1 }} numberOfLines={2}>
                {line}
              </Txt>
              <Txt variant="meta" color="brown" style={{ fontFamily: fonts.bodySemi }}>
                {t('hw.strip.check')}
              </Txt>
              <Chevron />
            </Row>
          </Pressable>
        );
      })}
    </View>
  );
}

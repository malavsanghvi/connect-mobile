import { useRouter } from 'expo-router';
import { Pressable } from 'react-native';

import { Txt } from '@/components/ui';
import { countsFor, homeworkLineParts } from '@/lib/homework';
import { useT } from '@/providers/settings';
import { colors, fonts, touch } from '@/theme';

import type { HomeworkLoad } from './use-homework';

/**
 * "Homework: 1 needs your OK · 2 with the teacher" under a family member on the Family tab, for everyone whose
 * homework this reader may see (a parent: the children's; anyone: their own). A tap opens that person's homework
 * list. Nothing when the person has none, or the portal has no homework yet.
 */
export function FamilyHomeworkLine({ personId, load }: { personId: string; load: HomeworkLoad }) {
  const t = useT();
  const router = useRouter();
  if (!load.homework) return null;
  const parts = homeworkLineParts(countsFor(load.homework.items, personId));
  if (parts.length === 0) return null;
  const line = t('hw.line.prefix', { parts: parts.map((p) => t(p.key, p.vars)).join(' · ') });
  return (
    <Pressable onPress={() => router.push({ pathname: '/gyan/homework', params: { person: personId } })} accessibilityRole="button" accessibilityLabel={line} accessibilityHint={t('hw.line.hint')} style={({ pressed }) => ({ minHeight: touch.min, justifyContent: 'center', paddingLeft: 52, paddingBottom: 4, opacity: pressed ? 0.8 : 1 })}>
      <Txt variant="meta" color="navy" style={{ fontFamily: fonts.bodySemi, color: colors.navy }}>
        {line}
      </Txt>
    </Pressable>
  );
}

import { View } from 'react-native';

import { Txt, VStack } from '@/components/ui';
import type { OfflineMethod } from '@/lib/api/payments';
import type { StringKey } from '@/i18n/en';
import { useT } from '@/providers/settings';
import { colors, space } from '@/theme';

import { instructionLines, OFFLINE_METHOD_KEYS as METHODS } from './offline';


/** "How to give": the offline methods this community accepts, with its instructions. */
export function HowToGive({ methods, tone = 'plain' }: { methods: OfflineMethod[]; tone?: 'plain' | 'brown' }) {
  const t = useT();
  const known = methods.filter((m) => METHODS.includes(m.method));
  const color = tone === 'brown' ? 'brownDark' : 'ink';
  if (known.length === 0) {
    return (
      <Txt variant="small" color={color}>
        {t('howToGive.none')}
      </Txt>
    );
  }
  return (
    <VStack gap={space.sm}>
      {known.map((m) => (
        <View key={m.method} accessible accessibilityLabel={t(`howToGive.method.${m.method}` as StringKey)} style={{ gap: 2, borderLeftWidth: 3, borderLeftColor: colors.border, paddingLeft: space.sm }}>
          <Txt variant="smallStrong" color={color}>
            {t(`howToGive.method.${m.method}` as StringKey)}
          </Txt>
          {instructionLines(m).map((l) => (
            <Txt key={l.field} variant="small" color={color}>
              {t(`howToGive.field.${l.field}` as StringKey)}: {l.value}
            </Txt>
          ))}
        </View>
      ))}
    </VStack>
  );
}

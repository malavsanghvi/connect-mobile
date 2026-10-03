import { View } from 'react-native';

import { Txt, VStack } from '@/components/ui';
import type { StringKey } from '@/i18n/en';
import { useT } from '@/providers/settings';
import { colors, space } from '@/theme';

import type { InstructionMethod, ZelleMethod } from './methods';
import { instructionLines, OFFLINE_METHOD_KEYS as METHODS } from './offline';
import { ZelleBlock } from './zelle';

/**
 * "How to give": the ways this community takes a gift that are not paid on a provider's page, in its order, with its
 * instructions. Zelle (when the community's list has it) shows the address with a copy button and, when the database
 * can take it, "I sent it" (`onReport`). Everything else is the office's own instructions.
 */
export function HowToGive({ methods, tone = 'plain', onReport }: { methods: (ZelleMethod | InstructionMethod)[]; tone?: 'plain' | 'brown'; onReport?: () => void }) {
  const t = useT();
  const known = methods.filter((m) => m.kind === 'zelle' || METHODS.includes(m.method));
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
      {known.map((m) => {
        if (m.kind === 'zelle') return <ZelleBlock key={m.key} method={m} tone={tone} onReport={onReport} />;
        const name = m.label ?? t(`howToGive.method.${m.method}` as StringKey);
        const lines = instructionLines(m).map((l) => ({ ...l, label: t(`howToGive.field.${l.field}` as StringKey) }));
        return (
          <View key={m.key} accessible accessibilityLabel={[name, ...lines.map((l) => `${l.label}: ${l.value}`)].join('. ')} style={{ gap: 2, borderLeftWidth: 3, borderLeftColor: colors.border, paddingLeft: space.sm }}>
            <Txt variant="smallStrong" color={color}>
              {name}
            </Txt>
            {lines.map((l) => (
              <Txt key={l.field} variant="small" color={color}>
                {l.label}: {l.value}
              </Txt>
            ))}
          </View>
        );
      })}
    </VStack>
  );
}

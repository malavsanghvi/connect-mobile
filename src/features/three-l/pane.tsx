import { Pressable, View } from 'react-native';

import { Icon, type IconName } from '@/components/icon';
import { Txt, VStack } from '@/components/ui';
import { pickPane, threeLSections, type ThreeLSection } from '@/lib/modules';
import { useModules } from '@/providers/modules';
import { useT } from '@/providers/settings';
import { colors, radii, space, touch } from '@/theme';

import { LearnSection } from './learn';
import { ListenSection } from './listen';
import { LookSection } from './look';

const SECTION_ICON: Record<ThreeLSection, IconName> = { look: 'eye-outline', listen: 'headset-outline', learn: 'school-outline' };
const SECTION_LABEL = { look: 'threeL.look', listen: 'threeL.listen', learn: 'threeL.learn' } as const;

/**
 * My Jain Way › 3L · Look, Listen, Learn (replaces the Learn and Library
 * segments). `section` is the `?section=` link parameter; old `tab=learn` /
 * `tab=library` links arrive here through resolveJainWayLink.
 */
export function ThreeLPane({ section, onSection }: { section: string | undefined; onSection: (s: ThreeLSection) => void }) {
  const t = useT();
  const { map } = useModules();
  const sections = threeLSections(map);
  const current = pickPane(section, sections, 'look');
  return (
    <VStack gap={14}>
      <Txt variant="headline" accessibilityRole="header">
        {t('threeL.heading')}
      </Txt>
      {sections.length > 1 && current ? (
        <View accessibilityRole="tablist" accessibilityLabel={t('threeL.heading')} style={{ flexDirection: 'row', gap: space.sm }}>
          {sections.map((s) => {
            const selected = s === current;
            return (
              <Pressable
                key={s}
                onPress={() => onSection(s)}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                accessibilityLabel={t(SECTION_LABEL[s])}
                style={({ pressed }) => ({
                  flex: 1,
                  minHeight: touch.min,
                  borderRadius: radii.pill,
                  borderWidth: 1,
                  borderColor: selected ? colors.navy : colors.borderInput,
                  backgroundColor: selected ? colors.navy : colors.card,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  paddingHorizontal: space.sm,
                  opacity: pressed ? 0.85 : 1,
                })}>
                <Icon name={SECTION_ICON[s]} size={17} color={selected ? colors.white : colors.navy} />
                <Txt variant="smallStrong" color={selected ? 'white' : 'navy'} numberOfLines={1}>
                  {t(SECTION_LABEL[s])}
                </Txt>
              </Pressable>
            );
          })}
        </View>
      ) : null}
      {current === 'look' ? <LookSection /> : current === 'listen' ? <ListenSection /> : current === 'learn' ? <LearnSection /> : null}
    </VStack>
  );
}

import { useRouter } from 'expo-router';
import { Pressable, type StyleProp, type ViewStyle } from 'react-native';

import { Icon } from '@/components/icon';
import { Txt } from '@/components/ui';
import { loadGyan } from '@/lib/api/gyan';
import { useLoad } from '@/lib/use-load';
import { useFeature } from '@/providers/access';
import { useApp } from '@/providers/app';
import { useT } from '@/providers/settings';
import { colors, fonts, radii, space, touch } from '@/theme';

import { findPuja, NAVANG_GOAL_KEY, pujaEntryVisible } from './puja-logic';

/**
 * "Do puja" for Home's Today card, beside "Watch live darshan" (the same
 * button look): opens the virtual Navang puja (/puja). Shown to visitors who
 * are not signed in and to members alike, while the organization's access
 * level for the Virtual puja area lets them in (open to the public unless the
 * organization says otherwise; the Gyan Path module must be on) and the
 * community has the Navang puja lesson with its practice step (found by key,
 * as the puja screen finds it). Nothing shows while that is checked; if the
 * check fails the button shows anyway and the puja screen says what went
 * wrong, with Try again. `style` lets it share a row with the darshan button
 * (`{ flex: 1 }`).
 */
export function PujaEntry({ style }: { style?: StyleProp<ViewStyle> }) {
  const t = useT();
  const router = useRouter();
  const { center } = useApp();
  const access = useFeature('puja');
  const wanted = access.allowed && !!center;
  const check = useLoad(
    () => (wanted && center ? loadGyan(center, [], { goalKey: NAVANG_GOAL_KEY }).then((d) => findPuja(d.goals) !== null) : Promise.resolve(false)),
    [wanted, center?.id],
    'check for the virtual puja',
  );
  if (!wanted || !pujaEntryVisible(check.data, check.error !== null)) return null;
  return (
    <Pressable
      onPress={() => router.push('/puja')}
      accessibilityRole="button"
      accessibilityLabel={t('puja.entryA11y')}
      style={({ pressed }) => [
        {
          minHeight: touch.min,
          borderRadius: radii.lg,
          borderWidth: 1,
          borderColor: colors.borderInput,
          backgroundColor: colors.ground,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: space.sm,
          paddingHorizontal: space.md,
          opacity: pressed ? 0.8 : 1,
        },
        style,
      ]}>
      <Icon name="flame-outline" size={16} color={colors.saffron} />
      <Txt variant="small" color="navy" style={{ fontFamily: fonts.bodyMedium }}>
        {t('puja.entry')}
      </Txt>
    </Pressable>
  );
}

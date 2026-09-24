import { Pressable } from 'react-native';

import { Txt } from '@/components/ui';
import { colors, fonts, radii, space } from '@/theme';

import { GiftGlyph } from './icons';

/** Round −/+ button in store green. */
export function QtyButton({ glyph, label, onPress, size = 44 }: { glyph: '−' | '+'; label: string; onPress: () => void; size?: number }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={size < 44 ? (44 - size) / 2 : 0}
      style={({ pressed }) => ({ width: size, height: size, borderRadius: size / 2, borderWidth: 1, borderColor: colors.store, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}>
      <Txt color="store" style={{ fontFamily: fonts.bodySemi, fontSize: 20, lineHeight: 24 }}>
        {glyph}
      </Txt>
    </Pressable>
  );
}

/** Gift pack toggle (prototype L1042): amber when on. */
export function GiftToggle({ on, label, onPress, grow, compact }: { on: boolean; label: string; onPress: () => void; grow?: boolean; compact?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="switch"
      accessibilityState={{ checked: on }}
      accessibilityLabel={label}
      style={({ pressed }) => ({
        flexGrow: grow ? 1 : 0,
        minHeight: compact ? 40 : 44,
        borderRadius: compact ? radii.xxl : radii.pill,
        borderWidth: 1,
        borderColor: on ? colors.brown : colors.borderInput,
        backgroundColor: on ? colors.brownTint : colors.card,
        paddingHorizontal: space.md,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        opacity: pressed ? 0.8 : 1,
      })}>
      {compact ? null : <GiftGlyph color={on ? colors.brown : colors.muted} />}
      <Txt variant={compact ? 'caption' : 'meta'} color={on ? 'brown' : 'muted'} style={{ fontFamily: fonts.bodySemi }}>
        {label}
      </Txt>
    </Pressable>
  );
}

import type { ReactNode } from 'react';
import { Pressable, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { Txt } from '@/components/ui';
import { useSettings } from '@/providers/settings';
import { colors, fonts, radii, space } from '@/theme';

const FLAME = 'M12 2c1 3.5-1.5 5.2-1.5 7.6 0 1.4.9 2.4 2 2.4 1.5 0 2.3-1.3 2-3.2 2.4 1.8 4 4.6 4 7.4A6.5 6.5 0 0 1 12 22.5 6.5 6.5 0 0 1 5.5 16.2C5.5 10.6 10.4 7.8 12 2z';
const STAR = 'M12 2l2.9 6.3 6.9.7-5.2 4.6 1.5 6.8L12 17l-6.1 3.4 1.5-6.8L2.2 9l6.9-.7z';

export function FlameGlyph({ size, color = colors.flame }: { size: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden importantForAccessibility="no">
      <Path d={FLAME} fill={color} />
    </Svg>
  );
}

export function StarGlyph({ size, color = colors.gold }: { size: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden importantForAccessibility="no">
      <Path d={STAR} fill={color} />
    </Svg>
  );
}

export function PlayGlyph({ size, color = colors.navy, paused }: { size: number; color?: string; paused?: boolean }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden importantForAccessibility="no">
      <Path d={paused ? 'M7 5h4v14H7zM13 5h4v14h-4z' : 'M8 5v14l11-7z'} fill={color} />
    </Svg>
  );
}

/** Gyan Path header chips (GyanPath.dc.html L32–33): 🔥 streak and ★ points. */
export function HeaderChips({ streak, points, streakLabel, pointsLabel }: { streak: number; points: number; streakLabel: string; pointsLabel: string }) {
  const chip = (icon: ReactNode, value: string, color: string, label: string) => (
    <View
      accessible
      accessibilityLabel={label}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.borderInput, borderRadius: 16, paddingVertical: 5, paddingHorizontal: 10 }}>
      {icon}
      <Text style={{ fontFamily: fonts.bodyBold, fontSize: 14, color }}>{value}</Text>
    </View>
  );
  return (
    <View style={{ flexDirection: 'row', gap: 6, flexShrink: 0 }}>
      {chip(<FlameGlyph size={16} color={colors.badge} />, String(streak), colors.saffron, streakLabel)}
      {chip(<StarGlyph size={16} />, points.toLocaleString('en-US'), colors.navy, pointsLabel)}
    </View>
  );
}

/**
 * The Gyan Path "3D" button: solid fill with a darker 5px bottom edge
 * (box-shadow 0 5px 0 …). Drawn as a coloured base under the face so it works
 * the same on Android.
 */
export function Button3D({
  label,
  onPress,
  bg,
  edge,
  disabled,
  busy,
  accessibilityHint,
  style,
  height = 54,
}: {
  label: string;
  onPress: () => void;
  bg: string;
  edge: string;
  disabled?: boolean;
  busy?: boolean;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
  height?: number;
}) {
  const { scale } = useSettings();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || busy}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!(disabled || busy), busy: !!busy }}
      style={[{ borderRadius: radii.cta, backgroundColor: edge, paddingBottom: 5 }, style]}>
      {({ pressed }) => (
        <View
          style={{
            minHeight: height,
            borderRadius: radii.cta,
            backgroundColor: bg,
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: space.gutter,
            transform: [{ translateY: pressed ? 3 : 0 }],
          }}>
          <Text style={{ fontFamily: fonts.bodyBold, fontSize: 16 * scale, lineHeight: 21 * scale, color: colors.white, textAlign: 'center' }}>{label}</Text>
        </View>
      )}
    </Pressable>
  );
}

/** Round initial in a member's colour (Saathi circle, learning with family). */
export function InitialAvatar({ name, color, size = 36 }: { name: string; color: string; size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }} accessibilityElementsHidden importantForAccessibility="no">
      <Txt variant="smallStrong" color="white" style={{ fontFamily: fonts.bodyBold }}>
        {name.trim().charAt(0).toUpperCase() || '?'}
      </Txt>
    </View>
  );
}

/** Member colours in the prototype's order (Priya navy, Rahul store green, Anya saffron, Dev purple). */
export const MEMBER_COLORS = [colors.navy, colors.store, colors.saffron, colors.purple, colors.maroon, colors.brown];

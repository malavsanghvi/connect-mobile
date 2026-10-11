import type { ReactNode } from 'react';
import type { ColorValue } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import type { Motif } from '@/lib/template';
import { colors } from '@/theme';

/**
 * The small decorative glyphs the member-app template can name as its `motif` (src/lib/template.ts MOTIFS), drawn with the same
 * outline style as the bar's icons (24-unit viewBox, round caps and joins). They are ornament only: hidden from assistive
 * technology, never the only carrier of a meaning. A motif the template names that is not here is never drawn (isMotif).
 */
const shapes: Record<Motif, ReactNode> = {
  leaf: <Path d="M5 19c0-8 5-14 14-14 0 9-6 14-14 14zM5 19l8-8" />,
  wave: <Path d="M2 9c2.5-3 5-3 7.5 0s5 3 7.5 0 3-3 5 0M2 15c2.5-3 5-3 7.5 0s5 3 7.5 0 3-3 5 0" />,
  sun: (
    <>
      <Circle cx="12" cy="12" r="4" />
      <Path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" />
    </>
  ),
  star: <Path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" />,
  lotus: (
    <>
      <Path d="M12 4c2.5 3 3.5 6.5 0 12-3.5-5.5-2.5-9 0-12z" />
      <Path d="M12 16c-4 0-7-2-8-6 3.5.3 6 1.8 8 6zM12 16c4 0 7-2 8-6-3.5.3-6 1.8-8 6z" />
      <Path d="M7 20h10" />
    </>
  ),
};

export function MotifGlyph({ name, size = 18, color = colors.saffron }: { name: Motif; size?: number; color?: ColorValue }) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      accessibilityElementsHidden
      importantForAccessibility="no"
      pointerEvents="none">
      {shapes[name]}
    </Svg>
  );
}

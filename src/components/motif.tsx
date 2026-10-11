import type { ReactNode } from 'react';
import type { ColorValue } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { MOTIF_LABEL_KEYS, type Motif } from '@/lib/template';
import { useT } from '@/providers/settings';
import { colors } from '@/theme';

/**
 * The small decorative glyphs the member-app template can name as its `motif` (src/lib/template.ts MOTIFS), drawn with the same
 * outline style as the bar's icons (24-unit viewBox, round caps and joins, one colour, no fill, no gradient, no text). The last
 * five are the faith motifs a faith overlay sends (om, cross, crescent, khanda, dharma_wheel): kept to a few plain strokes so
 * they stay recognisable at 18px. A motif the template names that is not here is never drawn (isMotif).
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
  // The Devanagari Om: the three-lobed body, the tail, and the crescent with its dot above.
  om: (
    <>
      <Path d="M5 7.5c0-2 1.6-3.4 3.6-3.4 2.1 0 3.2 1.5 2.7 3-.5 1.4-2.1 2.3-4.2 2.5" />
      <Path d="M7.4 9.6c4.8-.7 7.4 1.2 6.6 4.6-.8 3.3-5.3 4.9-8.4 3.1-1.2-.7-1.7-1.7-1.7-2.5" />
      <Path d="M13.8 12c1.7-1 3.9-.5 4.2 1.6.3 1.9-.2 3.6 2.2 4.1" />
      <Path d="M13.6 5.6c1.4 2.2 4.6 2.2 6.2 0" />
      <Circle cx="17.4" cy="3" r=".6" />
    </>
  ),
  // A plain upright Latin cross, outlined.
  cross: <Path d="M10 3h4v5h5v4h-5v9h-4v-9H5V8h5z" />,
  // A crescent opening to the right, with a small five-pointed star in the opening.
  crescent: (
    <>
      <Path d="M15 4.2A8.5 8.5 0 1 0 15 19.8 7.9 7.9 0 0 1 15 4.2z" />
      <Path d="M18.2 9.6l.8 1.7 1.8.2-1.3 1.2.4 1.8-1.7-.9-1.7.9.4-1.8-1.3-1.2 1.8-.2z" />
    </>
  ),
  // The Sikh khanda: the double-edged blade through the ring, with a kirpan curving up on each side.
  khanda: (
    <>
      <Path d="M12 2v13M12 1.8l1.5 3.2h-3z" />
      <Circle cx="12" cy="10" r="4.4" />
      <Path d="M12 15v6" />
      <Path d="M11 21.5C5 20.5 2.5 15 4.5 8M13 21.5C19 20.5 21.5 15 19.5 8" />
    </>
  ),
  // The Buddhist dharma wheel: a rim, a hub and eight spokes.
  dharma_wheel: (
    <>
      <Circle cx="12" cy="12" r="9" />
      <Circle cx="12" cy="12" r="2.2" />
      <Path d="M12 3v6.8M12 14.2V21M3 12h6.8M14.2 12H21M5.6 5.6l4.8 4.8M13.6 13.6l4.8 4.8M18.4 5.6l-4.8 4.8M10.4 13.6l-4.8 4.8" />
    </>
  ),
};

/**
 * `decorative` hides the glyph from screen readers: the Home header already announces the community's name as one item, so the
 * ornament beside it adds nothing there. Anywhere else the glyph is a labelled image ("Om symbol").
 */
export function MotifGlyph({ name, size = 18, color = colors.saffron, decorative = false }: { name: Motif; size?: number; color?: ColorValue; decorative?: boolean }) {
  const t = useT();
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
      {...(decorative
        ? { accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' as const }
        : { accessible: true, accessibilityRole: 'image' as const, accessibilityLabel: t(MOTIF_LABEL_KEYS[name]) })}
      pointerEvents="none">
      {shapes[name]}
    </Svg>
  );
}

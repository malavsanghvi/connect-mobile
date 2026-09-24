import type { ReactNode } from 'react';
import type { ColorValue } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { colors } from '@/theme';

/**
 * The prototype's hand-drawn outline icons (Main.dc.html inline SVGs: 24-unit
 * viewBox, round caps and joins). Paths are copied from the prototype so the
 * shell (header, tab bar, drawer, Niva) matches it exactly. Screens still use
 * the Ionicons-based `Icon` until they are reworked.
 */
export type StrokeIconName =
  | 'menu'
  | 'back'
  | 'forward'
  | 'close'
  | 'qr'
  | 'home'
  | 'calendar'
  | 'calendar-dots'
  | 'calendar-check'
  | 'heart'
  | 'book'
  | 'people'
  | 'bag'
  | 'chart'
  | 'info'
  | 'gear'
  | 'sparkle'
  | 'lock'
  | 'scan'
  | 'sign-in';

const calendarBase = (
  <>
    <Rect x="3" y="5" width="18" height="16" rx="2" />
    <Path d="M16 3v4M8 3v4M3 11h18" />
  </>
);

const shapes: Record<StrokeIconName, ReactNode> = {
  menu: <Path d="M4 7h16M4 12h16M4 17h10" />,
  back: <Path d="M15 18l-6-6 6-6" />,
  forward: <Path d="M9 6l6 6-6 6" />,
  close: <Path d="M6 6l12 12M18 6L6 18" />,
  qr: (
    <>
      <Rect x="3" y="3" width="7" height="7" />
      <Rect x="14" y="3" width="7" height="7" />
      <Rect x="3" y="14" width="7" height="7" />
      <Path d="M14 14h3v3h-3zM20 14v.01M14 20h.01M17 20h4" />
    </>
  ),
  home: <Path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />,
  calendar: calendarBase,
  'calendar-dots': (
    <>
      {calendarBase}
      <Path d="M8 15h.01M12 15h.01M16 15h.01" />
    </>
  ),
  'calendar-check': (
    <>
      {calendarBase}
      <Path d="M9 16l2 2 4-4" />
    </>
  ),
  heart: <Path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21.2l8.8-8.8a5.5 5.5 0 0 0 0-7.8z" />,
  book: <Path d="M2 4h7a3 3 0 0 1 3 3v14a2 2 0 0 0-2-2H2zM22 4h-7a3 3 0 0 0-3 3v14a2 2 0 0 1 2-2h8z" />,
  people: (
    <>
      <Circle cx="9" cy="8" r="3.5" />
      <Path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6 6 0 0 1 3.5 6" />
    </>
  ),
  bag: (
    <>
      <Path d="M5 8h14l-1.2 12H6.2z" />
      <Path d="M9 8V6a3 3 0 0 1 6 0v2" />
    </>
  ),
  chart: <Path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  info: (
    <>
      <Circle cx="12" cy="12" r="9" />
      <Path d="M12 11v6M12 7.5v.01" />
    </>
  ),
  gear: (
    <>
      <Circle cx="12" cy="12" r="3" />
      <Path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </>
  ),
  sparkle: (
    <>
      <Path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z" />
      <Path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" />
    </>
  ),
  lock: (
    <>
      <Rect x="4" y="11" width="16" height="10" rx="2" />
      <Path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </>
  ),
  scan: <Path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M7 12h10" />,
  'sign-in': <Path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3" />,
};

/** Decorative outline icon; meaning is always also carried by text. */
export function StrokeIcon({ name, size = 22, color = colors.navy, strokeWidth = 1.8 }: { name: StrokeIconName; size?: number; color?: ColorValue; strokeWidth?: number }) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      accessibilityElementsHidden
      importantForAccessibility="no"
      pointerEvents="none">
      {shapes[name]}
    </Svg>
  );
}

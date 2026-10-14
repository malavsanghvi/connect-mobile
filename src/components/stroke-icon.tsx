import type { ReactNode } from 'react';
import type { ColorValue } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { colors } from '@/theme';

/**
 * Outline icons on a 24-unit grid, stroke 2, round caps and joins. Every icon the Weaver brand kit draws (the 21 in connect-crm
 * brand/icons, copied to assets/brand/icons) uses the kit's own paths: arrow, bag, book, calendar, card, chart, check, chevron,
 * close, globe, heart, history, home, lock, mail, menu, phone, shield, smile, ticket and users (here `people`). `back` and
 * `forward` are the kit's chevron turned; qr, info, gear, sparkle, scan, sign-in and the two calendar variants are the app's own,
 * drawn in the same style. `Icon` (icon.tsx) draws the kit's icon wherever one stands for the Ionicons name asked for; the rest of
 * the Ionicons wait for the kit to extend its set (docs/BRAND_CONFORMANCE.md lists them).
 */
export type StrokeIconName =
  | 'arrow'
  | 'card'
  | 'check'
  | 'chevron'
  | 'globe'
  | 'history'
  | 'mail'
  | 'phone'
  | 'shield'
  | 'smile'
  | 'ticket'
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
    <Rect x="3" y="4" width="18" height="18" rx="2" />
    <Path d="M16 2v4M8 2v4M3 10h18" />
  </>
);

const shapes: Record<StrokeIconName, ReactNode> = {
  arrow: <Path d="M5 12h14M12 5l7 7-7 7" />,
  card: (
    <>
      <Rect x="2" y="5" width="20" height="14" rx="2" />
      <Path d="M2 10h20" />
    </>
  ),
  check: <Path d="M20 6 9 17l-5-5" />,
  chevron: <Path d="m6 9 6 6 6-6" />,
  globe: (
    <>
      <Circle cx="12" cy="12" r="10" />
      <Path d="M2 12h20" />
      <Path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10Z" />
    </>
  ),
  history: (
    <>
      <Path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <Path d="M3 3v5h5" />
      <Path d="M12 7v5l4 2" />
    </>
  ),
  mail: (
    <>
      <Rect x="2" y="4" width="20" height="16" rx="2" />
      <Path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
    </>
  ),
  phone: (
    <>
      <Rect x="5" y="2" width="14" height="20" rx="2" />
      <Path d="M12 18h.01" />
    </>
  ),
  shield: <Path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />,
  smile: (
    <>
      <Circle cx="12" cy="12" r="10" />
      <Path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01" />
    </>
  ),
  ticket: (
    <>
      <Path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z" />
      <Path d="M13 5v2M13 17v2M13 11v2" />
    </>
  ),
  menu: <Path d="M4 6h16M4 12h16M4 18h16" />,
  back: <Path d="M15 18l-6-6 6-6" />,
  forward: <Path d="M9 6l6 6-6 6" />,
  close: <Path d="M18 6 6 18M6 6l12 12" />,
  qr: (
    <>
      <Rect x="3" y="3" width="7" height="7" />
      <Rect x="14" y="3" width="7" height="7" />
      <Rect x="3" y="14" width="7" height="7" />
      <Path d="M14 14h3v3h-3zM20 14v.01M14 20h.01M17 20h4" />
    </>
  ),
  home: (
    <>
      <Path d="m3 10 9-7 9 7v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
      <Path d="M9 22V12h6v10" />
    </>
  ),
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
  heart: <Path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />,
  book: <Path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />,
  people: (
    <>
      <Path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <Circle cx="9" cy="7" r="4" />
      <Path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <Path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </>
  ),
  bag: (
    <>
      <Path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
      <Path d="M3 6h18" />
      <Path d="M16 10a4 4 0 0 1-8 0" />
    </>
  ),
  chart: (
    <>
      <Path d="M3 3v18h18" />
      <Path d="M18 17V9M13 17V5M8 17v-3" />
    </>
  ),
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
      <Rect x="3" y="11" width="18" height="11" rx="2" />
      <Path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </>
  ),
  scan: <Path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M7 12h10" />,
  'sign-in': <Path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3" />,
};

/** Decorative outline icon; meaning is always also carried by text. */
export function StrokeIcon({ name, size = 22, color = colors.navy, strokeWidth = 2 }: { name: StrokeIconName; size?: number; color?: ColorValue; strokeWidth?: number }) {
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

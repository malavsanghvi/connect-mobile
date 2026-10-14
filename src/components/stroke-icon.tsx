import type { ReactNode } from 'react';
import type { ColorValue } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { colors } from '@/theme';

/**
 * Outline icons on a 24-unit grid, stroke 2, round caps and joins. Every icon the Weaver brand kit draws (the 42 in connect-crm
 * brand/icons, copied to assets/brand/icons) uses the kit's own shapes, name for name (the kit's `users` is `people` here);
 * a test compares them with the kit's SVG files. `back` and `forward` are the kit's chevron turned; `qr`, `scan`, `sign-in` and the
 * two calendar variants are the app's own, drawn in the same style until the kit has them. `Icon` (icon.tsx) draws the kit's icon
 * wherever one stands for the Ionicons name asked for; the rest of the Ionicons wait for the kit to extend its set
 * (docs/BRAND_CONFORMANCE.md lists them).
 */
export type StrokeIconName =
  | 'alert'
  | 'approve'
  | 'arrow'
  | 'bag'
  | 'bank'
  | 'book'
  | 'calendar'
  | 'card'
  | 'chart'
  | 'check'
  | 'chevron'
  | 'close'
  | 'count'
  | 'eye'
  | 'file'
  | 'globe'
  | 'heart'
  | 'help'
  | 'history'
  | 'home'
  | 'info'
  | 'list'
  | 'lock'
  | 'mail'
  | 'menu'
  | 'more'
  | 'pencil'
  | 'people'
  | 'person'
  | 'phone'
  | 'plus'
  | 'refund'
  | 'search'
  | 'send'
  | 'server'
  | 'settings'
  | 'shield'
  | 'smile'
  | 'sparkle'
  | 'star'
  | 'ticket'
  | 'upload'
  | 'back'
  | 'forward'
  | 'qr'
  | 'scan'
  | 'sign-in'
  | 'calendar-dots'
  | 'calendar-check';

const calendarBase = (
  <>
    <Rect x="3" y="4" width="18" height="18" rx="2" />
    <Path d="M16 2v4M8 2v4M3 10h18" />
  </>
);

const shapes: Record<StrokeIconName, ReactNode> = {
  alert: (
    <>
      <Circle cx="12" cy="12" r="10" />
      <Path d="M12 8v4M12 16h.01" />
    </>
  ),
  approve: <Path d="M9 12l2 2 4-4M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z" />,
  arrow: <Path d="M5 12h14M12 5l7 7-7 7" />,
  bag: (
    <>
      <Path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
      <Path d="M3 6h18" />
      <Path d="M16 10a4 4 0 0 1-8 0" />
    </>
  ),
  bank: <Path d="M3 10h18M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18M12 3l9 5H3z" />,
  book: <Path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />,
  calendar: calendarBase,
  card: (
    <>
      <Rect x="2" y="5" width="20" height="14" rx="2" />
      <Path d="M2 10h20" />
    </>
  ),
  chart: (
    <>
      <Path d="M3 3v18h18" />
      <Path d="M18 17V9M13 17V5M8 17v-3" />
    </>
  ),
  check: <Path d="M20 6 9 17l-5-5" />,
  chevron: <Path d="m6 9 6 6 6-6" />,
  close: <Path d="M18 6 6 18M6 6l12 12" />,
  count: <Path d="M5 8h14l-1 12H6zM9 8V5h6v3" />,
  eye: (
    <>
      <Path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
      <Circle cx="12" cy="12" r="3" />
    </>
  ),
  file: <Path d="M6 3h9l4 4v14H6zM14 3v5h5M9 13h6M9 17h6" />,
  globe: (
    <>
      <Circle cx="12" cy="12" r="10" />
      <Path d="M2 12h20" />
      <Path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10Z" />
    </>
  ),
  heart: <Path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />,
  help: (
    <>
      <Circle cx="12" cy="12" r="10" />
      <Path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3M12 17h.01" />
    </>
  ),
  history: (
    <>
      <Path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <Path d="M3 3v5h5" />
      <Path d="M12 7v5l4 2" />
    </>
  ),
  home: (
    <>
      <Path d="m3 10 9-7 9 7v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
      <Path d="M9 22V12h6v10" />
    </>
  ),
  info: (
    <>
      <Circle cx="12" cy="12" r="10" />
      <Path d="M12 16v-4M12 8h.01" />
    </>
  ),
  list: <Path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />,
  lock: (
    <>
      <Rect x="3" y="11" width="18" height="11" rx="2" />
      <Path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </>
  ),
  mail: (
    <>
      <Rect x="2" y="4" width="20" height="16" rx="2" />
      <Path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
    </>
  ),
  menu: <Path d="M4 6h16M4 12h16M4 18h16" />,
  more: <Path d="M5 12h.01M12 12h.01M19 12h.01" strokeWidth={3.6} />,
  pencil: <Path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />,
  people: (
    <>
      <Path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <Circle cx="9" cy="7" r="4" />
      <Path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <Path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </>
  ),
  person: <Path d="M15.5 8a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0zM4.5 21c0-3.9 3.4-6 7.5-6s7.5 2.1 7.5 6" />,
  phone: (
    <>
      <Rect x="5" y="2" width="14" height="20" rx="2" />
      <Path d="M12 18h.01" />
    </>
  ),
  plus: <Path d="M12 5v14M5 12h14" />,
  refund: <Path d="M4 9h12a4 4 0 0 1 0 8H8M4 9l4-4M4 9l4 4" />,
  search: (
    <>
      <Circle cx="11" cy="11" r="7" />
      <Path d="M20 20l-3.5-3.5" />
    </>
  ),
  send: <Path d="M3 11l18-8-8 18-2-8z" />,
  server: <Path d="M4 5h16v6H4zM4 13h16v6H4zM8 8h.01M8 16h.01" />,
  settings: <Path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" />,
  shield: <Path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />,
  smile: (
    <>
      <Circle cx="12" cy="12" r="10" />
      <Path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01" />
    </>
  ),
  sparkle: <Path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" />,
  star: <Path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9-5.2-2.8-5.2 2.8 1-5.9L3.5 9.7l5.9-.8z" />,
  ticket: (
    <>
      <Path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z" />
      <Path d="M13 5v2M13 17v2M13 11v2" />
    </>
  ),
  upload: <Path d="M12 16V4M7 9l5-5 5 5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />,
  // The kit's chevron, turned.
  back: <Path d="M15 18l-6-6 6-6" />,
  forward: <Path d="M9 6l6 6-6 6" />,
  // The app's own, in the kit's style, until the kit has them.
  qr: (
    <>
      <Rect x="3" y="3" width="7" height="7" />
      <Rect x="14" y="3" width="7" height="7" />
      <Rect x="3" y="14" width="7" height="7" />
      <Path d="M14 14h3v3h-3zM20 14v.01M14 20h.01M17 20h4" />
    </>
  ),
  scan: <Path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M7 12h10" />,
  'sign-in': <Path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3" />,
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

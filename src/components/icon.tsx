import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import type { ColorValue } from 'react-native';

import { colors } from '@/theme';

import { StrokeIcon, type StrokeIconName } from './stroke-icon';

export type IconName = ComponentProps<typeof Ionicons>['name'];

/**
 * The Ionicons names the brand kit draws itself. `Icon` renders the kit's icon for these (stroke 2, the kit's paths); every other
 * name is still an Ionicon until the kit extends its set (docs/BRAND_CONFORMANCE.md lists them). Icons that show a state by being
 * filled or outlined (the heart of a like) are not here: the kit's icons are outline only.
 */
export const KIT_ICON_FOR: Partial<Record<IconName, StrokeIconName>> = {
  checkmark: 'check',
  close: 'close',
  menu: 'menu',
  'arrow-forward': 'arrow',
  'chevron-forward': 'forward',
  'chevron-back': 'back',
  'chevron-down': 'chevron',
  calendar: 'calendar',
  'calendar-outline': 'calendar',
  people: 'people',
  'people-outline': 'people',
  ticket: 'ticket',
  'ticket-outline': 'ticket',
  card: 'card',
  'card-outline': 'card',
  book: 'book',
  'book-outline': 'book',
  home: 'home',
  'home-outline': 'home',
  mail: 'mail',
  'mail-outline': 'mail',
  globe: 'globe',
  'globe-outline': 'globe',
  'lock-closed': 'lock',
  'lock-closed-outline': 'lock',
  bag: 'bag',
  'bag-outline': 'bag',
  'bar-chart-outline': 'chart',
  'happy-outline': 'smile',
};

/** Decorative icon. Meaning is always also carried by text (no information by icon or colour alone). */
export function Icon({ name, size = 22, color = colors.ink }: { name: IconName; size?: number; color?: ColorValue }) {
  const kit = KIT_ICON_FOR[name];
  if (kit) return <StrokeIcon name={kit} size={size} color={color} />;
  return <Ionicons name={name} size={size} color={color} accessibilityElementsHidden importantForAccessibility="no" />;
}

export const iconFont = Ionicons.font;

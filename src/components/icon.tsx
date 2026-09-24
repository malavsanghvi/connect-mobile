import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import type { ColorValue } from 'react-native';

import { colors } from '@/theme';

export type IconName = ComponentProps<typeof Ionicons>['name'];

/** Decorative icon. Meaning is always also carried by text (no information by icon or colour alone). */
export function Icon({ name, size = 22, color = colors.ink }: { name: IconName; size?: number; color?: ColorValue }) {
  return <Ionicons name={name} size={size} color={color} accessibilityElementsHidden importantForAccessibility="no" />;
}

export const iconFont = Ionicons.font;

import type { ColorValue } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

/**
 * Outline icons used only by the Home and Events screens, with paths copied
 * from Main.dc.html (photo L178, lunch L332, ticket QR L325, flame L74, star L1267).
 */
export type EventIconName = 'photo' | 'lunch' | 'ticket-qr' | 'flame' | 'star';

export function EventIcon({ name, size = 22, color, strokeWidth = 1.6 }: { name: EventIconName; size?: number; color: ColorValue; strokeWidth?: number }) {
  if (name === 'flame' || name === 'star') {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24" fill={color} stroke="none" accessibilityElementsHidden importantForAccessibility="no" pointerEvents="none">
        {name === 'flame' ? (
          <Path d="M12 2c1 3.5-1.5 5.2-1.5 7.6 0 1.4.9 2.4 2 2.4 1.5 0 2.3-1.3 2-3.2 2.4 1.8 4 4.6 4 7.4A6.5 6.5 0 0 1 12 22.5 6.5 6.5 0 0 1 5.5 16.2C5.5 10.6 10.4 7.8 12 2z" />
        ) : (
          <Path d="M12 2l2.9 6.3 6.9.7-5.2 4.6 1.5 6.8L12 17l-6.1 3.4 1.5-6.8L2.2 9l6.9-.7z" />
        )}
      </Svg>
    );
  }
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
      {name === 'photo' ? (
        <>
          <Rect x="3" y="4" width="18" height="16" rx="2" />
          <Circle cx="9" cy="10" r="2" />
          <Path d="M21 17l-5-5-9 8" />
        </>
      ) : null}
      {name === 'lunch' ? <Path d="M7 3v8M5 3v4a2 2 0 0 0 4 0V3M7 11v10M17 21V3c-2 0-4 2-4 6v4h4" /> : null}
      {name === 'ticket-qr' ? (
        <>
          <Rect x="3" y="3" width="7" height="7" />
          <Rect x="14" y="3" width="7" height="7" />
          <Rect x="3" y="14" width="7" height="7" />
          <Path d="M14 14h3v3h-3zM20 20h-3" />
        </>
      ) : null}
    </Svg>
  );
}

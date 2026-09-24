import Svg, { Circle, Path, Rect } from 'react-native-svg';

/** Stroke glyphs used only by the Give screens (prototype Main.dc.html L381, L1034, L1042). */

export function RepeatGlyph({ size = 22, color }: { size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" accessibilityElementsHidden importantForAccessibility="no">
      <Path d="M21 12a9 9 0 0 1-15.5 6.2M3 12a9 9 0 0 1 15.5-6.2" />
      <Path d="M18 2v4h-4M6 22v-4h4" />
    </Svg>
  );
}

export function GiftGlyph({ size = 16, color }: { size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" accessibilityElementsHidden importantForAccessibility="no">
      <Rect x="3" y="8" width="18" height="4" rx="1" />
      <Path d="M12 8v13M5 12v9h14v-9M12 8C10 4 7 4 7 6.5S10 8 12 8zM12 8c2-4 5-4 5-1.5S14 8 12 8z" />
    </Svg>
  );
}

export function PhotoGlyph({ size = 26, color }: { size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" accessibilityElementsHidden importantForAccessibility="no">
      <Rect x="3" y="4" width="18" height="16" rx="2" />
      <Circle cx="9" cy="10" r="2" />
      <Path d="M21 17l-5-5-9 8" />
    </Svg>
  );
}

export function PlayGlyph({ size = 22, color }: { size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={color} accessibilityElementsHidden importantForAccessibility="no">
      <Path d="M8 5v14l11-7z" />
    </Svg>
  );
}

export function ChevronGlyph({ size = 14, color, rotate = 0 }: { size?: number; color: string; rotate?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" style={{ transform: [{ rotate: `${rotate}deg` }] }} accessibilityElementsHidden importantForAccessibility="no">
      <Path d="M9 6l6 6-6 6" />
    </Svg>
  );
}

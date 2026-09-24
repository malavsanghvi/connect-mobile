import QRCode from 'react-native-qrcode-svg';
import { View } from 'react-native';

import { colors, radii } from '@/theme';

/** QR code on a white panel (quiet zone included) so scanners read it in any light. */
export function Qr({ value, size = 180, label, color = colors.ink, radius = radii.lg, padding = 12 }: { value: string; size?: number; label: string; color?: string; radius?: number; padding?: number }) {
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={label} style={{ backgroundColor: colors.white, padding, borderRadius: radius, alignSelf: 'center' }}>
      <QRCode value={value} size={size} color={color} backgroundColor={colors.white} ecl="M" />
    </View>
  );
}

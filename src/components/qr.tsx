import QRCode from 'react-native-qrcode-svg';
import { View } from 'react-native';

import { colors, radii } from '@/theme';

/** QR code on a white panel (quiet zone included) so scanners read it in any light. */
export function Qr({ value, size = 180, label }: { value: string; size?: number; label: string }) {
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={label} style={{ backgroundColor: colors.white, padding: 12, borderRadius: radii.lg, alignSelf: 'center' }}>
      <QRCode value={value} size={size} color={colors.ink} backgroundColor={colors.white} ecl="M" />
    </View>
  );
}

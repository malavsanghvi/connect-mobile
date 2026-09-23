import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { Platform, View } from 'react-native';

import { useT } from '@/providers/settings';
import { colors, radii } from '@/theme';

import { Banner, Button, Card, Txt } from './ui';

/**
 * Camera QR scanner with the permission prompt and a web notice. `paused`
 * stops delivering scans (e.g. while a result is shown or a request runs).
 */
export function QrScanner({ onScan, paused, height = 320 }: { onScan: (data: string) => void; paused: boolean; height?: number }) {
  const t = useT();
  const [permission, requestPermission] = useCameraPermissions();
  if (Platform.OS === 'web') return <Banner tone="info" message={t('scan.webNote')} />;
  if (!permission) return null;
  if (!permission.granted) {
    return (
      <Card tone="panel">
        <Txt variant="small">{permission.canAskAgain ? t('scan.cameraAsk') : t('scan.cameraDenied')}</Txt>
        {permission.canAskAgain ? <Button label={t('scan.allowCamera')} onPress={() => void requestPermission()} size="md" /> : null}
      </Card>
    );
  }
  if (paused) return null;
  return (
    <View style={{ height, borderRadius: radii.xxl, overflow: 'hidden', backgroundColor: colors.black }} accessibilityLabel={t('scan.cameraLabel')}>
      <CameraView style={{ flex: 1 }} facing="back" barcodeScannerSettings={{ barcodeTypes: ['qr'] }} onBarcodeScanned={(r: BarcodeScanningResult) => onScan(r.data)} />
    </View>
  );
}

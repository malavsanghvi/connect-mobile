import { View } from 'react-native';

import { colors, radii } from '@/theme';

/**
 * iOS and Android: the app has no embedded web view, so the stream opens
 * full screen in the system's in-app browser (the screen's Play button);
 * this is the dark stage behind it.
 */
export function DarshanPlayer(_props: { url: string; title: string }) {
  void _props;
  return <View style={{ flex: 1, minHeight: 240, borderRadius: radii.xxl, backgroundColor: colors.videoTile }} />;
}

export const PLAYS_INLINE = false;

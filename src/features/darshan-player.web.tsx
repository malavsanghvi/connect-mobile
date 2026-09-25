import { createElement } from 'react';
import { View } from 'react-native';

import { colors, radii } from '@/theme';

/** Web export: the stream's own embedded player in an iframe (https only; the caller checks). */
export function DarshanPlayer({ url, title }: { url: string; title: string }) {
  return (
    <View style={{ flex: 1, minHeight: 200, borderRadius: radii.xxl, overflow: 'hidden', backgroundColor: colors.videoTile }}>
      {createElement('iframe', {
        src: url,
        title,
        allow: 'autoplay; fullscreen; picture-in-picture',
        allowFullScreen: true,
        referrerPolicy: 'no-referrer',
        sandbox: 'allow-scripts allow-same-origin allow-presentation',
        style: { border: 0, width: '100%', height: '100%', minHeight: 200, backgroundColor: '#000' },
      })}
    </View>
  );
}

export const PLAYS_INLINE = true;

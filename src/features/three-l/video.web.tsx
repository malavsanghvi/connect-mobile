import { createElement } from 'react';
import { View } from 'react-native';

import { youtubeEmbedUrl } from '@/lib/media-library';
import { colors, radii } from '@/theme';

/** Web export: YouTube in its privacy-enhanced embed, uploaded files in the browser's own player. */
export type InlineVideoSource = { kind: 'youtube'; id: string } | { kind: 'file'; url: string };

export const VIDEO_INLINE = true;

/** `onPlay` fires when an uploaded video starts (the 3L audio player pauses then). */
export function InlineVideo({ source, title, onPlay }: { source: InlineVideoSource; title: string; onPlay?: () => void }) {
  const style = { border: 0, width: '100%', height: '100%', minHeight: 200, backgroundColor: colors.videoTile, display: 'block' };
  return (
    <View style={{ width: '100%', aspectRatio: 16 / 9, minHeight: 200, borderRadius: radii.xxl, overflow: 'hidden', backgroundColor: colors.videoTile }}>
      {source.kind === 'youtube'
        ? createElement('iframe', {
            src: youtubeEmbedUrl(source.id),
            title,
            allow: 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share',
            allowFullScreen: true,
            // YouTube refuses embeds that send no referrer.
            referrerPolicy: 'strict-origin-when-cross-origin',
            sandbox: 'allow-scripts allow-same-origin allow-presentation allow-popups',
            style,
          })
        : createElement('video', { src: source.url, title, controls: true, playsInline: true, preload: 'metadata', onPlay, style })}
    </View>
  );
}

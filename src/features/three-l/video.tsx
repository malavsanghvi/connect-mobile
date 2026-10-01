/**
 * iOS and Android: this build has no embedded video player or web view
 * (expo-video / react-native-webview arrive with the next store build), so a
 * video opens full screen in the system's in-app browser — the same hand-off
 * as live darshan. The web export plays it in the page (video.web.tsx).
 */
export type InlineVideoSource = { kind: 'youtube'; id: string } | { kind: 'file'; url: string };

export const VIDEO_INLINE = false;

export function InlineVideo(_props: { source: InlineVideoSource; title: string; onPlay?: () => void }) {
  void _props;
  return null;
}

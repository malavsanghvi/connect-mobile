import { View } from 'react-native';

import { space } from '@/theme';

import { Txt } from './ui';

/**
 * Minimal, safe rendering of center-authored Markdown (headings, bullets,
 * paragraphs). Links are shown as "text (url)"; no HTML is interpreted.
 */
export function Markdownish({ source }: { source: string }) {
  const blocks = source.replace(/\r\n/g, '\n').split(/\n{2,}/);
  const clean = (s: string) => s.replace(/\*\*(.+?)\*\*/g, '$1').replace(/__(.+?)__/g, '$1').replace(/\[(.+?)\]\((.+?)\)/g, '$1 ($2)').replace(/`(.+?)`/g, '$1');
  return (
    <View style={{ gap: space.md }}>
      {blocks.map((block, i) => {
        const lines = block.split('\n').filter((l) => l.trim().length);
        if (lines.length === 0) return null;
        const heading = /^(#{1,6})\s+(.*)$/.exec(lines[0]);
        if (heading && lines.length === 1) {
          return (
            <Txt key={i} variant={heading[1].length <= 2 ? 'headline' : 'section'} color="navy" accessibilityRole="header">
              {clean(heading[2])}
            </Txt>
          );
        }
        if (lines.every((l) => /^\s*([-*•]|\d+\.)\s+/.test(l))) {
          return (
            <View key={i} style={{ gap: 4 }}>
              {lines.map((l, j) => (
                <Txt key={j} variant="body" color="ink2">
                  {`•  ${clean(l.replace(/^\s*([-*•]|\d+\.)\s+/, ''))}`}
                </Txt>
              ))}
            </View>
          );
        }
        return (
          <Txt key={i} variant="body" color="ink2">
            {clean(lines.map((l) => l.replace(/^#{1,6}\s+/, '')).join(' '))}
          </Txt>
        );
      })}
    </View>
  );
}

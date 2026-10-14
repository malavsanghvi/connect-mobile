import { useId } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { brandColor, brandRadius, brandTypeStyle } from '@/brand';
import { useSettings } from '@/providers/settings';
import { fonts } from '@/theme';

import { Txt } from './ui';

/**
 * The brand kit's AI tag (connect-crm brand/components/AiTag): "AI" for something Weaver does by itself, "Niva" for something
 * a person asks. The tag is set in capitals, navy-hover on a gold-to-saffron gradient (the one place the kit allows a gradient
 * besides the headline underline), radius-chip, with a small white dot before the word. These are Weaver's own colours, not the
 * community's, so the theme never recolours it.
 */
export type AiTagLabel = 'AI' | 'Niva';

export function AiTag({ label }: { label: AiTagLabel }) {
  const { scale } = useSettings();
  const style = brandTypeStyle('ai-tag');
  // The gradient's id must be unique on a web page that draws several tags.
  const gradient = `ai-tag-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <View
      accessible
      accessibilityLabel={label}
      style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: brandRadius('radius-chip'), overflow: 'hidden', paddingHorizontal: 8, paddingVertical: 4 }}>
      <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" preserveAspectRatio="none" accessibilityElementsHidden importantForAccessibility="no">
        <Defs>
          <LinearGradient id={gradient} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={brandColor('gold')} />
            <Stop offset="1" stopColor={brandColor('saffron')} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${gradient})`} />
      </Svg>
      <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: brandColor('white') }} />
      <Txt
        style={{
          fontFamily: fonts.bodyBold,
          fontSize: style.fontSize * scale,
          lineHeight: style.fontSize * scale + 2,
          letterSpacing: style.letterSpacingEm * style.fontSize,
          color: brandColor('navy-hover'),
        }}>
        {label.toUpperCase()}
      </Txt>
    </View>
  );
}

/**
 * The AI line: the tag, then one sentence that names the person who decides, on saffron-50 with a saffron-200 border and
 * radius-tile. Never show one without the human step, and never for something that is not built.
 */
export function AiLine({ label, children }: { label: AiTagLabel; children: string }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 10,
        backgroundColor: brandColor('saffron-50'),
        borderWidth: 1,
        borderColor: brandColor('saffron-200'),
        borderRadius: brandRadius('radius-tile'),
        padding: 12,
      }}>
      <AiTag label={label} />
      <Txt variant="small" style={{ flex: 1, color: brandColor('ink-2') }}>
        {children}
      </Txt>
    </View>
  );
}

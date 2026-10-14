import { Image } from 'expo-image';
import { useState } from 'react';
import { View } from 'react-native';

import { brandColor, brandTypeStyle, WEAVER_DESCRIPTOR, WEAVER_NAME } from '@/brand';
import { readBranding, type Branding } from '@/lib/branding';
import { env } from '@/lib/env';
import { logError } from '@/lib/errors';
import { useApp } from '@/providers/app';
import { useCategory } from '@/providers/category';
import { useSettings } from '@/providers/settings';
import { colors, fonts, tracking } from '@/theme';

import { MotifGlyph } from './motif';
import { Txt } from './ui';

// The brand kit's mark (assets/brand/weaver-mark-512.png is its transparent 512px PNG, unchanged).
const weaverMark = require('../../assets/brand/weaver-mark-512.png');

/**
 * Weaver's own lockup, for the screens that introduce the product before a community is chosen (Find your community, the
 * setup screen). Brand kit, Logo, "default" setting: the mark 44px tall, 6px from the name, the name in the display face at
 * the wordmark size in indigo, the descriptor under it in muted. The kit's colours are used as they are, not the theme's, so a
 * community's brand colours never recolour it; inside a community's own screens the community's mark leads (CenterMark).
 */
export function WeaverLockup() {
  const { scale } = useSettings();
  const wordmark = brandTypeStyle('wordmark');
  const descriptor = brandTypeStyle('descriptor');
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }} accessible accessibilityLabel={`${WEAVER_NAME}. ${WEAVER_DESCRIPTOR}`}>
      <Image source={weaverMark} style={{ width: 44, height: 44 }} contentFit="contain" accessibilityElementsHidden accessibilityIgnoresInvertColors />
      <View style={{ flexShrink: 1, gap: 4 }}>
        <Txt
          style={{
            fontFamily: fonts.display,
            fontSize: wordmark.fontSize * scale,
            lineHeight: wordmark.fontSize * scale,
            letterSpacing: wordmark.letterSpacingEm * wordmark.fontSize,
            color: brandColor('navy'),
          }}>
          {WEAVER_NAME}
        </Txt>
        <Txt style={{ fontFamily: fonts.bodySemi, fontSize: descriptor.fontSize * scale, lineHeight: 13 * scale, color: brandColor('muted') }}>{WEAVER_DESCRIPTOR}</Txt>
      </View>
    </View>
  );
}

export function useBranding(): Branding {
  const { center } = useApp();
  return readBranding(center, env.communityDashboardUrl, env.supabaseUrl);
}

/**
 * The community's mark at a fixed height and its natural width (never cropped,
 * prototype §1.5). `kind="logo"` prefers the full lockup (welcome screen).
 * Falls back to an initials mark when the center has no logo or it fails to load.
 */
export function CenterMark({ size = 46, kind = 'mark', maxWidth }: { size?: number; kind?: 'mark' | 'logo'; maxWidth?: number }) {
  const { center } = useApp();
  const brand = useBranding();
  const url = kind === 'logo' ? (brand.logoUrl ?? brand.markUrl) : brand.markUrl;
  const [loaded, setLoaded] = useState<{ url: string; ratio: number } | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  if (url && failed !== url) {
    const ratio = loaded?.url === url ? loaded.ratio : 1;
    const width = Math.min(size * ratio, maxWidth ?? Infinity);
    return (
      <Image
        source={{ uri: url }}
        style={{ width, height: width / ratio }}
        contentFit="contain"
        accessibilityLabel={center?.name ? `${center.name} logo` : undefined}
        accessibilityIgnoresInvertColors
        onLoad={(e) => {
          const { width: w, height: h } = e.source;
          if (w > 0 && h > 0) setLoaded({ url, ratio: w / h });
        }}
        onError={(e) => {
          logError(`loading the community logo ${url} (showing initials instead)`, e.error);
          setFailed(url);
        }}
      />
    );
  }
  const initials = (center?.short_name || center?.name || 'C').slice(0, 3).toUpperCase();
  return (
    <View
      style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.navy, alignItems: 'center', justifyContent: 'center' }}
      accessibilityElementsHidden
      importantForAccessibility="no">
      <Txt variant="badge" color="white" style={{ fontSize: Math.round(size * 0.28), lineHeight: Math.round(size * 0.36) }}>
        {initials}
      </Txt>
    </View>
  );
}

/**
 * Home header centre (prototype Main L29): mark 46px + two-line wordmark,
 * the display face 17/700 ink over the text face 11/600 muted, letter-spaced.
 */
export function Wordmark() {
  const { center } = useApp();
  const { wordmark } = useBranding();
  // A small ornament beside the name when the member-app template names a motif this build can draw (src/lib/template.ts); none otherwise.
  const motif = useCategory().template.theme.motif;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, flexShrink: 1 }} accessible accessibilityRole="header" accessibilityLabel={center?.name ?? ''}>
      <CenterMark size={46} maxWidth={72} />
      <View style={{ flexShrink: 1 }}>
        <Txt numberOfLines={1} style={{ fontFamily: fonts.displayBold, fontSize: 17, lineHeight: 19, letterSpacing: tracking.wordmark, color: colors.ink }}>
          {wordmark[0]}
        </Txt>
        {wordmark[1] ? (
          <Txt numberOfLines={1} style={{ fontFamily: fonts.bodySemi, fontSize: 11, lineHeight: 12, letterSpacing: tracking.wordmarkSub, color: colors.muted }}>
            {wordmark[1]}
          </Txt>
        ) : null}
      </View>
      {motif ? <MotifGlyph name={motif} decorative /> : null}
    </View>
  );
}

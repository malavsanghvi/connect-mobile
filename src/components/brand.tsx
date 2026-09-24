import { Image } from 'expo-image';
import { useState } from 'react';
import { View } from 'react-native';

import { readBranding, type Branding } from '@/lib/branding';
import { env } from '@/lib/env';
import { logError } from '@/lib/errors';
import { useApp } from '@/providers/app';
import { colors, fonts, tracking } from '@/theme';

import { Txt } from './ui';

export function useBranding(): Branding {
  const { center } = useApp();
  return readBranding(center, env.communityDashboardUrl);
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
 * Fraunces 17/600 ink over DM Sans 11/600 muted, letter-spaced.
 */
export function Wordmark() {
  const { center } = useApp();
  const { wordmark } = useBranding();
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
    </View>
  );
}

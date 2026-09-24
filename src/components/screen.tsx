import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, RefreshControl, ScrollView, View, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useApp } from '@/providers/app';
import { useT } from '@/providers/settings';
import { colors, layout, space } from '@/theme';

import { useDrawer } from './drawer';
import { IconButton, Row, Txt } from './ui';

function brandingLogo(branding: unknown): string | null {
  if (!branding || typeof branding !== 'object' || Array.isArray(branding)) return null;
  const b = branding as Record<string, unknown>;
  const url = b.logo_url ?? b.logo;
  return typeof url === 'string' && /^https?:\/\//.test(url) ? url : null;
}

export function CenterMark({ size = 36 }: { size?: number }) {
  const { center } = useApp();
  const logo = brandingLogo(center?.branding);
  if (logo) return <Image source={{ uri: logo }} style={{ width: size, height: size, borderRadius: size / 2 }} contentFit="cover" accessibilityIgnoresInvertColors />;
  const initials = (center?.short_name || center?.name || 'C').slice(0, 3).toUpperCase();
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.navy, alignItems: 'center', justifyContent: 'center' }}>
      <Txt variant="badge" color="white">
        {initials}
      </Txt>
    </View>
  );
}

function Wordmark() {
  const { center } = useApp();
  return (
    <Row gap={space.sm} style={{ flexShrink: 1 }}>
      <CenterMark />
      <Txt variant="caption" color="navy" numberOfLines={2} style={{ letterSpacing: 1, textTransform: 'uppercase', flexShrink: 1 }} accessibilityRole="header">
        {center?.name ?? ''}
      </Txt>
    </Row>
  );
}

export function AppHeader({ title, root, showWordmark, right }: { title?: string; root?: boolean; showWordmark?: boolean; right?: ReactNode }) {
  const router = useRouter();
  const t = useT();
  const drawer = useDrawer();
  const { member } = useApp();
  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };
  return (
    <Row style={{ paddingHorizontal: space.md, paddingTop: space.sm, paddingBottom: space.sm, justifyContent: 'space-between', backgroundColor: colors.ground }}>
      {root ? <IconButton icon="menu" label={t('nav.openMenu')} onPress={drawer.open} /> : <IconButton icon="chevron-back" label={t('common.back')} onPress={goBack} />}
      <View style={{ flex: 1, alignItems: showWordmark ? 'flex-start' : 'center', paddingHorizontal: space.xs }}>
        {showWordmark ? (
          <Wordmark />
        ) : (
          <Txt variant="title" color="navy" numberOfLines={1} accessibilityRole="header">
            {title ?? ''}
          </Txt>
        )}
      </View>
      {right !== undefined ? (
        right
      ) : member ? (
        <IconButton icon="qr-code-outline" label={t('nav.memberCard')} onPress={() => router.push('/member-card')} />
      ) : (
        <View style={{ width: 44 }} />
      )}
    </Row>
  );
}

export type ScreenProps = {
  title?: string;
  root?: boolean;
  showWordmark?: boolean;
  children: ReactNode;
  /** Sticky area under the content (primary CTA). */
  footer?: ReactNode;
  onRefresh?: () => Promise<void>;
  headerRight?: ReactNode;
  scroll?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
  hideHeader?: boolean;
};

/** Every screen: safe area, header (menu/back · title · member card), scroll, pull-to-refresh. */
export function Screen({ title, root, showWordmark, children, footer, onRefresh, headerRight, scroll = true, contentStyle, hideHeader }: ScreenProps) {
  const [refreshing, setRefreshing] = useState(false);
  const refresh = onRefresh
    ? async () => {
        setRefreshing(true);
        try {
          await onRefresh();
        } finally {
          setRefreshing(false);
        }
      }
    : undefined;

  const inner = (
    <View style={[{ width: '100%', maxWidth: layout.maxContentWidth, alignSelf: 'center', paddingHorizontal: space.gutter, paddingTop: space.xxs, paddingBottom: space.xl, gap: space.lg }, contentStyle]}>{children}</View>
  );

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1, backgroundColor: colors.ground }}>
      {hideHeader ? null : <AppHeader title={title} root={root} showWordmark={showWordmark} right={headerRight} />}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {scroll ? (
          <ScrollView
            style={{ flex: 1 }}
            keyboardShouldPersistTaps="handled"
            refreshControl={refresh ? <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.navy} /> : undefined}>
            {inner}
          </ScrollView>
        ) : (
          <View style={{ flex: 1 }}>{inner}</View>
        )}
        {footer ? (
          <View style={{ paddingHorizontal: space.gutter, paddingTop: space.md, paddingBottom: space.md, backgroundColor: colors.ground, borderTopWidth: 1, borderTopColor: colors.divider, gap: space.sm }}>
            <View style={{ width: '100%', maxWidth: layout.maxContentWidth, alignSelf: 'center', gap: space.sm }}>{footer}</View>
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/** Coloured hero band used on event, boli and opportunity screens. */
export function Band({ color, eyebrow, title, subtitle, children }: { color: string; eyebrow?: string; title: string; subtitle?: string; children?: ReactNode }) {
  return (
    <View style={{ backgroundColor: color, borderRadius: 20, padding: space.gutter, gap: space.xs }}>
      {eyebrow ? (
        <Txt variant="eyebrow" color="white" style={{ opacity: 0.85 }}>
          {eyebrow}
        </Txt>
      ) : null}
      <Txt variant="title" color="white" accessibilityRole="header">
        {title}
      </Txt>
      {subtitle ? (
        <Txt variant="small" color="white" style={{ opacity: 0.9 }}>
          {subtitle}
        </Txt>
      ) : null}
      {children}
    </View>
  );
}

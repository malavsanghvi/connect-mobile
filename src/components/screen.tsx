import { useRouter } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, RefreshControl, ScrollView, View, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useApp } from '@/providers/app';
import { useModule } from '@/providers/modules';
import { useT } from '@/providers/settings';
import { colors, components, layout, space } from '@/theme';

import { CenterMark, Wordmark } from './brand';
import { useDrawer } from './drawer';
import { NivaFab } from './niva-fab';
import { SubScreenTabBar } from './tab-bar';
import { IconButton, Row, Txt } from './ui';

export { CenterMark };

/**
 * Prototype header (Main.dc.html L21–40): padding 16/20/12, gap 12.
 * Left: 44px white round menu (tab roots) or back button with a 1px #E3D9C8
 * border. Middle: the community mark + two-line wordmark, centred (Home), or
 * the screen title left-aligned right after the button (Fraunces 22 navy).
 * Right: the member card as a filled navy circle with a white QR glyph.
 */
export function AppHeader({ title, root, showWordmark, right }: { title?: string; root?: boolean; showWordmark?: boolean; right?: ReactNode }) {
  const router = useRouter();
  const t = useT();
  const drawer = useDrawer();
  const { member } = useApp();
  const spec = components.header;
  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };
  const cardButton = member ? <IconButton glyph="qr" variant="filled" label={t('nav.memberCard')} onPress={() => router.push('/member-card')} /> : <View style={{ width: spec.iconButton }} />;
  return (
    <Row gap={spec.gap} style={{ paddingTop: spec.padTop, paddingHorizontal: spec.padX, paddingBottom: spec.padBottom, minHeight: spec.iconButton, backgroundColor: colors.ground }}>
      {root ? <IconButton glyph="menu" variant="outline" label={t('nav.openMenu')} onPress={drawer.open} /> : <IconButton glyph="back" variant="outline" label={t('common.back')} onPress={goBack} />}
      <View style={{ flex: 1, alignItems: showWordmark ? 'center' : 'flex-start' }}>
        {showWordmark ? (
          <Wordmark />
        ) : (
          <Txt variant="title" color="navy" numberOfLines={1} accessibilityRole="header">
            {title ?? ''}
          </Txt>
        )}
      </View>
      {right !== undefined ? right : cardButton}
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
  /** Stays pinned under the header while the content scrolls (e.g. My Jain Way sub-tabs). */
  sticky?: ReactNode;
  onRefresh?: () => Promise<void>;
  headerRight?: ReactNode;
  scroll?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
  hideHeader?: boolean;
  /**
   * Show the bottom tab bar on a pushed screen (default true). Tab roots get
   * the navigator's bar instead. Off for screens that are separate full-screen
   * flows in the prototype (guide, Gyan Path, volunteer board, scanner).
   */
  tabBar?: boolean;
  /**
   * Show the Niva floating button (default: wherever the tab bar shows).
   * The prototype hides it on Settings, Legal, Niva, Store, Cart and the
   * member card (Main.dc.html L2208).
   */
  niva?: boolean;
};

/** Every screen: safe area, header (menu/back · title · member card), scroll, pull-to-refresh, tab bar, Niva. */
export function Screen({ title, root, showWordmark, children, footer, sticky, onRefresh, headerRight, scroll = true, contentStyle, hideHeader, tabBar = true, niva }: ScreenProps) {
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

  const nivaOn = useModule('niva');
  const ownTabBar = !root && tabBar;
  const showNiva = nivaOn && (niva ?? (root || tabBar));

  const inner = (
    <View
      style={[
        { width: '100%', maxWidth: layout.maxContentWidth, alignSelf: 'center', paddingHorizontal: space.gutter, paddingTop: space.xxs, paddingBottom: showNiva ? space.xl + components.fab.h : space.xl, gap: space.lg },
        contentStyle,
      ]}>
      {children}
    </View>
  );

  return (
    <SafeAreaView edges={root || ownTabBar ? ['top', 'left', 'right'] : ['top', 'left', 'right', 'bottom']} style={{ flex: 1, backgroundColor: colors.ground }}>
      {hideHeader ? null : <AppHeader title={title} root={root} showWordmark={showWordmark} right={headerRight} />}
      {sticky ? (
        <View style={{ paddingHorizontal: space.gutter, paddingBottom: space.md, backgroundColor: colors.ground, zIndex: 3 }}>
          <View style={{ width: '100%', maxWidth: layout.maxContentWidth, alignSelf: 'center' }}>{sticky}</View>
        </View>
      ) : null}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={{ flex: 1 }}>
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
          {showNiva ? <NivaFab /> : null}
        </View>
        {footer ? (
          <View style={{ paddingHorizontal: space.gutter, paddingTop: space.md, paddingBottom: space.md, backgroundColor: colors.ground, borderTopWidth: 1, borderTopColor: colors.divider, gap: space.sm }}>
            <View style={{ width: '100%', maxWidth: layout.maxContentWidth, alignSelf: 'center', gap: space.sm }}>{footer}</View>
          </View>
        ) : null}
      </KeyboardAvoidingView>
      {ownTabBar ? <SubScreenTabBar /> : null}
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

import { useRouter } from 'expo-router';
import type { ReactElement, ReactNode } from 'react';
import { View } from 'react-native';

import type { StringKey } from '@/i18n/en';
import { blockingModule, type ModuleKey } from '@/lib/modules';
import { useApp } from '@/providers/app';
import { useModules } from '@/providers/modules';
import { useT } from '@/providers/settings';
import { colors, space } from '@/theme';

import { Screen } from './screen';
import { StrokeIcon } from './stroke-icon';
import { Button, Txt, VStack } from './ui';

/** Member-facing name of a module (translatable; falls back to the database label). */
export function useModuleLabel(key: ModuleKey): string {
  const t = useT();
  const { labels } = useModules();
  const k = `modules.label.${key}` as StringKey;
  const translated = t(k);
  return translated === k ? (labels[key] ?? key) : translated;
}

/**
 * "{label} isn't offered by {center} right now", with a Back button. Shown
 * instead of a screen whose module the community has switched off (deep
 * links, notification taps, old bookmarks).
 */
export function ModuleOffScreen({ module, root }: { module: ModuleKey; root?: boolean }) {
  const t = useT();
  const router = useRouter();
  const { center } = useApp();
  const label = useModuleLabel(module);
  const community = center?.short_name || center?.name || '';
  const back = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };
  return (
    <Screen title={label} root={root}>
      <VStack gap={space.lg} style={{ alignItems: 'center', paddingTop: 60, paddingBottom: space.xl }}>
        <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: colors.panel, alignItems: 'center', justifyContent: 'center' }}>
          <StrokeIcon name="info" size={34} color={colors.navy} />
        </View>
        <Txt variant="display" center accessibilityRole="header">
          {t('modules.offTitle', { label, center: community })}
        </Txt>
        <Txt variant="body" color="ink2" center>
          {t('modules.offBody')}
        </Txt>
        <Button label={t('modules.back')} tone="secondary" size="md" fill={false} style={{ alignSelf: 'center', paddingHorizontal: 28 }} onPress={back} />
      </VStack>
    </Screen>
  );
}

/** Renders the route, or the "not offered" screen when its module is switched off. */
function ModuleRouteGate({ routeName, root, children }: { routeName: string; root?: boolean; children: ReactNode }) {
  const { map } = useModules();
  const blocked = blockingModule(map, routeName);
  if (blocked) return <ModuleOffScreen module={blocked} root={root} />;
  return <>{children}</>;
}

/** `screenLayout` for the `(app)` stack: every pushed screen passes the module gate. */
export function moduleStackLayout({ route, children }: { route: { name: string }; children: ReactElement }): ReactElement {
  return <ModuleRouteGate routeName={route.name}>{children}</ModuleRouteGate>;
}

/** `screenLayout` for the tabs: a tab whose modules are all off can't be opened by a link either. */
export function moduleTabLayout({ route, children }: { route: { name: string }; children: ReactElement }): ReactElement {
  return (
    <ModuleRouteGate routeName={route.name} root>
      {children}
    </ModuleRouteGate>
  );
}

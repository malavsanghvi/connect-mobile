import { useRouter } from 'expo-router';
import type { ReactElement, ReactNode } from 'react';
import { View } from 'react-native';

import type { StringKey } from '@/i18n/en';
import { AREA_LABEL, FEATURE_MODULE, type FeatureKey } from '@/lib/access';
import { blockingModule, routeFeature, type ModuleKey } from '@/lib/modules';
import { useFeature } from '@/providers/access';
import { useApp } from '@/providers/app';
import { useModules } from '@/providers/modules';
import { useT } from '@/providers/settings';
import { colors, space } from '@/theme';

import { FeatureNotice } from './feature-notice';
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

/**
 * Renders a screen that belongs to an access area (Live darshan, Virtual puja, Listen, Look, Learn, Ask Niva,
 * the guide) only while the person may use the area: a visitor is asked to sign in, a member below the
 * organization's minimum level is told which level it takes, and while the answer is loading or could not be
 * had the screen says so (with Try again). The guide stays open until the answer says otherwise.
 */
function FeatureRouteGate({ feature, root, children }: { feature: FeatureKey; root?: boolean; children: ReactNode }) {
  const t = useT();
  const access = useFeature(feature);
  if (access.allowed) return <>{children}</>;
  const offModule = access.reason === 'module_off' ? FEATURE_MODULE[feature] : null;
  if (offModule) return <ModuleOffScreen module={offModule} root={root} />;
  return (
    <Screen title={t(AREA_LABEL[feature])} root={root}>
      <FeatureNotice feature={feature} />
    </Screen>
  );
}

/**
 * Renders the route, or the "not offered" screen when its module is switched off, or the notice for the
 * access area it belongs to when the person may not use it (`params` are the route's parameters: the 3L
 * library screens need `kind` to know whether they are Listen or Look).
 */
function ModuleRouteGate({ routeName, params, root, children }: { routeName: string; params?: object | null; root?: boolean; children: ReactNode }) {
  const { map } = useModules();
  const blocked = blockingModule(map, routeName);
  if (blocked) return <ModuleOffScreen module={blocked} root={root} />;
  const feature = routeFeature(routeName, params);
  if (!feature) return <>{children}</>;
  return (
    <FeatureRouteGate feature={feature} root={root}>
      {children}
    </FeatureRouteGate>
  );
}

/** `screenLayout` for the `(app)` stack: every pushed screen passes the module gate, then the access gate. */
export function moduleStackLayout({ route, children }: { route: { name: string; params?: object }; children: ReactElement }): ReactElement {
  return (
    <ModuleRouteGate routeName={route.name} params={route.params}>
      {children}
    </ModuleRouteGate>
  );
}

/** `screenLayout` for the tabs: a tab whose modules are all off can't be opened by a link either. */
export function moduleTabLayout({ route, children }: { route: { name: string }; children: ReactElement }): ReactElement {
  return (
    <ModuleRouteGate routeName={route.name} root>
      {children}
    </ModuleRouteGate>
  );
}

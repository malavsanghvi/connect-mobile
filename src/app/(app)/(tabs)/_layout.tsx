import { Tabs } from 'expo-router/js-tabs';

import { NavTabBar } from '@/components/tab-bar';
import { useT } from '@/providers/settings';
import { colors } from '@/theme';

/**
 * Bottom nav (prototype Main L1321): Home · Events · Give · Jain Way · Family.
 * The bar itself is `NavTabBar`, shared with pushed screens (SubScreenTabBar)
 * so it looks identical everywhere.
 */
export default function TabsLayout() {
  const t = useT();
  return (
    <Tabs tabBar={(props) => <NavTabBar {...props} />} screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.ground } }}>
      <Tabs.Screen name="index" options={{ title: t('tab.home') }} />
      <Tabs.Screen name="events" options={{ title: t('tab.events') }} />
      <Tabs.Screen name="give" options={{ title: t('tab.give') }} />
      <Tabs.Screen name="jain-way" options={{ title: t('tab.jainWay') }} />
      <Tabs.Screen name="family" options={{ title: t('tab.family') }} />
    </Tabs>
  );
}

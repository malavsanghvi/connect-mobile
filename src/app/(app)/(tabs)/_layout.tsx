import { Tabs } from 'expo-router/js-tabs';
import type { ColorValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, type IconName } from '@/components/icon';
import { useSettings } from '@/providers/settings';
import { colors, fonts, layout } from '@/theme';

function tabIcon(active: IconName, inactive: IconName) {
  function TabIcon({ color, focused }: { color: ColorValue; focused: boolean }) {
    return <Icon name={focused ? active : inactive} size={24} color={color} />;
  }
  return TabIcon;
}

const homeIcon = tabIcon('home', 'home-outline');
const eventsIcon = tabIcon('calendar', 'calendar-outline');
const giveIcon = tabIcon('heart', 'heart-outline');
const jainWayIcon = tabIcon('flower', 'flower-outline');
const familyIcon = tabIcon('people', 'people-outline');

/** Bottom nav (prototype §1.3): Home · Events · Give · Jain Way · Family. */
export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const { t, scale } = useSettings();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.navy,
        tabBarInactiveTintColor: colors.faint,
        tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.border, height: layout.tabBarHeight + insets.bottom, paddingTop: 8, paddingBottom: Math.max(insets.bottom, 12) },
        tabBarLabelStyle: { fontFamily: fonts.bodySemi, fontSize: 11 * Math.min(scale, 1.15), lineHeight: 15 * Math.min(scale, 1.15), marginTop: 2 },
        sceneStyle: { backgroundColor: colors.ground },
      }}>
      <Tabs.Screen name="index" options={{ title: t('tab.home'), tabBarIcon: homeIcon }} />
      <Tabs.Screen name="events" options={{ title: t('tab.events'), tabBarIcon: eventsIcon }} />
      <Tabs.Screen name="give" options={{ title: t('tab.give'), tabBarIcon: giveIcon }} />
      <Tabs.Screen name="jain-way" options={{ title: t('tab.jainWay'), tabBarIcon: jainWayIcon }} />
      <Tabs.Screen name="family" options={{ title: t('tab.family'), tabBarIcon: familyIcon }} />
    </Tabs>
  );
}

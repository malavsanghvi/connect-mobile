import { useRootNavigationState, useRouter, type Href } from 'expo-router';
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { StringKey } from '@/i18n/en';
import { useSettings } from '@/providers/settings';
import { colors, components, fonts } from '@/theme';

import { StrokeIcon, type StrokeIconName } from './stroke-icon';

/** Route names of the five tabs in `(app)/(tabs)`, in prototype order. */
export const TABS = ['index', 'events', 'give', 'jain-way', 'family'] as const;
export type TabName = (typeof TABS)[number];

const TAB_META: Record<TabName, { icon: StrokeIconName; label: StringKey; href: Href }> = {
  index: { icon: 'home', label: 'tab.home', href: '/' },
  events: { icon: 'calendar', label: 'tab.events', href: '/events' },
  give: { icon: 'heart', label: 'tab.give', href: '/give' },
  'jain-way': { icon: 'book', label: 'tab.jainWay', href: '/jain-way' },
  family: { icon: 'people', label: 'tab.family', href: '/family' },
};

function isTab(name: string | undefined): name is TabName {
  return !!name && (TABS as readonly string[]).includes(name);
}

/**
 * The prototype tab bar (Main.dc.html L1321): 76px, white, 1px #E8E0D2 top
 * border, five columns, 22px outline icons (stroke 1.8, same icon in both
 * states), labels 12/600, navy active / faint idle.
 */
export function TabBarView({ active, onSelect }: { active: TabName | null; onSelect: (tab: TabName) => void }) {
  const insets = useSafeAreaInsets();
  const { t, scale } = useSettings();
  const labelScale = Math.min(scale, 1.15);
  const spec = components.tabBar;
  return (
    <View
      accessibilityRole="tablist"
      style={{
        flexDirection: 'row',
        backgroundColor: colors.card,
        borderTopWidth: 1,
        borderTopColor: colors.border,
        height: spec.height + insets.bottom,
        paddingBottom: spec.padBottom + insets.bottom,
        paddingLeft: insets.left,
        paddingRight: insets.right,
      }}>
      {TABS.map((tab) => {
        const meta = TAB_META[tab];
        const focused = tab === active;
        const tint = focused ? colors.navy : colors.faint;
        const label = t(meta.label);
        return (
          <Pressable
            key={tab}
            onPress={() => onSelect(tab)}
            accessibilityRole="tab"
            accessibilityLabel={label}
            accessibilityState={{ selected: focused }}
            style={({ pressed }) => ({ flex: 1, alignItems: 'center', justifyContent: 'center', gap: spec.gap, opacity: pressed ? 0.7 : 1 })}>
            <StrokeIcon name={meta.icon} size={spec.iconSize} color={tint} strokeWidth={spec.iconStroke} />
            <Text numberOfLines={1} style={{ fontFamily: fonts.bodySemi, fontSize: spec.labelSize * labelScale, lineHeight: 16 * labelScale, color: tint }}>
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Tab bar for the `(tabs)` navigator (standard tabPress semantics). */
export function NavTabBar({ state, navigation }: BottomTabBarProps) {
  const focusedName = state.routes[state.index]?.name;
  return (
    <TabBarView
      active={isTab(focusedName) ? focusedName : null}
      onSelect={(tab) => {
        const route = state.routes.find((r) => r.name === tab);
        if (!route) return;
        const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
        if (route.name !== focusedName && !event.defaultPrevented) navigation.navigate(route.name, route.params);
      }}
    />
  );
}

type NavStateLike = { index?: number; routes?: { name: string; state?: NavStateLike }[] };

/** Tab that is focused inside `(tabs)`, found anywhere in the navigation tree. */
function focusedTab(state: NavStateLike | undefined): TabName | null {
  if (!state?.routes) return null;
  for (const route of state.routes) {
    if (route.name === '(tabs)') {
      const inner = route.state;
      const name = inner?.routes?.[inner.index ?? 0]?.name;
      return isTab(name) ? name : 'index';
    }
    const found = focusedTab(route.state);
    if (found) return found;
  }
  return null;
}

/**
 * The same bar on screens pushed above the tabs (member card, profile,
 * settings, give and event screens…), so it stays visible as in the
 * prototype. The highlighted tab is the one the member came from; tapping a
 * tab closes the pushed screens and switches to it.
 */
export function SubScreenTabBar() {
  const router = useRouter();
  const rootState = useRootNavigationState() as NavStateLike | undefined;
  const active = focusedTab(rootState);
  return <TabBarView active={active} onSelect={(tab) => router.dismissTo(TAB_META[tab].href)} />;
}

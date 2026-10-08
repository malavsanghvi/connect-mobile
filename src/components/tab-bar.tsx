import { usePathname, useRootNavigationState, useRouter, type Href } from 'expo-router';
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { StringKey } from '@/i18n/en';
import { communityName } from '@/lib/learning';
import { barItems, TABS, type BarItem, type TabName } from '@/lib/nav-bar';
import { clearedPaneParams, hasPaneParams } from '@/lib/tab-params';
import { useFeature } from '@/providers/access';
import { useApp } from '@/providers/app';
import { useCategory } from '@/providers/category';
import { useModules } from '@/providers/modules';
import { useSettings } from '@/providers/settings';
import { colors, components, fonts } from '@/theme';

import { MiniPlayer } from './mini-player';
import { StrokeIcon, type StrokeIconName } from './stroke-icon';

const BAR_META: Record<BarItem, { icon: StrokeIconName; label: StringKey; href: Href }> = {
  index: { icon: 'home', label: 'tab.home', href: '/' },
  events: { icon: 'calendar', label: 'tab.events', href: '/events' },
  give: { icon: 'heart', label: 'tab.give', href: '/give' },
  'jain-way': { icon: 'book', label: 'tab.jainWay', href: '/jain-way' },
  family: { icon: 'people', label: 'tab.family', href: '/family' },
  niva: { icon: 'sparkle', label: 'niva.fab', href: '/niva' },
};

function isTab(name: string | undefined): name is TabName {
  return !!name && (TABS as readonly string[]).includes(name);
}

/**
 * The prototype tab bar (Main.dc.html L1321): 76px, white, 1px #E8E0D2 top
 * border, equal columns (the five tabs, then Niva), 22px outline icons (stroke
 * 1.8, same icon in both states), labels 12/600, navy active / faint idle.
 * Tabs whose modules the community switched off are left out (Give and Jain
 * Way disappear when none of their sections is on), and Niva is there for
 * someone who may use Ask Niva (it replaces the floating Niva button). The
 * 3L mini player sits on top of it while something is playing.
 */
export function TabBarView({ active, onSelect }: { active: BarItem | null; onSelect: (item: BarItem) => void }) {
  const insets = useSafeAreaInsets();
  const { map } = useModules();
  const { center } = useApp();
  const { layout } = useCategory();
  const nivaAllowed = useFeature('niva').allowed;
  const items = barItems(map, nivaAllowed, layout.practiceTab);
  const { t, scale } = useSettings();
  const labelScale = Math.min(scale, 1.15);
  const spec = components.tabBar;
  return (
    <View>
      <MiniPlayer />
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
        {items.map((item) => {
          const meta = BAR_META[item];
          const focused = item === active;
          const tint = focused ? colors.navy : colors.faint;
          const label = t(meta.label);
          // Niva's spoken name says whose it is ("Ask JSH Niva"); its printed label stays short like the others.
          const spoken = item === 'niva' ? t('niva.fabLabel', { center: communityName(center) }).replace(/\s+/g, ' ') : label;
          return (
            <Pressable
              key={item}
              onPress={() => onSelect(item)}
              accessibilityRole="tab"
              accessibilityLabel={spoken}
              accessibilityState={{ selected: focused }}
              style={({ pressed }) => ({ flex: 1, alignItems: 'center', justifyContent: 'center', gap: spec.gap, paddingHorizontal: 2, opacity: pressed ? 0.7 : 1 })}>
              <StrokeIcon name={meta.icon} size={spec.iconSize} color={tint} strokeWidth={spec.iconStroke} />
              {/* Six columns: "Jain Way" at the larger text sizes shrinks a little on a narrow phone rather than being cut off. */}
              <Text
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.85}
                style={{ fontFamily: fonts.bodySemi, fontSize: spec.labelSize * labelScale, lineHeight: 16 * labelScale, color: tint }}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** Tab bar for the `(tabs)` navigator (standard tabPress semantics). Niva is not one of its tabs: it opens the chat above them. */
export function NavTabBar({ state, navigation }: BottomTabBarProps) {
  const router = useRouter();
  const focusedName = state.routes[state.index]?.name;
  return (
    <TabBarView
      active={isTab(focusedName) ? focusedName : null}
      onSelect={(tab) => {
        if (tab === 'niva') return router.push(BAR_META.niva.href);
        const route = state.routes.find((r) => r.name === tab);
        if (!route) return;
        const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
        if (event.defaultPrevented) return;
        // A tap starts the tab at its default pane (Events opens on Upcoming, not on the Photos it was last left on); tapping the
        // tab you are already on brings it back from a pane such as Photos.
        if (route.name !== focusedName || hasPaneParams(route.params)) navigation.navigate(route.name, clearedPaneParams());
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
 * prototype. The highlighted tab is the one the member came from (Niva while
 * the chat is open); tapping a tab closes the pushed screens and switches to
 * it, and tapping Niva opens the chat (nothing happens when it is open).
 */
export function SubScreenTabBar() {
  const router = useRouter();
  const pathname = usePathname();
  const rootState = useRootNavigationState() as NavStateLike | undefined;
  const nivaOpen = pathname === BAR_META.niva.href;
  const active: BarItem | null = nivaOpen ? 'niva' : focusedTab(rootState);
  return (
    <TabBarView
      active={active}
      onSelect={(item) => {
        if (item !== 'niva') return router.dismissTo(BAR_META[item].href);
        if (!nivaOpen) router.push(BAR_META.niva.href);
      }}
    />
  );
}

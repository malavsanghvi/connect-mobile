import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Platform, Pressable, View, useWindowDimensions, type LayoutChangeEvent } from 'react-native';

import { Icon, type IconName } from '@/components/icon';
import { Banner, Txt } from '@/components/ui';
import { loadGyan, nextGyanLevel } from '@/lib/api/gyan';
import { report } from '@/lib/errors';
import { homeShortcuts, shortcutColumns, type HomeShortcut } from '@/lib/home-shortcuts';
import { useApp } from '@/providers/app';
import { useModules } from '@/providers/modules';
import { useSettings } from '@/providers/settings';
import { colors, layout, space, touch } from '@/theme';

type Look = { icon: IconName; bg: string; fg: string; label: 'home.shortcut.learn' | 'home.shortcut.playlist' | 'home.shortcut.photos' | 'home.shortcut.recipe' | 'home.shortcut.podcast' | 'home.shortcut.guide'; a11y: 'home.shortcut.learnA11y' | 'home.shortcut.playlistA11y' | 'home.shortcut.photosA11y' | 'home.shortcut.recipeA11y' | 'home.shortcut.podcastA11y' | 'home.shortcut.guideA11y' };

// Read at render time, so the community's brand colours (theme.ts applyPalette) apply.
const looks = (): Record<HomeShortcut, Look> => ({
  learn: { icon: 'school-outline', bg: colors.navyTint, fg: colors.navy, label: 'home.shortcut.learn', a11y: 'home.shortcut.learnA11y' },
  playlist: { icon: 'musical-notes-outline', bg: colors.purpleTint, fg: colors.purple, label: 'home.shortcut.playlist', a11y: 'home.shortcut.playlistA11y' },
  photos: { icon: 'images-outline', bg: colors.brownTint, fg: colors.brown, label: 'home.shortcut.photos', a11y: 'home.shortcut.photosA11y' },
  recipe: { icon: 'restaurant-outline', bg: colors.greenTint, fg: colors.green, label: 'home.shortcut.recipe', a11y: 'home.shortcut.recipeA11y' },
  podcast: { icon: 'mic-outline', bg: colors.storeTint, fg: colors.store, label: 'home.shortcut.podcast', a11y: 'home.shortcut.podcastA11y' },
  guide: { icon: 'compass-outline', bg: colors.panel, fg: colors.saffron, label: 'home.shortcut.guide', a11y: 'home.shortcut.guideA11y' },
});

const CIRCLE = 56;

/** The grid's width before it has been measured: the screen inside the gutters (the web shows the app in a phone frame). */
function estimatedWidth(windowWidth: number): number {
  const frame = Platform.OS === 'web' ? Math.min(windowWidth, layout.webAppWidth) : windowWidth;
  return Math.max(0, Math.min(frame, layout.maxContentWidth) - space.gutter * 2);
}

/**
 * Home shortcuts, under "Today at {center}": round buttons with a short label
 * in a fixed grid that never scrolls sideways, exactly as wide as the cards
 * (it sits in the same gutters). Three a row on phones and the web, more on
 * wider screens (shortcutColumns); extra shortcuts wrap onto the next row.
 * Which ones and in what order is the community's choice
 * (centers.rules.home.shortcuts, see src/lib/home-shortcuts.ts); one whose
 * module is off is hidden.
 */
export function HomeShortcuts() {
  const { t, scale } = useSettings();
  const router = useRouter();
  const { center, member } = useApp();
  const { map } = useModules();
  const { width: windowWidth } = useWindowDimensions();
  const [measured, setMeasured] = useState(0);
  const [busy, setBusy] = useState<HomeShortcut | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const keys = homeShortcuts(center?.rules, map);
  if (!center || !member || keys.length === 0) return null;
  const look = looks();
  const columns = shortcutColumns(measured || estimatedWidth(windowWidth), scale, keys.length);
  const cell = `${100 / columns}%` as const;

  const onLayout = (e: LayoutChangeEvent) => {
    const w = Math.round(e.nativeEvent.layout.width);
    if (w > 0 && w !== measured) setMeasured(w);
  };

  // Straight into the next Gyan Path level (the goals screen when every level is done).
  const openLearn = async () => {
    setBusy('learn');
    setFailure(null);
    try {
      const next = nextGyanLevel(await loadGyan(center, [member.person.id]), member.person.id);
      if (next) router.push({ pathname: '/gyan/[goalId]/level/[levelId]', params: { goalId: next.goal.id, levelId: next.level.id } });
      else router.push('/gyan');
    } catch (err) {
      setFailure(report(err, 'open your next Gyan Path level').userMessage);
    } finally {
      setBusy(null);
    }
  };

  const open = (key: HomeShortcut) => {
    setFailure(null);
    if (key === 'learn') void openLearn();
    else if (key === 'playlist') router.push({ pathname: '/listen/playlist', params: { autoplay: '1' } });
    else if (key === 'photos') router.push({ pathname: '/events', params: { view: 'photos' } });
    else if (key === 'recipe') router.push('/recipe/random');
    else if (key === 'guide') router.push('/guide');
    else router.push('/listen/podcast-random');
  };

  return (
    <View style={{ gap: space.sm }}>
      <View onLayout={onLayout} role="group" aria-label={t('home.shortcuts')} style={{ width: '100%', flexDirection: 'row', flexWrap: 'wrap', rowGap: space.md }}>
        {keys.map((key) => {
          const l = look[key];
          const isBusy = busy === key;
          return (
            <Pressable
              key={key}
              onPress={() => open(key)}
              disabled={busy !== null}
              accessibilityRole="button"
              accessibilityLabel={t(l.a11y)}
              accessibilityState={{ busy: isBusy, disabled: busy !== null }}
              style={({ pressed }) => ({ width: cell, minHeight: touch.min, alignItems: 'center', gap: 6, paddingVertical: 2, paddingHorizontal: 2, opacity: pressed ? 0.75 : busy !== null && !isBusy ? 0.6 : 1 })}>
              <View style={{ width: CIRCLE, height: CIRCLE, borderRadius: CIRCLE / 2, backgroundColor: l.bg, alignItems: 'center', justifyContent: 'center' }}>
                {isBusy ? <ActivityIndicator color={l.fg} /> : <Icon name={l.icon} size={24} color={l.fg} />}
              </View>
              <Txt variant="caption" color="ink2" center numberOfLines={2}>
                {t(l.label)}
              </Txt>
            </Pressable>
          );
        })}
      </View>
      {failure ? <Banner tone="error" message={failure} action={{ label: t('common.retry'), onPress: () => void openLearn() }} /> : null}
    </View>
  );
}

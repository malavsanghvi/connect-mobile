import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { isMediaKind } from '@/lib/media-library';
import { usePlayerOptional } from '@/providers/player';
import { useT } from '@/providers/settings';
import { colors, radii, space, touch } from '@/theme';

import { Icon } from './icon';
import { Txt } from './ui';

/**
 * The 3L mini player, drawn on top of the tab bar (tab roots and pushed
 * screens alike) while something is in the queue: title, play/pause, next,
 * close, and a thin progress line. Tapping the title opens the item.
 */
export function MiniPlayer() {
  const t = useT();
  const router = useRouter();
  const p = usePlayerOptional();
  const current = p?.current ?? null;
  if (!p || !current) return null;
  const kind = current.kind;
  const canOpen = isMediaKind(kind);
  const pct = p.duration > 0 ? Math.max(0, Math.min(1, p.position / p.duration)) : 0;
  const line = p.error ?? (p.loading ? t('player.loading') : p.ended ? t('player.ended') : (current.subtitle ?? (p.playing ? t('player.playing') : t('player.paused'))));
  const open = () => {
    if (isMediaKind(kind)) router.push({ pathname: '/media/[kind]/[id]', params: { kind, id: current.id } });
  };
  const round = { width: touch.min, height: touch.min, borderRadius: touch.min / 2, alignItems: 'center', justifyContent: 'center' } as const;

  return (
    <View style={{ backgroundColor: colors.navy }} accessibilityLabel={t('player.region')}>
      <View style={{ height: 3, backgroundColor: colors.navyPanel }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <View style={{ width: `${pct * 100}%`, height: 3, backgroundColor: colors.onNavyGreen }} />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs, paddingVertical: 6, paddingHorizontal: space.md }}>
        <Pressable
          onPress={p.toggle}
          disabled={p.loading}
          accessibilityRole="button"
          accessibilityLabel={p.error ? t('player.retryTitle', { title: current.title }) : p.playing ? t('player.pauseTitle', { title: current.title }) : t('player.playTitle', { title: current.title })}
          accessibilityState={{ busy: p.loading }}
          style={({ pressed }) => [round, { backgroundColor: colors.white, opacity: pressed ? 0.8 : 1 }]}>
          {p.loading ? <ActivityIndicator color={colors.navy} /> : <Icon name={p.error ? 'refresh' : p.playing ? 'pause' : 'play'} size={20} color={colors.navy} />}
        </Pressable>
        <Pressable
          onPress={open}
          disabled={!canOpen}
          accessibilityRole={canOpen ? 'button' : 'text'}
          accessibilityLabel={`${current.title}. ${line}`}
          accessibilityHint={canOpen ? t('player.openHint') : undefined}
          style={({ pressed }) => ({ flex: 1, minHeight: touch.min, justifyContent: 'center', paddingHorizontal: space.xs, opacity: pressed ? 0.8 : 1 })}>
          <Txt variant="smallStrong" color="white" numberOfLines={1}>
            {current.title}
          </Txt>
          <Txt variant="caption" color="onNavy" numberOfLines={p.error ? 2 : 1}>
            {line}
          </Txt>
        </Pressable>
        <Pressable
          onPress={p.next}
          disabled={!p.hasNext}
          accessibilityRole="button"
          accessibilityLabel={t('player.next')}
          accessibilityState={{ disabled: !p.hasNext }}
          style={({ pressed }) => [round, { opacity: !p.hasNext ? 0.35 : pressed ? 0.7 : 1 }]}>
          <Icon name="play-skip-forward" size={20} color={colors.white} />
        </Pressable>
        <Pressable onPress={p.close} accessibilityRole="button" accessibilityLabel={t('player.close')} style={({ pressed }) => [round, { borderRadius: radii.round, opacity: pressed ? 0.7 : 1 }]}>
          <Icon name="close" size={22} color={colors.white} />
        </Pressable>
      </View>
    </View>
  );
}

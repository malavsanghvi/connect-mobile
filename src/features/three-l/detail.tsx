import { Image } from 'expo-image';
import { Pressable, View } from 'react-native';

import { Icon } from '@/components/icon';
import { Markdownish } from '@/components/markdown';
import { Band } from '@/components/screen';
import { ErrorState } from '@/components/states';
import { Banner, Button, Card, Pill, ProgressBar, Row, Stat, Txt, VStack } from '@/components/ui';
import { PlayGlyph } from '@/features/gyan-ui';
import { mediaPictures, mediaUrl } from '@/lib/api/media';
import { clockLabel, playbackOf, watchSourceOf, type MediaItem } from '@/lib/media-library';
import { useLoad } from '@/lib/use-load';
import { useApp } from '@/providers/app';
import { usePlayer } from '@/providers/player';
import { useT } from '@/providers/settings';
import { colors, radii, space, touch } from '@/theme';

import { useMediaActions } from './actions';
import { FailureBanner, LikeButton, PlayToggle, PlaylistButton, durationText, kindName, mediaSubtitle, toQueueItem, useWatch } from './media-ui';
import { InlineVideo, VIDEO_INLINE, type InlineVideoSource } from './video';

/** Previous · play/pause · next for the track the 3L player has now, with its progress. */
export function NowPlaying() {
  const t = useT();
  const p = usePlayer();
  if (!p.current) return null;
  const pct = p.duration > 0 ? p.position / p.duration : 0;
  const button = (icon: 'play-skip-back' | 'play-skip-forward', label: string, onPress: () => void, disabled: boolean) => (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      style={({ pressed }) => ({ width: touch.min, height: touch.min, borderRadius: touch.min / 2, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.35 : pressed ? 0.7 : 1 })}>
      <Icon name={icon} size={22} color={colors.white} />
    </Pressable>
  );
  return (
    <Card tone="navy" style={{ gap: space.sm }}>
      <Txt variant="eyebrow" color="onNavy">
        {t('player.nowPlaying')}
      </Txt>
      <Txt variant="bodyStrong" color="white" numberOfLines={2}>
        {p.current.title}
      </Txt>
      <ProgressBar value={pct} color={colors.onNavyGreen} track={colors.navyPanel} label={t('player.progress', { at: clockLabel(p.position), of: clockLabel(p.duration) })} />
      <Row style={{ justifyContent: 'space-between' }}>
        <Txt variant="caption" color="onNavy">
          {clockLabel(p.position)}
        </Txt>
        <Row gap={space.lg}>
          {button('play-skip-back', t('player.previous'), p.previous, false)}
          <Pressable
            onPress={p.toggle}
            disabled={p.loading}
            accessibilityRole="button"
            accessibilityLabel={p.playing ? t('player.pauseTitle', { title: p.current.title }) : t('player.playTitle', { title: p.current.title })}
            accessibilityState={{ busy: p.loading }}
            style={({ pressed }) => ({ width: 52, height: 52, borderRadius: 26, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center', opacity: pressed || p.loading ? 0.8 : 1 })}>
            <PlayGlyph size={22} paused={p.playing} />
          </Pressable>
          {button('play-skip-forward', t('player.next'), p.next, !p.hasNext)}
        </Row>
        <Txt variant="caption" color="onNavy">
          {p.duration > 0 ? clockLabel(p.duration) : ''}
        </Txt>
      </Row>
      {p.error ? <Banner tone="error" message={p.error} action={{ label: t('common.retry'), onPress: p.retry }} /> : null}
    </Card>
  );
}

/** Stavan, video or podcast: play / watch, heart, My playlist, lyrics or notes. */
export function MediaDetailView({ item }: { item: MediaItem }) {
  const t = useT();
  const player = usePlayer();
  const actions = useMediaActions();
  const watch = useWatch();
  const playback = playbackOf(item);
  const w = watchSourceOf(item);
  const isCurrent = player.current?.id === item.id;
  // Web: an uploaded video plays in the page from a signed URL.
  const fileUrl = useLoad(
    () => (VIDEO_INLINE && w?.kind === 'file' ? mediaUrl(w.ref, `play ${item.title}`) : Promise.resolve(null)),
    [item.id, VIDEO_INLINE, w?.kind ?? null],
    'load the video',
  );
  const inline: InlineVideoSource | null = !VIDEO_INLINE || !w ? null : w.kind === 'youtube' ? { kind: 'youtube', id: w.id } : w.kind === 'file' && fileUrl.data ? { kind: 'file', url: fileUrl.data } : null;
  const sub = mediaSubtitle(t, item);

  return (
    <VStack gap={14}>
      <Band color={item.kind === 'video' ? colors.videoTile : colors.navy} eyebrow={kindName(t, item.kind)} title={item.title} subtitle={sub || undefined} />

      {playback === 'audio' ? (
        isCurrent && player.queue.length > 1 ? (
          <NowPlaying />
        ) : (
          <Card>
            <Row gap={space.md}>
              <PlayToggle item={item} size={56} onPlay={() => player.playQueue([toQueueItem(t, item)])} />
              <View style={{ flex: 1 }}>
                <Txt variant="bodyStrong">{isCurrent ? (player.playing ? t('player.playing') : player.loading ? t('player.loading') : t('player.paused')) : t('media.listenHere')}</Txt>
                <Txt variant="caption" color="muted">
                  {isCurrent && player.duration > 0 ? `${clockLabel(player.position)} / ${clockLabel(player.duration)}` : (durationText(t, item.meta.durationSeconds) ?? t('media.keepsPlaying'))}
                </Txt>
              </View>
            </Row>
            {isCurrent ? <ProgressBar value={player.duration > 0 ? player.position / player.duration : 0} track={colors.divider} label={t('player.progress', { at: clockLabel(player.position), of: clockLabel(player.duration) })} /> : null}
            {isCurrent && player.error ? <Banner tone="error" message={player.error} action={{ label: t('common.retry'), onPress: player.retry }} /> : null}
          </Card>
        )
      ) : null}

      {playback === 'watch' && VIDEO_INLINE ? (
        inline ? (
          <InlineVideo source={inline} title={item.title} onPlay={player.pause} />
        ) : fileUrl.error ? (
          <ErrorState error={fileUrl.error} onRetry={() => void fileUrl.reload()} />
        ) : (
          <View style={{ height: 200, borderRadius: radii.xxl, backgroundColor: colors.videoTile }} />
        )
      ) : null}
      {playback === 'watch' && !VIDEO_INLINE ? (
        <View style={{ height: 200, borderRadius: radii.xxl, backgroundColor: colors.videoTile, alignItems: 'center', justifyContent: 'center', gap: space.sm }}>
          <Pressable
            onPress={() => watch.watch(item, { here: true })}
            disabled={watch.busyId === item.id}
            accessibilityRole="button"
            accessibilityLabel={t('media.watchA11y', { title: item.title })}
            style={({ pressed }) => ({ width: 72, height: 72, borderRadius: 36, backgroundColor: colors.ground, alignItems: 'center', justifyContent: 'center', opacity: pressed || watch.busyId === item.id ? 0.8 : 1 })}>
            <PlayGlyph size={30} />
          </Pressable>
          <Txt variant="caption" style={{ color: colors.frame }}>
            {t('media.watchNote')}
          </Txt>
        </View>
      ) : null}
      {playback === 'link' ? <Button label={t('media.openPage')} tone="secondary" size="md" icon="open-outline" onPress={() => watch.watch(item)} busy={watch.busyId === item.id} /> : null}
      {playback === 'none' ? <Banner tone="info" message={t('media.notYet')} /> : null}
      {watch.error ? <Banner tone="error" message={watch.error} /> : null}

      <Row gap={space.sm} style={{ flexWrap: 'wrap' }}>
        <LikeButton item={item} actions={actions} large />
        <PlaylistButton item={item} actions={actions} large />
      </Row>
      <FailureBanner failure={actions.failure} />

      {item.bodyMd ? (
        <Card>
          <Txt variant="bodyStrong" accessibilityRole="header">
            {item.kind === 'stavan' ? t('media.lyrics') : t('media.about')}
          </Txt>
          {item.kind === 'stavan' ? (
            <Txt variant="body" color="ink2" selectable style={{ lineHeight: 24 }}>
              {item.bodyMd}
            </Txt>
          ) : (
            <Markdownish source={item.bodyMd} />
          )}
        </Card>
      ) : item.kind === 'stavan' ? (
        <Txt variant="small" color="muted">
          {t('media.lyricsSoon')}
        </Txt>
      ) : null}
      {item.meta.aliases.length ? (
        <Txt variant="meta" color="muted">
          {t('media.alsoKnownAs', { names: item.meta.aliases.join(', ') })}
        </Txt>
      ) : null}
      {item.meta.tags.length ? (
        <Row gap={6} style={{ flexWrap: 'wrap' }}>
          {item.meta.tags.map((tag) => (
            <Pill key={tag} label={tag} />
          ))}
        </Row>
      ) : null}
    </VStack>
  );
}

/** A recipe: photo, fully-Jain mark, servings and times, ingredients, method, heart. */
export function RecipeView({ item }: { item: MediaItem }) {
  const t = useT();
  const { center } = useApp();
  const actions = useMediaActions();
  const picture = useLoad(() => mediaPictures([item]), [item.id, center?.id], 'load the photo');
  const uri = picture.data?.[item.id] ?? null;
  const m = item.meta;
  const stats = [
    m.servings ? { label: t('media.servesLabel'), value: String(m.servings) } : null,
    m.prepMinutes ? { label: t('media.prepLabel'), value: t('media.minutes', { n: m.prepMinutes }) } : null,
    m.cookMinutes ? { label: t('media.cookLabel'), value: t('media.minutes', { n: m.cookMinutes }) } : null,
  ].filter((x): x is { label: string; value: string } => x !== null);

  return (
    <VStack gap={14}>
      {uri ? <Image source={{ uri }} style={{ width: '100%', aspectRatio: 4 / 3, borderRadius: radii.xxl }} contentFit="cover" transition={150} accessibilityLabel={t('media.photoOf', { title: item.title })} /> : null}
      {picture.error ? <ErrorState error={picture.error} onRetry={() => void picture.reload()} /> : null}
      <Band color={colors.brown} eyebrow={kindName(t, 'recipe')} title={item.title} subtitle={m.fullyJain ? t('media.fullyJainLong') : undefined} />
      {m.fullyJain === false ? <Pill tone="amber" label={t('media.notFullyJain')} /> : null}
      {stats.length ? (
        <Card>
          <Row gap={space.md}>
            {stats.map((s) => (
              <Stat key={s.label} label={s.label} value={s.value} />
            ))}
          </Row>
        </Card>
      ) : null}
      <Row gap={space.sm}>
        <LikeButton item={item} actions={actions} large />
      </Row>
      <FailureBanner failure={actions.failure} />
      <Card>
        <Txt variant="bodyStrong" accessibilityRole="header">
          {t('media.ingredients')}
        </Txt>
        {m.ingredients.length ? (
          <View style={{ gap: 4 }}>
            {m.ingredients.map((line, i) => (
              <Txt key={`${i}-${line}`} variant="body" color="ink2">
                {`•  ${line}`}
              </Txt>
            ))}
          </View>
        ) : (
          <Txt variant="small" color="muted">
            {t('media.noIngredients')}
          </Txt>
        )}
      </Card>
      <Card>
        <Txt variant="bodyStrong" accessibilityRole="header">
          {t('media.method')}
        </Txt>
        {item.bodyMd ? (
          <Markdownish source={item.bodyMd} />
        ) : (
          <Txt variant="small" color="muted">
            {t('media.noMethod')}
          </Txt>
        )}
      </Card>
    </VStack>
  );
}

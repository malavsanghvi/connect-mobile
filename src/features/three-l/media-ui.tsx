import { Image } from 'expo-image';
import { useRouter, type ImperativeRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { Icon, type IconName } from '@/components/icon';
import { Banner, Button, Card, LinkText, Row, Txt } from '@/components/ui';
import { mediaUrl } from '@/lib/api/media';
import { report } from '@/lib/errors';
import { audioSourceOf, canPlaylist, clockLabel, durationParts, playbackOf, watchSourceOf, youtubeWatchUrl, type MediaItem, type MediaKind } from '@/lib/media-library';
import type { QueueItem } from '@/lib/player-queue';
import { useApp } from '@/providers/app';
import { usePlayer } from '@/providers/player';
import { useT } from '@/providers/settings';
import { colors, fonts, radii, space, touch } from '@/theme';

import type { ActionFailure, MediaActions } from './actions';
import { VIDEO_INLINE } from './video';

type T = ReturnType<typeof useT>;

// ---------------------------------------------------------------------------
// Words
// ---------------------------------------------------------------------------

/** "6 min" · "45 sec" · "1 hr 5 min". */
export function durationText(t: T, seconds: number | null): string | null {
  const d = durationParts(seconds);
  if (!d) return null;
  if (d.hours > 0) return d.minutes ? t('media.hoursMinutes', { h: d.hours, m: d.minutes }) : t('media.hours', { h: d.hours });
  return d.minutes > 0 ? t('media.minutes', { n: d.minutes }) : t('media.seconds', { n: d.seconds });
}

/** Row subtitle: "Singer · 6 min", "Series · Episode 3 · 24 min", "Fully Jain · 30 min · Serves 4". */
export function mediaSubtitle(t: T, item: MediaItem): string {
  const m = item.meta;
  if (item.kind === 'recipe') {
    const total = (m.prepMinutes ?? 0) + (m.cookMinutes ?? 0);
    return [m.fullyJain ? t('media.fullyJain') : null, total > 0 ? t('media.minutes', { n: total }) : null, m.servings ? t('media.serves', { n: m.servings }) : null].filter(Boolean).join(' · ');
  }
  const dur = durationText(t, m.durationSeconds);
  if (item.kind === 'podcast') return [m.series ?? m.artist, m.episode ? t('media.episode', { n: m.episode }) : null, dur].filter(Boolean).join(' · ');
  return [m.artist, dur].filter(Boolean).join(' · ');
}

const KIND_ONE: Record<MediaKind, 'media.kind.stavan' | 'media.kind.video' | 'media.kind.podcast' | 'media.kind.recipe'> = {
  stavan: 'media.kind.stavan',
  video: 'media.kind.video',
  podcast: 'media.kind.podcast',
  recipe: 'media.kind.recipe',
};
const KIND_MANY: Record<MediaKind, 'media.kinds.stavan' | 'media.kinds.video' | 'media.kinds.podcast' | 'media.kinds.recipe'> = {
  stavan: 'media.kinds.stavan',
  video: 'media.kinds.video',
  podcast: 'media.kinds.podcast',
  recipe: 'media.kinds.recipe',
};
const KIND_EMPTY: Record<MediaKind, 'media.empty.stavan' | 'media.empty.video' | 'media.empty.podcast' | 'media.empty.recipe'> = {
  stavan: 'media.empty.stavan',
  video: 'media.empty.video',
  podcast: 'media.empty.podcast',
  recipe: 'media.empty.recipe',
};

export const kindName = (t: T, kind: MediaKind) => t(KIND_ONE[kind]);
export const kindPlural = (t: T, kind: MediaKind) => t(KIND_MANY[kind]);
/** "No stavans yet — your community has not added any." */
export const kindEmpty = (t: T, kind: MediaKind) => t(KIND_EMPTY[kind]);

export const KIND_ICON: Record<MediaKind, IconName> = {
  stavan: 'musical-notes-outline',
  video: 'videocam-outline',
  podcast: 'mic-outline',
  recipe: 'restaurant-outline',
};

/** The player's view of an item (videos and items without audio are kept, never played). */
export function toQueueItem(t: T, item: MediaItem): QueueItem {
  const src = audioSourceOf(item);
  return {
    id: item.id,
    title: item.title,
    subtitle: mediaSubtitle(t, item) || null,
    kind: item.kind,
    playable: !!src,
    path: src && 'path' in src ? src.path : null,
    url: src && 'url' in src ? src.url : null,
  };
}

// ---------------------------------------------------------------------------
// Navigation, watching
// ---------------------------------------------------------------------------

export function openItem(router: ImperativeRouter, item: Pick<MediaItem, 'id' | 'kind'>): void {
  if (item.kind === 'recipe') router.push({ pathname: '/recipe/[id]', params: { id: item.id } });
  else router.push({ pathname: '/media/[kind]/[id]', params: { kind: item.kind, id: item.id } });
}

export type Watch = { watch: (item: MediaItem, opts?: { here?: boolean }) => void; busyId: string | null; error: string | null };

/**
 * "Watch" / "Open": on the web a YouTube video or uploaded file plays in the
 * item's own screen (inline); on a phone it opens full screen in the in-app
 * browser, as live darshan does. A web page always opens in the browser. The
 * 3L player pauses first so two sounds never overlap.
 */
export function useWatch(): Watch {
  const router = useRouter();
  const player = usePlayer();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const watch = async (item: MediaItem, opts?: { here?: boolean }) => {
    const w = watchSourceOf(item);
    if (!w) return;
    setError(null);
    if (VIDEO_INLINE && w.kind !== 'link' && !opts?.here) {
      openItem(router, item);
      return;
    }
    setBusyId(item.id);
    try {
      const url = w.kind === 'youtube' ? youtubeWatchUrl(w.id) : w.kind === 'link' ? w.url : await mediaUrl(w.ref, `open ${item.title}`);
      player.pause();
      await WebBrowser.openBrowserAsync(url, { presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN });
    } catch (err) {
      setError(report(err, `open ${item.title}`).userMessage);
    } finally {
      setBusyId(null);
    }
  };

  return { watch: (item, opts) => void watch(item, opts), busyId, error };
}

// ---------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------

/** Heart with the like count (stavans, videos, podcasts, recipes). */
export function LikeButton({ item, actions, large }: { item: MediaItem; actions: MediaActions; large?: boolean }) {
  const t = useT();
  const { liked, count } = actions.likeOf(item);
  const busy = actions.isBusy(item);
  return (
    <Pressable
      onPress={() => actions.toggleLike(item)}
      disabled={busy}
      accessibilityRole="button"
      accessibilityState={{ selected: liked, busy }}
      accessibilityLabel={`${liked ? t('media.likedA11y', { title: item.title }) : t('media.likeA11y', { title: item.title })}. ${count === 1 ? t('media.likeOne') : t('media.likes', { n: count })}`}
      style={({ pressed }) => ({
        minWidth: touch.min,
        minHeight: touch.min,
        paddingHorizontal: large ? space.md : 4,
        borderRadius: radii.pill,
        borderWidth: large ? 1 : 0,
        borderColor: liked ? colors.live : colors.borderInput,
        backgroundColor: large ? colors.card : 'transparent',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
        opacity: pressed || busy ? 0.6 : 1,
      })}>
      <Icon name={liked ? 'heart' : 'heart-outline'} size={large ? 20 : 22} color={liked ? colors.live : colors.faint} />
      {count > 0 || large ? (
        <Txt variant={large ? 'smallStrong' : 'caption'} color={liked ? 'live' : 'muted'}>
          {large ? (count === 1 ? t('media.likeOne') : t('media.likes', { n: count })) : String(count)}
        </Txt>
      ) : null}
    </Pressable>
  );
}

/** Add to / take off My playlist (stavans, videos, podcasts). */
export function PlaylistButton({ item, actions, large }: { item: MediaItem; actions: MediaActions; large?: boolean }) {
  const t = useT();
  if (!canPlaylist(item.kind)) return null;
  const on = actions.inPlaylist(item);
  const busy = actions.isBusy(item);
  return (
    <Pressable
      onPress={() => actions.togglePlaylist(item)}
      disabled={busy}
      accessibilityRole="button"
      accessibilityState={{ selected: on, busy }}
      accessibilityLabel={on ? t('media.inPlaylistA11y', { title: item.title }) : t('media.addA11y', { title: item.title })}
      style={({ pressed }) => ({
        minWidth: touch.min,
        minHeight: touch.min,
        paddingHorizontal: large ? space.md : 0,
        borderRadius: radii.pill,
        borderWidth: large ? 1 : 0,
        borderColor: on ? colors.green : colors.navy,
        backgroundColor: large ? colors.card : 'transparent',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
        opacity: pressed || busy ? 0.6 : 1,
      })}>
      <Icon name={on ? 'checkmark-circle' : 'add-circle-outline'} size={large ? 20 : 24} color={on ? colors.green : colors.navy} />
      {large ? (
        <Txt variant="smallStrong" color={on ? 'green' : 'navy'}>
          {on ? t('media.inPlaylist') : t('media.addToPlaylist')}
        </Txt>
      ) : null}
    </Pressable>
  );
}

/** Round play / pause for an audio row; reflects the app-wide player when this item is the current one. */
export function PlayToggle({ item, onPlay, size = touch.min }: { item: MediaItem; onPlay: () => void; size?: number }) {
  const t = useT();
  const p = usePlayer();
  const isCurrent = p.current?.id === item.id;
  const playing = isCurrent && p.playing;
  const loading = isCurrent && p.loading;
  return (
    <Pressable
      onPress={isCurrent && !p.error ? p.toggle : onPlay}
      disabled={loading}
      accessibilityRole="button"
      accessibilityState={{ busy: loading, selected: isCurrent }}
      accessibilityLabel={playing ? t('player.pauseTitle', { title: item.title }) : t('player.playTitle', { title: item.title })}
      style={({ pressed }) => ({ width: size, height: size, borderRadius: size / 2, backgroundColor: isCurrent ? colors.navy : colors.panel, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.8 : 1 })}>
      {loading ? <ActivityIndicator color={colors.white} /> : <Icon name={playing ? 'pause' : 'play'} size={size > touch.min ? 26 : 18} color={isCurrent ? colors.white : colors.navy} />}
    </Pressable>
  );
}

/** Square picture (recipe photo, video thumbnail) or a plain tile with the kind's icon. */
export function Thumb({ uri, kind, width = 56, height = 56, overlay }: { uri?: string | null; kind: MediaKind; width?: number; height?: number; overlay?: ReactNode }) {
  return (
    <View style={{ width, height, borderRadius: radii.lg, backgroundColor: kind === 'video' ? colors.videoTile : colors.panel, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
      {uri ? <Image source={{ uri }} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} contentFit="cover" transition={150} accessibilityIgnoresInvertColors /> : null}
      {overlay ?? (uri ? null : <Icon name={KIND_ICON[kind]} size={22} color={kind === 'video' ? colors.viewerText : colors.brown} />)}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Rows and shelves
// ---------------------------------------------------------------------------

/**
 * One library row: play (audio) / watch (video) / picture (recipe) on the
 * left, title and details (tap for the full screen), heart and playlist on
 * the right (or `right`, e.g. the reorder arrows of My playlist).
 */
export function MediaRow({
  item,
  actions,
  picture,
  onPlay,
  watch,
  last,
  right,
}: {
  item: MediaItem;
  actions: MediaActions;
  picture?: string | null;
  onPlay?: () => void;
  watch?: Watch;
  last?: boolean;
  right?: ReactNode;
}) {
  const t = useT();
  const router = useRouter();
  const p = usePlayer();
  const playback = playbackOf(item);
  const isCurrent = p.current?.id === item.id;
  const sub = mediaSubtitle(t, item);
  const status = isCurrent && (p.playing || p.position > 0) ? t('player.playingAt', { time: clockLabel(p.position) }) : null;
  const note = playback === 'none' ? t('media.comingSoon') : playback === 'link' ? t('media.opensWeb') : null;
  const line = [status ?? sub, note].filter(Boolean).join(' · ');

  let lead: ReactNode;
  if (item.kind === 'recipe') {
    lead = <Thumb uri={picture} kind="recipe" />;
  } else if (playback === 'audio' && onPlay) {
    lead = <PlayToggle item={item} onPlay={onPlay} />;
  } else if ((playback === 'watch' || playback === 'link') && watch) {
    const busy = watch.busyId === item.id;
    lead = (
      <Pressable
        onPress={() => watch.watch(item)}
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel={playback === 'link' ? t('media.openA11y', { title: item.title }) : t('media.watchA11y', { title: item.title })}
        style={({ pressed }) => ({ opacity: pressed || busy ? 0.75 : 1 })}>
        <Thumb
          uri={picture}
          kind={item.kind}
          width={item.kind === 'video' ? 72 : 56}
          height={item.kind === 'video' ? 48 : 56}
          overlay={
            <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: colors.scrimFaint, alignItems: 'center', justifyContent: 'center' }}>
              {busy ? <ActivityIndicator color={colors.white} /> : <Icon name={playback === 'link' ? 'open-outline' : 'play'} size={16} color={colors.white} />}
            </View>
          }
        />
      </Pressable>
    );
  } else {
    lead = <Thumb uri={picture} kind={item.kind} width={44} height={44} />;
  }

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: last ? 0 : 1, borderBottomColor: colors.divider }}>
      {lead}
      <Pressable
        onPress={() => openItem(router, item)}
        accessibilityRole="button"
        accessibilityLabel={[item.title, line].filter(Boolean).join('. ')}
        accessibilityHint={t('media.openHint')}
        style={({ pressed }) => ({ flex: 1, minHeight: touch.min, justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}>
        <Txt variant="body" numberOfLines={2} style={{ fontFamily: fonts.bodyMedium }}>
          {item.title}
        </Txt>
        {line ? (
          <Txt variant="caption" color={isCurrent ? 'navy' : 'muted'} numberOfLines={1} style={{ fontFamily: fonts.body }}>
            {line}
          </Txt>
        ) : null}
      </Pressable>
      {right ?? (
        <>
          <LikeButton item={item} actions={actions} />
          <PlaylistButton item={item} actions={actions} />
        </>
      )}
    </View>
  );
}

/** White card the rows sit in. */
export function ListCard({ children }: { children: ReactNode }) {
  return <View style={{ backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radii.xl, paddingVertical: 2, paddingHorizontal: 12 }}>{children}</View>;
}

/** A 3L shelf: heading, "See all", and its rows. */
export function Shelf({ title, onSeeAll, seeAllLabel, children }: { title: string; onSeeAll?: () => void; seeAllLabel?: string; children: ReactNode }) {
  return (
    <View style={{ gap: space.sm }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Txt variant="section" accessibilityRole="header" style={{ flex: 1 }}>
          {title}
        </Txt>
        {onSeeAll && seeAllLabel ? <LinkText label={seeAllLabel} onPress={onSeeAll} /> : null}
      </Row>
      {children}
    </View>
  );
}

/** "No recipes yet — your community has not added any." */
export function EmptyLine({ text }: { text: string }) {
  return (
    <Card tone="dashed">
      <Txt variant="small" color="muted">
        {text}
      </Txt>
    </Card>
  );
}

/** A like / playlist change that failed, with "Try again". */
export function FailureBanner({ failure }: { failure: ActionFailure | null }) {
  const t = useT();
  if (!failure) return null;
  return <Banner tone="error" message={failure.message} action={{ label: t('common.retry'), onPress: failure.retry }} />;
}

/** The library is for the community's members (the RPCs check it): guests are asked to sign in. */
export function MembersOnly() {
  const t = useT();
  const { setGuest } = useApp();
  return (
    <Card tone="panel">
      <Txt variant="small">{t('threeL.signIn')}</Txt>
      <Button label={t('common.signIn')} onPress={() => setGuest(false)} size="md" />
    </Card>
  );
}

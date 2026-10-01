import { useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';

import { Icon } from '@/components/icon';
import { Screen } from '@/components/screen';
import { EmptyState, Loaded } from '@/components/states';
import { Banner, Button, Row, Txt, VStack } from '@/components/ui';
import { useMediaActions, type ActionFailure } from '@/features/three-l/actions';
import { NowPlaying } from '@/features/three-l/detail';
import { FailureBanner, ListCard, MediaRow, MembersOnly, toQueueItem, useWatch } from '@/features/three-l/media-ui';
import { loadMyPlaylist, mostLikedMedia, reorderPlaylist } from '@/lib/api/media';
import { report } from '@/lib/errors';
import type { MediaItem } from '@/lib/media-library';
import { moveItem } from '@/lib/player-queue';
import { useLoad } from '@/lib/use-load';
import { useApp } from '@/providers/app';
import { useDataVersion } from '@/providers/data-version';
import { usePlayer } from '@/providers/player';
import { useT } from '@/providers/settings';
import { colors, space, touch } from '@/theme';

type Data = { mine: MediaItem[]; fallback: MediaItem[] };

/**
 * My playlist (3L › Listen, Home › Playlist): play all, reorder, remove.
 * `?autoplay=1` starts it on arrival. When the playlist is empty it offers
 * the community's most-liked stavans, then podcasts and videos — and says so.
 * Videos stay in the list with Watch; the player skips them.
 */
export default function PlaylistScreen() {
  const t = useT();
  const { autoplay } = useLocalSearchParams<{ autoplay?: string }>();
  const { center, member } = useApp();
  const { invalidate } = useDataVersion();
  const player = usePlayer();
  const actions = useMediaActions();
  const watch = useWatch();
  const [editing, setEditing] = useState(false);
  const [moved, setMoved] = useState<{ base: Data; items: MediaItem[] } | null>(null);
  const [saving, setSaving] = useState(false);
  const [orderError, setOrderError] = useState<ActionFailure | null>(null);
  const [nothingToPlay, setNothingToPlay] = useState(false);
  const state = useLoad(
    async (): Promise<Data> => {
      if (!center || !member) return { mine: [], fallback: [] };
      const mine = await loadMyPlaylist(center.id);
      return { mine, fallback: mine.length ? [] : await mostLikedMedia(center.id) };
    },
    [center?.id, member?.person.id],
    'load your playlist',
  );
  const base = state.data;
  const started = useRef(false);

  // "Play my playlist" from Home: start once, when the list first arrives.
  useEffect(() => {
    if (autoplay !== '1' || started.current || !base) return;
    started.current = true;
    const items = base.mine.length ? base.mine : base.fallback;
    player.playQueue(items.map((i) => toQueueItem(t, i)));
  }, [autoplay, base, player, t]);

  if (!member) {
    return (
      <Screen title={t('threeL.myPlaylist')}>
        <MembersOnly />
      </Screen>
    );
  }

  // The member's latest order (until the reload after saving it), without what they just removed.
  const ordered = moved && moved.base === base ? moved.items : (base?.mine ?? []);
  const mine = ordered.filter((i) => actions.inPlaylist(i));
  const usingFallback = !!base && base.mine.length === 0;
  const list = usingFallback ? (base?.fallback ?? []) : mine;
  const queue = list.map((i) => toQueueItem(t, i));
  const playable = queue.some((q) => q.playable);

  const playAll = (startId?: string) => setNothingToPlay(!player.playQueue(queue, startId));

  const move = async (index: number, delta: -1 | 1) => {
    if (!base || !center || saving) return;
    const before = mine;
    const next = moveItem(before, index, delta);
    setMoved({ base, items: next });
    setSaving(true);
    setOrderError(null);
    try {
      await reorderPlaylist(
        center.id,
        next.map((i) => i.id),
      );
      invalidate();
    } catch (err) {
      setMoved({ base, items: before });
      setOrderError({ message: report(err, 'save the new order of your playlist').userMessage, retry: () => void move(index, delta) });
    } finally {
      setSaving(false);
    }
  };

  const arrow = (icon: 'arrow-up' | 'arrow-down', label: string, onPress: () => void, disabled: boolean) => (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      style={({ pressed }) => ({ width: touch.min, height: touch.min, borderRadius: touch.min / 2, borderWidth: 1, borderColor: colors.borderInput, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.35 : pressed ? 0.7 : 1 })}>
      <Icon name={icon} size={18} color={colors.navy} />
    </Pressable>
  );

  return (
    <Screen title={t('threeL.myPlaylist')} onRefresh={async () => invalidate()}>
      <NowPlaying />
      <Loaded state={state}>
        {() =>
          list.length === 0 ? (
            <EmptyState icon="musical-notes-outline" title={usingFallback ? t('threeL.nothingYet') : t('threeL.playlistNowEmpty')} body={usingFallback ? undefined : t('threeL.playlistEmpty')} />
          ) : (
            <VStack gap={space.md}>
              {usingFallback ? <Banner tone="info" message={t('threeL.fallbackNote')} /> : null}
              {(autoplay === '1' && !playable) || nothingToPlay ? <Banner tone="info" message={t('threeL.nothingPlayable')} /> : null}
              <Row gap={space.sm} style={{ flexWrap: 'wrap' }}>
                {playable ? <Button label={usingFallback ? t('threeL.playMostLiked') : t('threeL.playAll')} tone="primary" size="sm" icon="play" fill={false} onPress={() => playAll()} /> : null}
                {!usingFallback && mine.length > 1 ? (
                  <Button label={editing ? t('common.done') : t('threeL.reorder')} tone="secondary" size="sm" icon={editing ? 'checkmark' : 'swap-vertical'} fill={false} onPress={() => setEditing(!editing)} />
                ) : null}
                <View style={{ flex: 1 }} />
                <Txt variant="meta" color="muted">
                  {list.length === 1 ? t('threeL.itemsOne') : t('threeL.items', { n: list.length })}
                </Txt>
              </Row>
              {orderError ? <Banner tone="error" message={orderError.message} action={{ label: t('common.retry'), onPress: orderError.retry }} /> : null}
              <FailureBanner failure={actions.failure} />
              {watch.error ? <Banner tone="error" message={watch.error} /> : null}
              <ListCard>
                {list.map((item, i) => (
                  <MediaRow
                    key={item.id}
                    item={item}
                    actions={actions}
                    watch={watch}
                    onPlay={() => playAll(item.id)}
                    last={i === list.length - 1}
                    right={
                      editing && !usingFallback ? (
                        <Row gap={4}>
                          {arrow('arrow-up', t('threeL.moveUp', { title: item.title }), () => void move(i, -1), saving || i === 0)}
                          {arrow('arrow-down', t('threeL.moveDown', { title: item.title }), () => void move(i, 1), saving || i === list.length - 1)}
                        </Row>
                      ) : undefined
                    }
                  />
                ))}
              </ListCard>
              {!usingFallback ? (
                <Txt variant="fine" color="muted">
                  {t('threeL.removeHint')}
                </Txt>
              ) : null}
            </VStack>
          )
        }
      </Loaded>
    </Screen>
  );
}

import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { FeatureNotice } from '@/components/feature-notice';
import { EmptyState, Loaded } from '@/components/states';
import { Banner, Button, Card, Chevron, Row, Txt, VStack } from '@/components/ui';
import { PlayGlyph } from '@/features/gyan-ui';
import { listContent, type ContentItem } from '@/lib/api/jainway';
import { listMedia, loadMyPlaylist } from '@/lib/api/media';
import { clockLabel, type MediaItem } from '@/lib/media-library';
import { LEARN_PART_MODULE } from '@/lib/modules';
import type { QueueItem } from '@/lib/player-queue';
import { useLoad } from '@/lib/use-load';
import { useFeature } from '@/providers/access';
import { useApp } from '@/providers/app';
import { useModules } from '@/providers/modules';
import { usePlayer } from '@/providers/player';
import { useT } from '@/providers/settings';
import { colors, fonts, radii, space, touch } from '@/theme';

import { useMediaActions } from './actions';
import { EmptyLine, FailureBanner, ListCard, MediaRow, Shelf, kindEmpty, toQueueItem, useWatch } from './media-ui';

const SHELF = 3;

type T = ReturnType<typeof useT>;

function meta(item: ContentItem): Record<string, unknown> {
  return item.metadata && typeof item.metadata === 'object' && !Array.isArray(item.metadata) ? (item.metadata as Record<string, unknown>) : {};
}

/** An audio lesson (content kind audio_lesson) for the player; the recording is its link, else an uploaded file. */
function lessonQueueItem(t: T, c: ContentItem): QueueItem {
  const m = meta(c);
  const mins = typeof m.minutes === 'number' ? t('media.minutes', { n: m.minutes }) : typeof m.duration === 'string' ? m.duration : null;
  const sub = [typeof m.course === 'string' ? m.course : null, mins].filter(Boolean).join(' · ');
  const url = c.media_url?.trim() || null;
  const path = url ? null : c.media_path?.trim() || null;
  return { id: c.id, title: c.title, subtitle: sub || null, kind: 'audio_lesson', playable: !!(url || path), path, url };
}

/**
 * 3L › Listen: My playlist, stavans, podcasts, the "Listen and learn" audio
 * lessons and the pachchakhan library. Everything plays in the app-wide
 * queue (mini player above the tab bar). Listen (all but the pachchakhan
 * library) is an area of the organization's access levels: a visitor is asked
 * to sign in, a member below the level it asks for is told which level it
 * takes. The pachchakhan library is open to guests.
 */
export function ListenSection() {
  const { member } = useApp();
  const { isOn } = useModules();
  const listen = useFeature('listen');
  return (
    <VStack gap={18}>
      {listen.allowed && member ? (
        <>
          <ListenShelves />
          {isOn(LEARN_PART_MODULE.lessons) ? <LessonsShelf /> : null}
        </>
      ) : (
        <FeatureNotice feature="listen" />
      )}
      <PachchakhanShelf />
    </VStack>
  );
}

function ListenShelves() {
  const t = useT();
  const router = useRouter();
  const { center, member } = useApp();
  const player = usePlayer();
  const actions = useMediaActions();
  const watch = useWatch();
  const [nothingToPlay, setNothingToPlay] = useState(false);
  const playlist = useLoad(() => (center ? loadMyPlaylist(center.id) : Promise.resolve([])), [center?.id, member?.person.id], 'load your playlist');
  const library = useLoad(() => (center ? listMedia(center.id, ['stavan', 'podcast'], { sort: 'recent' }) : Promise.resolve([])), [center?.id], 'load stavans and podcasts');

  const play = (list: MediaItem[], startId?: string) => {
    setNothingToPlay(!player.playQueue(list.map((i) => toQueueItem(t, i)), startId));
  };

  return (
    <VStack gap={18}>
      <FailureBanner failure={actions.failure} />
      {watch.error ? <Banner tone="error" message={watch.error} /> : null}

      <Shelf title={t('threeL.myPlaylist')} onSeeAll={() => router.push('/listen/playlist')} seeAllLabel={t('threeL.openPlaylist')}>
        <Loaded state={playlist}>
          {(items) =>
            items.length === 0 ? (
              <Card tone="dashed">
                <Txt variant="small" color="muted">
                  {t('threeL.playlistEmpty')}
                </Txt>
                <Button label={t('threeL.playMostLiked')} tone="secondary" size="sm" icon="play" fill={false} onPress={() => router.push({ pathname: '/listen/playlist', params: { autoplay: '1' } })} />
              </Card>
            ) : (
              <VStack gap={space.sm}>
                <Row gap={space.sm}>
                  <Button label={t('threeL.playAll')} tone="primary" size="sm" icon="play" fill={false} onPress={() => play(items)} />
                  <Txt variant="meta" color="muted" style={{ flex: 1 }}>
                    {items.length === 1 ? t('threeL.itemsOne') : t('threeL.items', { n: items.length })}
                  </Txt>
                </Row>
                {nothingToPlay ? <Banner tone="info" message={t('threeL.nothingPlayable')} /> : null}
                <ListCard>
                  {items.slice(0, SHELF).map((item, i, list) => (
                    <MediaRow key={item.id} item={item} actions={actions} watch={watch} onPlay={() => play(items, item.id)} last={i === list.length - 1} />
                  ))}
                </ListCard>
              </VStack>
            )
          }
        </Loaded>
      </Shelf>

      <Loaded state={library}>
        {(all) => (
          <VStack gap={18}>
            {(['stavan', 'podcast'] as const).map((kind) => {
              const items = all.filter((i) => i.kind === kind);
              return (
                <Shelf
                  key={kind}
                  title={t(kind === 'stavan' ? 'media.kinds.stavan' : 'media.kinds.podcast')}
                  onSeeAll={items.length ? () => router.push({ pathname: '/media/[kind]', params: { kind } }) : undefined}
                  seeAllLabel={t('threeL.seeAll', { n: items.length })}>
                  {items.length === 0 ? (
                    <EmptyLine text={kindEmpty(t, kind)} />
                  ) : (
                    <VStack gap={space.sm}>
                      {kind === 'podcast' ? (
                        <Button label={t('threeL.randomPodcast')} tone="secondary" size="sm" icon="shuffle" fill={false} onPress={() => router.push('/listen/podcast-random')} />
                      ) : null}
                      <ListCard>
                        {items.slice(0, SHELF).map((item, i, list) => (
                          <MediaRow key={item.id} item={item} actions={actions} watch={watch} onPlay={() => play(items, item.id)} last={i === list.length - 1} />
                        ))}
                      </ListCard>
                    </VStack>
                  )}
                </Shelf>
              );
            })}
          </VStack>
        )}
      </Loaded>
    </VStack>
  );
}

/** "Listen and learn": the Pathshala's audio lessons (formerly under Learn), played in the same queue. */
function LessonsShelf() {
  const t = useT();
  const { center } = useApp();
  const player = usePlayer();
  const lessons = useLoad(() => (center ? listContent(center.id, 'audio_lesson') : Promise.resolve([])), [center?.id], 'load lessons');

  return (
    <Shelf title={t('learn.listen')}>
      <Loaded state={lessons}>
        {(items) => {
          if (items.length === 0) return <EmptyLine text={t('learn.noLessons')} />;
          const queue = items.map((c) => lessonQueueItem(t, c));
          return (
            <VStack gap={space.sm}>
              {queue.map((q) => {
                const isCurrent = player.current?.id === q.id;
                const playing = isCurrent && player.playing;
                const line = !q.playable ? t('learn.lessonNoAudio') : isCurrent && (player.playing || player.position > 0) ? t('player.playingAt', { time: clockLabel(player.position) }) : q.subtitle;
                return (
                  <Pressable
                    key={q.id}
                    disabled={!q.playable}
                    onPress={() => (isCurrent && !player.error ? player.toggle() : player.playQueue(queue, q.id))}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: !q.playable, selected: playing }}
                    accessibilityLabel={[playing ? t('player.pauseTitle', { title: q.title }) : t('player.playTitle', { title: q.title }), line].filter(Boolean).join('. ')}
                    style={({ pressed }) => ({ backgroundColor: colors.card, borderWidth: 1, borderColor: isCurrent ? colors.navy : colors.border, borderRadius: radii.row, paddingVertical: 12, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: space.md, opacity: pressed ? 0.85 : 1 })}>
                    <View style={{ width: touch.min, height: touch.min, borderRadius: touch.min / 2, backgroundColor: colors.panel, alignItems: 'center', justifyContent: 'center' }}>
                      <PlayGlyph size={18} paused={playing} color={q.playable ? colors.navy : colors.faint} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Txt variant="body" style={{ fontFamily: fonts.bodyMedium }}>
                        {q.title}
                      </Txt>
                      {line ? (
                        <Txt variant="caption" color={isCurrent ? 'navy' : 'muted'} style={{ fontFamily: fonts.body }}>
                          {line}
                        </Txt>
                      ) : null}
                    </View>
                  </Pressable>
                );
              })}
            </VStack>
          );
        }}
      </Loaded>
    </Shelf>
  );
}

/** The pachchakhan library (formerly Library): rows open the pachchakhan screen. Open to guests. */
function PachchakhanShelf() {
  const t = useT();
  const router = useRouter();
  const { center } = useApp();
  const pach = useLoad(() => (center ? listContent(center.id, 'pachchakhan') : Promise.resolve([])), [center?.id], 'load the pachchakhan library');
  return (
    <Shelf title={t('library.pachchakhan')}>
      <Loaded state={pach}>
        {(items) =>
          items.length === 0 ? (
            <EmptyState icon="book-outline" title={t('library.none')} />
          ) : (
            <View style={{ backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radii.xl, paddingVertical: 2, paddingHorizontal: 16 }}>
              {items.map((c, i) => {
                const when = typeof meta(c).when === 'string' ? (meta(c).when as string) : null;
                return (
                  <Pressable
                    key={c.id}
                    onPress={() => router.push({ pathname: '/pachchakhan/[id]', params: { id: c.id } })}
                    accessibilityRole="button"
                    accessibilityLabel={when ? `${c.title}. ${when}` : c.title}
                    style={({ pressed }) => ({ minHeight: touch.row, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: i < items.length - 1 ? 1 : 0, borderBottomColor: colors.divider, opacity: pressed ? 0.7 : 1 })}>
                    <View style={{ flex: 1 }}>
                      <Txt variant="body" style={{ fontFamily: fonts.bodyMedium }}>
                        {c.title}
                      </Txt>
                      {when ? (
                        <Txt variant="caption" color="muted" style={{ fontFamily: fonts.body }}>
                          {when}
                        </Txt>
                      ) : null}
                    </View>
                    <Chevron />
                  </Pressable>
                );
              })}
            </View>
          )
        }
      </Loaded>
    </Shelf>
  );
}

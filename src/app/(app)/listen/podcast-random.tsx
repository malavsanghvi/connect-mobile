import { useEffect, useRef } from 'react';

import { Screen } from '@/components/screen';
import { EmptyState, Loaded } from '@/components/states';
import { Button, VStack } from '@/components/ui';
import { MediaDetailView } from '@/features/three-l/detail';
import { MembersOnly, toQueueItem } from '@/features/three-l/media-ui';
import { useRandomPick } from '@/features/three-l/use-random-pick';
import { getMediaItem, randomMedia } from '@/lib/api/media';
import { audioSourceOf } from '@/lib/media-library';
import { useApp } from '@/providers/app';
import { usePlayer } from '@/providers/player';
import { useT } from '@/providers/settings';
import { space } from '@/theme';

/**
 * Home › Podcast: picks a random podcast from the community's library and
 * starts it in the 3L player ("Play another" picks again). A podcast that
 * lives on YouTube or a web page is shown with Watch / Open instead.
 */
export default function RandomPodcastScreen() {
  const t = useT();
  const { center, member } = useApp();
  const player = usePlayer();
  const { state, round, again } = useRandomPick(
    () => (center && member ? randomMedia(center.id, 'podcast') : Promise.resolve(null)),
    (id) => (center ? getMediaItem(id, center.id) : Promise.resolve(null)),
    [center?.id ?? null, member?.person.id ?? null],
    'pick a podcast',
  );
  const podcast = state.loading ? null : (state.data ?? null);
  const started = useRef<string | null>(null);

  // Start each pick once; the same pick fetched again (after a write elsewhere) keeps playing as it is.
  useEffect(() => {
    if (!podcast || started.current === `${round}:${podcast.id}`) return;
    started.current = `${round}:${podcast.id}`;
    if (audioSourceOf(podcast)) player.playQueue([toQueueItem(t, podcast)]);
  }, [podcast, round, player, t]);

  return (
    <Screen title={t('threeL.randomPodcastTitle')}>
      {!member ? (
        <MembersOnly />
      ) : (
        <Loaded state={state}>
          {(item) =>
            item ? (
              <VStack gap={space.lg}>
                <MediaDetailView key={item.id} item={item} />
                <Button label={t('threeL.anotherPodcast')} tone="secondary" size="md" icon="shuffle" onPress={again} busy={state.loading} />
              </VStack>
            ) : (
              <EmptyState icon="mic-outline" title={t('media.empty.podcast')} />
            )
          }
        </Loaded>
      )}
    </Screen>
  );
}

import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { Screen } from '@/components/screen';
import { EmptyState, ErrorState, Loaded } from '@/components/states';
import { Banner, Button, Chip, ChipGroup, Row, TextField, VStack } from '@/components/ui';
import { useMediaActions } from '@/features/three-l/actions';
import { FailureBanner, KIND_ICON, ListCard, MediaRow, MembersOnly, kindEmpty, kindPlural, toQueueItem, useWatch } from '@/features/three-l/media-ui';
import { listMedia, mediaPictures } from '@/lib/api/media';
import { isMediaKind, onlyFullyJain, searchQuery, type MediaItem, type MediaSort } from '@/lib/media-library';
import { useDebounced } from '@/lib/use-debounced';
import { useLoad } from '@/lib/use-load';
import { useApp } from '@/providers/app';
import { useDataVersion } from '@/providers/data-version';
import { usePlayer } from '@/providers/player';
import { useT } from '@/providers/settings';
import { colors, space } from '@/theme';

const SORTS: { value: MediaSort; label: 'media.sortTitle' | 'media.sortLiked' | 'media.sortRecent' }[] = [
  { value: 'title', label: 'media.sortTitle' },
  { value: 'liked', label: 'media.sortLiked' },
  { value: 'recent', label: 'media.sortRecent' },
];

/**
 * One shelf of the 3L library in full (stavans, videos, podcasts or recipes):
 * search (title, singer or speaker, other spellings, tags), A–Z / most liked
 * / newest, "Fully Jain only" for recipes (already on with `?fullyJain=1`,
 * Home's "Fully Jain recipes" tile), play all for audio.
 */
export default function MediaLibraryScreen() {
  const t = useT();
  const router = useRouter();
  const { kind: rawKind, fullyJain: fullyJainParam } = useLocalSearchParams<{ kind: string; fullyJain?: string }>();
  const kind = isMediaKind(rawKind) ? rawKind : null;
  const { center, member } = useApp();
  const { invalidate } = useDataVersion();
  const player = usePlayer();
  const actions = useMediaActions();
  const watch = useWatch();
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<MediaSort>('title');
  const [fullyJain, setFullyJain] = useState(fullyJainParam === '1');
  const [nothingToPlay, setNothingToPlay] = useState(false);
  const q = useDebounced(searchQuery(query), 300);
  const state = useLoad(
    () => (center && member && kind ? listMedia(center.id, [kind], { query: q, sort }) : Promise.resolve([] as MediaItem[])),
    [center?.id, member?.person.id, kind, q, sort],
    'load the library',
  );
  const items = kind === 'recipe' && fullyJain ? onlyFullyJain(state.data ?? []) : (state.data ?? []);
  const withPictures = kind === 'recipe' || kind === 'video';
  const pictures = useLoad(() => (withPictures ? mediaPictures(items) : Promise.resolve({} as Record<string, string>)), [withPictures, items.map((i) => i.id).join(',')], 'load the pictures');
  const title = kind ? kindPlural(t, kind) : t('threeL.title');

  if (!kind) {
    return (
      <Screen title={title}>
        <EmptyState title={t('media.unknownKind')} />
      </Screen>
    );
  }
  if (!member) {
    return (
      <Screen title={title}>
        <MembersOnly />
      </Screen>
    );
  }

  const audio = kind === 'stavan' || kind === 'podcast';
  const playAll = (startId?: string) => setNothingToPlay(!player.playQueue(items.map((i) => toQueueItem(t, i)), startId));
  const searching = state.loading && state.data !== undefined;

  return (
    <Screen title={title} onRefresh={async () => invalidate()}>
      <View>
        <TextField
          label={t('media.searchLabel', { kinds: title.toLowerCase() })}
          placeholder={t(kind === 'recipe' ? 'media.searchRecipePlaceholder' : 'media.searchPlaceholder')}
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          clearButtonMode="while-editing"
          accessibilityHint={t('media.searchHint')}
        />
        {searching ? <ActivityIndicator color={colors.navy} style={{ position: 'absolute', right: 12, bottom: 14 }} accessibilityLabel={t('media.searching')} /> : null}
      </View>
      <ChipGroup>
        {SORTS.map((s) => (
          <Chip key={s.value} label={t(s.label)} selected={sort === s.value} onPress={() => setSort(s.value)} />
        ))}
        {kind === 'recipe' ? <Chip label={t('media.fullyJainOnly')} selected={fullyJain} onPress={() => setFullyJain(!fullyJain)} tone="brown" /> : null}
      </ChipGroup>
      {audio || kind === 'recipe' ? (
        <Row gap={space.sm} style={{ flexWrap: 'wrap' }}>
          {audio && items.length > 0 ? <Button label={t('threeL.playAll')} tone="primary" size="sm" icon="play" fill={false} onPress={() => playAll()} /> : null}
          {kind === 'podcast' ? <Button label={t('threeL.randomPodcast')} tone="secondary" size="sm" icon="shuffle" fill={false} onPress={() => router.push('/listen/podcast-random')} /> : null}
          {kind === 'recipe' ? <Button label={t('threeL.surpriseRecipe')} tone="outlineBrown" size="sm" icon="shuffle" fill={false} onPress={() => router.push('/recipe/random')} /> : null}
        </Row>
      ) : null}
      {nothingToPlay ? <Banner tone="info" message={t('threeL.nothingPlayable')} /> : null}
      <FailureBanner failure={actions.failure} />
      {watch.error ? <Banner tone="error" message={watch.error} /> : null}
      {pictures.error ? <ErrorState error={pictures.error} onRetry={() => void pictures.reload()} /> : null}
      <Loaded state={state}>
        {() =>
          items.length === 0 ? (
            <EmptyState
              icon={KIND_ICON[kind]}
              title={q ? t('media.noMatch', { q }) : kind === 'recipe' && fullyJain && (state.data?.length ?? 0) > 0 ? t('media.noFullyJain') : kindEmpty(t, kind)}
            />
          ) : (
            <VStack gap={space.sm}>
              <ListCard>
                {items.map((item, i) => (
                  <MediaRow key={item.id} item={item} actions={actions} watch={watch} picture={pictures.data?.[item.id] ?? null} onPlay={audio ? () => playAll(item.id) : undefined} last={i === items.length - 1} />
                ))}
              </ListCard>
            </VStack>
          )
        }
      </Loaded>
    </Screen>
  );
}

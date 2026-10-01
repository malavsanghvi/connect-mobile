import { useLocalSearchParams } from 'expo-router';

import { Screen } from '@/components/screen';
import { Loaded } from '@/components/states';
import { MediaDetailView, RecipeView } from '@/features/three-l/detail';
import { MembersOnly } from '@/features/three-l/media-ui';
import { getMediaItem } from '@/lib/api/media';
import type { MediaItem } from '@/lib/media-library';
import { useLoad } from '@/lib/use-load';
import { useApp } from '@/providers/app';
import { useDataVersion } from '@/providers/data-version';
import { useT } from '@/providers/settings';

/** A recipe from 3L › Look: photo, fully-Jain mark, servings and times, ingredients, method, heart. */
export default function RecipeScreen() {
  const t = useT();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { center, member } = useApp();
  const { invalidate } = useDataVersion();
  const state = useLoad(() => (member && center && id ? getMediaItem(id, center.id) : Promise.resolve(null as MediaItem | null)), [id, center?.id, member?.person.id], 'load this recipe');
  return (
    <Screen title={t('media.kind.recipe')} onRefresh={async () => invalidate()}>
      {member ? <Loaded state={state}>{(item) => (!item ? null : item.kind === 'recipe' ? <RecipeView item={item} /> : <MediaDetailView item={item} />)}</Loaded> : <MembersOnly />}
    </Screen>
  );
}

import { useLocalSearchParams } from 'expo-router';

import { Screen } from '@/components/screen';
import { Loaded } from '@/components/states';
import { MediaItemView } from '@/features/three-l/item-view';
import { MembersOnly, kindName } from '@/features/three-l/media-ui';
import { getMediaItem } from '@/lib/api/media';
import { isMediaKind, type MediaItem } from '@/lib/media-library';
import { useLoad } from '@/lib/use-load';
import { useApp } from '@/providers/app';
import { useDataVersion } from '@/providers/data-version';
import { useT } from '@/providers/settings';

/** A stavan, video or podcast in full: play or watch, heart, My playlist, lyrics or notes. */
export default function MediaItemScreen() {
  const t = useT();
  const { id, kind } = useLocalSearchParams<{ id: string; kind: string }>();
  const { center, member } = useApp();
  const { invalidate } = useDataVersion();
  const state = useLoad(() => (member && center && id ? getMediaItem(id, center.id) : Promise.resolve(null as MediaItem | null)), [id, center?.id, member?.person.id], 'load this item');
  const shownKind = state.data?.kind ?? (isMediaKind(kind) ? kind : null);
  return (
    <Screen title={shownKind ? kindName(t, shownKind) : t('threeL.title')} onRefresh={async () => invalidate()}>
      {/* The item's own kind decides which area it needs (a link can open any item under any kind). */}
      {member ? <Loaded state={state}>{(item) => (!item ? null : <MediaItemView item={item} />)}</Loaded> : <MembersOnly />}
    </Screen>
  );
}

import { FeatureNotice } from '@/components/feature-notice';
import type { MediaItem } from '@/lib/media-library';
import { MEDIA_KIND_FEATURE } from '@/lib/modules';
import { useFeature } from '@/providers/access';

import { MediaDetailView, RecipeView } from './detail';

/**
 * A library item in full (the stavan, video, podcast and recipe screens): shown only to someone who may use the
 * area the item itself belongs to (stavans and podcasts are Listen, videos and recipes are Look). The screen's
 * address names a kind too, and its route gate follows that, but a link can open any item under any kind, so the
 * kind of the item that was loaded decides here. What is not available gets the notice for its area.
 */
export function MediaItemView({ item }: { item: MediaItem }) {
  const area = MEDIA_KIND_FEATURE[item.kind];
  const access = useFeature(area);
  if (!access.allowed) return <FeatureNotice feature={area} />;
  return item.kind === 'recipe' ? <RecipeView item={item} /> : <MediaDetailView item={item} />;
}

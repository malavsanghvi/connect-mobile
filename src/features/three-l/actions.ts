import { useState } from 'react';

import { addToPlaylist, removeFromPlaylist, toggleMediaLike } from '@/lib/api/media';
import { report } from '@/lib/errors';
import type { MediaItem } from '@/lib/media-library';
import { useDataVersion } from '@/providers/data-version';
import { useFeedback } from '@/providers/feedback';
import { useMediaState } from '@/providers/media-state';
import { useT } from '@/providers/settings';

export type ActionFailure = { message: string; retry: () => void };

export type MediaActions = {
  likeOf: (item: MediaItem) => { liked: boolean; count: number };
  inPlaylist: (item: MediaItem) => boolean;
  isBusy: (item: MediaItem) => boolean;
  toggleLike: (item: MediaItem) => void;
  togglePlaylist: (item: MediaItem) => void;
  /** The last like / playlist change that failed on this screen, with a retry. */
  failure: ActionFailure | null;
};

/**
 * Heart and "add to My playlist" for one screen. The change shows at once
 * (shared with every other 3L screen), is undone if the server refuses, and
 * the failure is shown in plain English with a retry.
 */
export function useMediaActions(): MediaActions {
  const t = useT();
  const { toast } = useFeedback();
  const { invalidate } = useDataVersion();
  const state = useMediaState();
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [failure, setFailure] = useState<ActionFailure | null>(null);

  const mark = (id: string, on: boolean) => setBusy((prev) => ({ ...prev, [id]: on }));

  const toggleLike = async (item: MediaItem) => {
    if (busy[item.id]) return;
    const before = state.likeOf(item).liked;
    state.setLiked(item.id, !before);
    mark(item.id, true);
    setFailure(null);
    try {
      state.setLiked(item.id, await toggleMediaLike(item.id));
    } catch (err) {
      state.setLiked(item.id, before);
      setFailure({ message: report(err, 'save your like').userMessage, retry: () => void toggleLike(item) });
    } finally {
      mark(item.id, false);
    }
  };

  const togglePlaylist = async (item: MediaItem) => {
    if (busy[item.id]) return;
    const before = state.inPlaylist(item);
    state.setInPlaylist(item.id, !before);
    mark(item.id, true);
    setFailure(null);
    try {
      if (before) await removeFromPlaylist(item.id);
      else await addToPlaylist(item.id);
      invalidate();
      toast(before ? t('media.removedToast', { title: item.title }) : t('media.addedToast', { title: item.title }), before ? 'info' : 'success');
    } catch (err) {
      state.setInPlaylist(item.id, before);
      setFailure({ message: report(err, before ? 'remove this from your playlist' : 'add this to your playlist').userMessage, retry: () => void togglePlaylist(item) });
    } finally {
      mark(item.id, false);
    }
  };

  return {
    likeOf: state.likeOf,
    inPlaylist: state.inPlaylist,
    isBusy: (item) => !!busy[item.id],
    toggleLike: (item) => void toggleLike(item),
    togglePlaylist: (item) => void togglePlaylist(item),
    failure,
  };
}

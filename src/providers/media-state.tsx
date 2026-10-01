import { createContext, useContext, useState, type ReactNode } from 'react';

import { likeShown, playlistShown, type MediaItem } from '@/lib/media-library';

type MediaStateValue = {
  /** Heart and count as the member last set them (any screen). */
  likeOf: (item: MediaItem) => { liked: boolean; count: number };
  inPlaylist: (item: MediaItem) => boolean;
  setLiked: (id: string, liked: boolean) => void;
  setInPlaylist: (id: string, on: boolean) => void;
};

const MediaStateContext = createContext<MediaStateValue | null>(null);

/**
 * The member's own likes and playlist changes in this session, shared by
 * every 3L screen: a heart tapped on a detail screen is already filled when
 * the list behind it shows again, before its next reload.
 */
export function MediaStateProvider({ children }: { children: ReactNode }) {
  const [likes, setLikes] = useState<Record<string, boolean>>({});
  const [playlist, setPlaylist] = useState<Record<string, boolean>>({});
  const value: MediaStateValue = {
    likeOf: (item) => likeShown(item, likes[item.id]),
    inPlaylist: (item) => playlistShown(item, playlist[item.id]),
    setLiked: (id, liked) => setLikes((prev) => ({ ...prev, [id]: liked })),
    setInPlaylist: (id, on) => setPlaylist((prev) => ({ ...prev, [id]: on })),
  };
  return <MediaStateContext.Provider value={value}>{children}</MediaStateContext.Provider>;
}

export function useMediaState(): MediaStateValue {
  const ctx = useContext(MediaStateContext);
  if (!ctx) throw new Error('useMediaState must be used inside MediaStateProvider');
  return ctx;
}

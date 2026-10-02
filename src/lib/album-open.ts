/**
 * Where a tap on an album card goes. Photos that live in an online album (a Google Photos link) and none in the app:
 * straight to that album, there is nothing of ours to show first. Otherwise the album's photos.
 */
import { secureUrl } from './media-library';

export type AlbumOpen = 'online' | 'photos';

type AlbumLike = { album: { external_url: string | null }; photos: number; videos: number };

/** The online album's address when the card should open it directly (https only), else null. */
export function onlineAlbumUrl(a: AlbumLike): string | null {
  if (a.photos + a.videos > 0) return null;
  return secureUrl(a.album.external_url);
}

export function albumOpenTarget(a: AlbumLike): AlbumOpen {
  return onlineAlbumUrl(a) ? 'online' : 'photos';
}

/** Whether tapping the album leads anywhere: it has a photo or video in the app, or an online album (https) to go to. Home's Photos rail shows only albums that do. */
export function albumLeadsSomewhere(a: AlbumLike): boolean {
  return a.photos + a.videos > 0 || onlineAlbumUrl(a) !== null;
}

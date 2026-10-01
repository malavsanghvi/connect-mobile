import { AppError, logError, report } from '../errors';
import { mostLikedQueue, parseMediaRows, pictureOf, searchQuery, type AudioRef, type MediaItem, type MediaKind, type MediaSort } from '../media-library';
import { isMissingRpcError } from '../modules';
import { supabase } from '../supabase';

import { BUCKETS, signedUrl, signedUrls } from './files';

/**
 * The 3L media library (connect-crm 0560): stavans, videos, podcasts and
 * recipes, the member's likes and My playlist. Everything goes through the
 * security-definer RPCs, which check the Content module, membership and that
 * an item is published; likes and the playlist are the member's own rows.
 */

const PLURAL: Record<MediaKind, string> = { stavan: 'stavans', video: 'videos', podcast: 'podcasts', recipe: 'recipes' };
const ONE: Record<MediaKind, string> = { stavan: 'a stavan', video: 'a video', podcast: 'a podcast', recipe: 'a recipe' };

type RpcResult = { data: unknown; error: unknown };

/** The RPC's rows, or a plain-English AppError (a database without 0560 says the library isn't set up yet). */
function unwrap(res: RpcResult, action: string): unknown {
  if (!res.error) return res.data;
  if (isMissingRpcError(res.error)) {
    const err = new AppError(
      "Stavans, videos, podcasts and recipes aren't set up for your community yet. Please try again later.",
      `${action}: the media RPCs are not deployed (connect-crm 0560) :: ${JSON.stringify(res.error)}`,
    );
    logError(action, err);
    throw err;
  }
  throw report(res.error, action);
}

/** The library, filtered by kind and (optionally) a search over title, singer or speaker, other spellings and tags. */
export async function listMedia(centerId: string, kinds: readonly MediaKind[], opts: { query?: string | null; sort?: MediaSort; limit?: number } = {}): Promise<MediaItem[]> {
  const query = searchQuery(opts.query);
  const what = kinds.length === 1 ? PLURAL[kinds[0]] : 'library';
  const res = await supabase.rpc('media_library', {
    p_center: centerId,
    p_kinds: [...kinds],
    p_sort: opts.sort ?? 'title',
    p_limit: opts.limit ?? 100,
    ...(query ? { p_query: query } : {}),
  });
  return parseMediaRows(unwrap(res, query ? `search the ${what}` : `load the ${what}`));
}

/*
 * Item-level calls carry the current community (`p_center`): an item shared
 * by the platform (center_id null) is liked and kept on a playlist per
 * community, and its likes and "in my playlist" are read for this one.
 */

/** One item for its detail screen. */
export async function getMediaItem(id: string, centerId: string): Promise<MediaItem> {
  const [item] = parseMediaRows(unwrap(await supabase.rpc('media_item', { p_item: id, p_center: centerId }), 'load this item'));
  if (!item) throw new AppError("We couldn't find this item. It may have been removed from the library.", `media_item ${id}: no row`);
  return item;
}

/** Like or unlike; returns the new state (the server's answer, not a guess). */
export async function toggleMediaLike(id: string, centerId: string): Promise<boolean> {
  return unwrap(await supabase.rpc('toggle_media_like', { p_item: id, p_center: centerId }), 'save your like') === true;
}

/** My playlist, in the member's order. */
export async function loadMyPlaylist(centerId: string): Promise<MediaItem[]> {
  const items = parseMediaRows(unwrap(await supabase.rpc('my_playlist', { p_center: centerId }), 'load your playlist'));
  return items.map((item, at) => ({ item, at })).sort((a, b) => (a.item.position ?? a.at) - (b.item.position ?? b.at) || a.at - b.at).map((x) => x.item);
}

/** Add to the end of My playlist (adding twice changes nothing). */
export async function addToPlaylist(id: string, centerId: string): Promise<void> {
  unwrap(await supabase.rpc('add_to_playlist', { p_item: id, p_center: centerId }), 'add this to your playlist');
}

export async function removeFromPlaylist(id: string, centerId: string): Promise<void> {
  unwrap(await supabase.rpc('remove_from_playlist', { p_item: id, p_center: centerId }), 'remove this from your playlist');
}

/** Save My playlist in this order (every item id, first to last). */
export async function reorderPlaylist(centerId: string, ids: string[]): Promise<void> {
  unwrap(await supabase.rpc('reorder_playlist', { p_center: centerId, p_items: ids }), 'save the new order of your playlist');
}

/** One random published item of a kind (`fullyJain` keeps only recipes marked fully Jain), or null when there is none. */
export async function randomMedia(centerId: string, kind: MediaKind, fullyJain = false): Promise<MediaItem | null> {
  const res = await supabase.rpc('random_media', { p_center: centerId, p_kind: kind, ...(fullyJain ? { p_fully_jain: true } : {}) });
  return parseMediaRows(unwrap(res, `pick ${ONE[kind]}`))[0] ?? null;
}

/** What "play" does when My playlist is empty: the most-liked stavans, then podcasts, then videos. */
export async function mostLikedMedia(centerId: string): Promise<MediaItem[]> {
  return mostLikedQueue(await listMedia(centerId, ['stavan', 'podcast', 'video'], { sort: 'liked', limit: 100 }));
}

/** A URL the player or browser can open: a one-hour signed URL for an uploaded file, or the https link itself. */
export async function mediaUrl(ref: AudioRef, action: string): Promise<string> {
  return 'path' in ref ? signedUrl(ref.path, BUCKETS.content, action) : ref.url;
}

/**
 * Pictures for a list or detail (recipe photos, video thumbnails), by item
 * id. Uploaded pictures are signed in one request; YouTube thumbnails need
 * none. A picture that can't be signed is logged and left out, so its row
 * shows the plain tile; a failure of the whole request is thrown.
 */
export async function mediaPictures(items: readonly MediaItem[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const paths: { id: string; path: string }[] = [];
  for (const item of items) {
    const pic = pictureOf(item);
    if (!pic) continue;
    if ('url' in pic) out[item.id] = pic.url;
    else paths.push({ id: item.id, path: pic.path });
  }
  if (paths.length === 0) return out;
  const signed = await signedUrls(
    paths.map((p) => p.path),
    BUCKETS.content,
    'load the pictures',
  );
  for (const p of paths) {
    const url = signed.get(p.path);
    if (url) out[p.id] = url;
  }
  return out;
}

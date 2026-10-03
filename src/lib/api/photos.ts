import { albumLeadsSomewhere } from '../album-open';
import type { Tables } from '../database.types';
import { AppError, check, logError, maybe, must } from '../errors';
import { supabase } from '../supabase';

/**
 * Event photo albums (app.photo_albums / app.photos, connect-crm 0007; RLS
 * 0010: members read albums with visibility public|members and approved
 * photos, uploaders also see their own pending ones, members insert pending).
 *
 * Files live in Supabase Storage bucket PHOTO_BUCKET under
 * `<center_id>/<album_id>/<file>`; `storage_path` may also be a full https
 * URL for photos hosted elsewhere. The bucket and its policies are not in the
 * schema yet (see README "Schema gaps").
 */
export const PHOTO_BUCKET = 'photos';

export type Album = Tables<'photo_albums'>;
export type Photo = Tables<'photos'>;

const VIDEO_EXT = /\.(mp4|m4v|mov|webm|3gp)(\?|$)/i;

export function isVideoPath(path: string): boolean {
  return VIDEO_EXT.test(path);
}

export type AlbumSummary = {
  album: Album;
  /** Event the album belongs to, when linked (for its date). */
  event: { name: string; starts_at: string | null; ends_at: string | null } | null;
  photos: number;
  videos: number;
  /** Up to three storage paths for the cover collage (images only). */
  coverPaths: string[];
};

/** Newest first: by when the album's event starts, else by when the album was made (the order of the Photos grid and of Home's Photos tile). */
function newestFirst<T extends { album: Album; event: { starts_at: string | null } | null }>(list: T[]): T[] {
  const when = (s: T) => s.event?.starts_at ?? s.album.created_at;
  return [...list].sort((a, b) => when(b).localeCompare(when(a)));
}

/** Albums for the Photos grid, newest event first, with counts and cover paths. */
export async function listAlbums(centerId: string): Promise<AlbumSummary[]> {
  const albums = must(await supabase.from('photo_albums').select('*').eq('center_id', centerId).in('visibility', ['public', 'members']).order('created_at', { ascending: false }).limit(200), 'load photo albums');
  if (albums.length === 0) return [];
  const ids = albums.map((a) => a.id);
  const eventIds = [...new Set(albums.map((a) => a.event_id).filter((x): x is string => !!x))];
  const [photos, events] = await Promise.all([
    supabase
      .from('photos')
      .select('album_id, storage_path, created_at')
      .in('album_id', ids)
      .eq('status', 'approved')
      .order('created_at', { ascending: true })
      .limit(10000)
      .then((r) => must(r, 'load photo albums')),
    eventIds.length ? supabase.from('events').select('id, name, starts_at, ends_at').in('id', eventIds).then((r) => must(r, 'load the events for photo albums')) : Promise.resolve([]),
  ]);
  const byEvent = new Map(events.map((e) => [e.id, e]));
  const out = albums.map((album) => {
    const mine = photos.filter((p) => p.album_id === album.id);
    const videos = mine.filter((p) => isVideoPath(p.storage_path)).length;
    const ev = album.event_id ? (byEvent.get(album.event_id) ?? null) : null;
    return {
      album,
      event: ev ? { name: ev.name, starts_at: ev.starts_at, ends_at: ev.ends_at } : null,
      photos: mine.length - videos,
      videos,
      coverPaths: mine.filter((p) => !isVideoPath(p.storage_path)).slice(0, 3).map((p) => p.storage_path),
    };
  });
  return newestFirst(out);
}

/** What Home's Photos tile needs of an album: not the counts and the three-picture collage the Photos grid has. */
export type AlbumPreview = {
  album: Album;
  event: AlbumSummary['event'];
  /** The album has an approved photo or video here. Without one, its online album (a Google Photos link) is where its photos are (album-open). */
  hasMedia: boolean;
  /** Storage path of the album's first approved picture; null when it has none. */
  coverPath: string | null;
};

/** How many of an album's first photos are read to find its cover and whether it has any. */
const PREVIEW_PHOTOS = 8;

/** Rounds of reading photos at most: when the newest albums have nothing to open, the next ones are looked at (so at most this many times `limit` albums). */
const PREVIEW_ROUNDS = 3;

/**
 * The newest `limit` albums that lead somewhere, for Home's Photos tile, in the
 * Photos grid's order. Unlike listAlbums it does not read every approved photo
 * of every album (up to 10,000 rows): once the albums are in order, one small
 * request per album reads its first photos, in parallel, so a Home that
 * reloads after every write stays light. An album with nothing to open (no
 * photo here and no online album: staff often make one for an event before its
 * photos arrive, and it sorts first while the event is still to come) is passed
 * over and the next newest takes its place in a further round, so a few empty
 * albums at the top never leave the tile without an album, or hide it altogether.
 */
export async function listAlbumPreviews(centerId: string, limit: number): Promise<AlbumPreview[]> {
  const want = Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : 0;
  const albums = must(await supabase.from('photo_albums').select('*').eq('center_id', centerId).in('visibility', ['public', 'members']).order('created_at', { ascending: false }).limit(200), 'load photo albums');
  if (albums.length === 0 || want === 0) return [];
  const eventIds = [...new Set(albums.map((a) => a.event_id).filter((x): x is string => !!x))];
  const events = eventIds.length ? must(await supabase.from('events').select('id, name, starts_at, ends_at').in('id', eventIds), 'load the events for photo albums') : [];
  const byEvent = new Map(events.map((e) => [e.id, e]));
  const newest = newestFirst(
    albums.map((album) => {
      const ev = album.event_id ? (byEvent.get(album.event_id) ?? null) : null;
      return { album, event: ev ? { name: ev.name, starts_at: ev.starts_at, ends_at: ev.ends_at } : null };
    }),
  );
  const previews: AlbumPreview[] = [];
  let next = 0;
  for (let round = 0; round < PREVIEW_ROUNDS && next < newest.length && previews.length < want; round += 1) {
    // Only as many albums as are still needed: usually the first round fills the list and that is all.
    const batch = newest.slice(next, next + (want - previews.length));
    next += batch.length;
    const firstPhotos = await Promise.all(
      batch.map(async ({ album }) =>
        must(await supabase.from('photos').select('storage_path').eq('album_id', album.id).eq('status', 'approved').order('created_at', { ascending: true }).limit(PREVIEW_PHOTOS), 'load photo albums'),
      ),
    );
    batch.forEach(({ album, event }, i) => {
      const hasMedia = firstPhotos[i].length > 0;
      if (!albumLeadsSomewhere({ album, photos: hasMedia ? 1 : 0, videos: 0 })) return;
      previews.push({ album, event, hasMedia, coverPath: firstPhotos[i].find((p) => !isVideoPath(p.storage_path))?.storage_path ?? null });
    });
  }
  return previews;
}

export type AlbumDetail = AlbumSummary & { items: Photo[] };

/** One album with its approved photos plus the caller's own photos still in review. */
export async function getAlbum(albumId: string, userId: string | null): Promise<AlbumDetail> {
  const album = must(await supabase.from('photo_albums').select('*').eq('id', albumId).single(), 'load this album');
  const [all, ev] = await Promise.all([
    supabase
      .from('photos')
      .select('*')
      .eq('album_id', albumId)
      .in('status', ['approved', 'pending'])
      .order('created_at', { ascending: true })
      .limit(2000)
      .then((r) => must(r, 'load the photos in this album')),
    album.event_id ? supabase.from('events').select('name, starts_at, ends_at').eq('id', album.event_id).maybeSingle().then((r) => maybe(r, 'load the event of this album')) : Promise.resolve(null),
  ]);
  const items = all.filter((p) => p.status === 'approved' || (userId && p.uploaded_by === userId));
  const approved = items.filter((p) => p.status === 'approved');
  const videos = approved.filter((p) => isVideoPath(p.storage_path)).length;
  return {
    album,
    event: ev ?? null,
    photos: approved.length - videos,
    videos,
    coverPaths: approved.filter((p) => !isVideoPath(p.storage_path)).slice(0, 3).map((p) => p.storage_path),
    items,
  };
}

/** Viewable URLs for storage paths (signed for an hour); https paths pass through. */
export async function photoUrls(paths: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const stored = [...new Set(paths.filter((p) => !/^https?:\/\//i.test(p)))];
  for (const p of paths) if (/^https?:\/\//i.test(p)) out[p] = p;
  if (stored.length === 0) return out;
  const { data, error } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrls(stored, 3600);
  if (error) throw new AppError("Photos couldn't be loaded right now. Please try again in a moment.", `createSignedUrls: ${error.message}`);
  for (const row of data ?? []) {
    if (row.path && row.signedUrl) out[row.path] = row.signedUrl;
    else if (row.error) logError(`signing photo ${row.path ?? '?'} (shown as a placeholder)`, row.error);
  }
  return out;
}

function extFor(name: string | null | undefined, mime: string | null | undefined): string {
  const fromName = /\.([a-z0-9]{2,5})$/i.exec(name ?? '')?.[1];
  if (fromName) return fromName.toLowerCase();
  if (mime === 'image/png') return 'png';
  if (mime === 'image/heic') return 'heic';
  if (mime === 'image/webp') return 'webp';
  return 'jpg';
}

/**
 * "Add yours": upload a picked image and record it as pending (the event
 * team approves it before anyone else sees it).
 */
export async function uploadPhoto(args: { centerId: string; albumId: string; userId: string; uri: string; fileName?: string | null; mimeType?: string | null; containsChildren: boolean }): Promise<void> {
  let body: ArrayBuffer;
  try {
    body = await (await fetch(args.uri)).arrayBuffer();
  } catch (err) {
    throw new AppError("We couldn't read that photo from your device. Please pick it again.", err instanceof Error ? err.message : String(err));
  }
  const ext = extFor(args.fileName, args.mimeType);
  const path = `${args.centerId}/${args.albumId}/${args.userId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from(PHOTO_BUCKET).upload(path, body, { contentType: args.mimeType ?? `image/${ext === 'jpg' ? 'jpeg' : ext}`, upsert: false });
  if (error) {
    // The photo storage bucket and its policies are the office's to set up (connect-crm owner decision).
    if (isMissingBucket(error)) throw new AppError("Member photo uploads aren't set up for your community yet, so your photo wasn't sent. Nothing was saved.", `storage upload to ${PHOTO_BUCKET}: ${error.message}`);
    throw new AppError("Your photo couldn't be uploaded. Please check your connection and try again.", `storage upload: ${error.message}`);
  }
  const res = await supabase.from('photos').insert({ center_id: args.centerId, album_id: args.albumId, storage_path: path, uploaded_by: args.userId, contains_children: args.containsChildren, status: 'pending' });
  if (res.error) {
    const { error: rmError } = await supabase.storage.from(PHOTO_BUCKET).remove([path]);
    if (rmError) logError(`removing an orphaned upload ${path} after the photo row failed (office cleanup may be needed)`, rmError);
  }
  check(res, 'add your photo to the album');
}

/** Storage answers "Bucket not found" (404) when the bucket does not exist yet. */
export function isMissingBucket(error: { message?: string; statusCode?: string | number } | null | undefined): boolean {
  if (!error) return false;
  return /bucket not found/i.test(error.message ?? '') || String(error.statusCode ?? '') === '404';
}

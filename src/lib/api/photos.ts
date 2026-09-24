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
  const when = (s: AlbumSummary) => s.event?.starts_at ?? s.album.created_at;
  return out.sort((a, b) => when(b).localeCompare(when(a)));
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

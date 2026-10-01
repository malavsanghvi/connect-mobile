/**
 * 3L media library (connect-crm 0560): stavans, videos, podcasts and recipes
 * are `app.content_items` rows read through the media RPCs
 * (`media_library`, `media_item`, `my_playlist`, `random_media`), which all
 * return the same MediaRow shape. Pure (no React Native, no Supabase), so the
 * parsing and the "how does this play" rules are unit-tested in
 * src/lib/__tests__/media-library.test.ts.
 */

export const MEDIA_KINDS = ['stavan', 'video', 'podcast', 'recipe'] as const;
export type MediaKind = (typeof MEDIA_KINDS)[number];

/** Kinds that go on My playlist (recipes are liked, never played). */
export const PLAYLIST_KINDS: readonly MediaKind[] = ['stavan', 'video', 'podcast'];

/** `p_sort` of app.media_library: A–Z, most liked first, newest first. */
export const MEDIA_SORTS = ['title', 'liked', 'recent'] as const;
export type MediaSort = (typeof MEDIA_SORTS)[number];

export function isMediaKind(v: unknown): v is MediaKind {
  return typeof v === 'string' && (MEDIA_KINDS as readonly string[]).includes(v);
}

export function canPlaylist(kind: string): boolean {
  return (PLAYLIST_KINDS as readonly string[]).includes(kind);
}

export type MediaSource = 'upload' | 'youtube' | 'link';

/** `content_items.metadata` conventions for media (0560 column comment). Every field is optional. */
export type MediaMeta = {
  source: MediaSource | null;
  durationSeconds: number | null;
  /** Stavan singer, podcast speaker or video presenter. */
  artist: string | null;
  /** Other spellings ("Navkaar" for "Navkar"). */
  aliases: string[];
  tags: string[];
  /** Content-bucket key of a picture for the item. */
  thumbnailPath: string | null;
  youtubeId: string | null;
  /** Podcasts. */
  series: string | null;
  episode: string | null;
  /** Recipes: no root vegetables, onion, garlic… */
  fullyJain: boolean | null;
  ingredients: string[];
  servings: number | null;
  prepMinutes: number | null;
  cookMinutes: number | null;
  photoPath: string | null;
};

export type MediaItem = {
  id: string;
  kind: MediaKind;
  title: string;
  /** Stavan lyrics, recipe method, podcast or video notes (Markdown). */
  bodyMd: string | null;
  language: string | null;
  /** Content-bucket key of an uploaded file. */
  mediaPath: string | null;
  /** YouTube or web link. */
  mediaUrl: string | null;
  meta: MediaMeta;
  publishedAt: string | null;
  likeCount: number;
  likedByMe: boolean;
  inMyPlaylist: boolean;
  /** Place in My playlist (my_playlist rows only). */
  position: number | null;
};

type Obj = Record<string, unknown>;

function obj(v: unknown): Obj {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : {};
}

function text(v: unknown): string | null {
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function count(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' && /^\s*\d+(\.\d+)?\s*$/.test(v) ? Number(v) : NaN;
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
}

function flag(v: unknown): boolean | null {
  if (v === true || v === 'true') return true;
  if (v === false || v === 'false') return false;
  return null;
}

/** A text[] in jsonb, or a comma / new-line separated string from an older editor. */
function list(v: unknown, separator: RegExp = /[,\n]/): string[] {
  const raw = Array.isArray(v) ? v : typeof v === 'string' ? v.split(separator) : [];
  return raw.map((x) => text(x)).filter((x): x is string => x !== null);
}

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;

/** Read `metadata` defensively (it is free-form jsonb). */
export function parseMediaMeta(raw: unknown): MediaMeta {
  const m = obj(raw);
  const source = m.source === 'upload' || m.source === 'youtube' || m.source === 'link' ? m.source : null;
  const yt = text(m.youtube_id);
  return {
    source,
    durationSeconds: count(m.duration_seconds),
    artist: text(m.artist),
    aliases: list(m.aliases),
    tags: list(m.tags),
    thumbnailPath: text(m.thumbnail_path),
    youtubeId: yt && YOUTUBE_ID.test(yt) ? yt : null,
    series: text(m.series),
    episode: text(m.episode),
    fullyJain: flag(m.fully_jain),
    ingredients: list(m.ingredients, /\n/),
    servings: count(m.servings),
    prepMinutes: count(m.prep_minutes),
    cookMinutes: count(m.cook_minutes),
    photoPath: text(m.photo_path),
  };
}

/** One MediaRow → MediaItem, or null when it is not a media row (no id, unknown kind). */
export function parseMediaRow(raw: unknown): MediaItem | null {
  const r = obj(raw);
  const id = text(r.id);
  if (!id || !isMediaKind(r.kind)) return null;
  return {
    id,
    kind: r.kind,
    title: text(r.title) ?? '',
    bodyMd: typeof r.body_md === 'string' && r.body_md.trim() ? r.body_md : null,
    language: text(r.language),
    mediaPath: text(r.media_path),
    mediaUrl: text(r.media_url),
    meta: parseMediaMeta(r.metadata),
    publishedAt: text(r.published_at),
    likeCount: count(r.like_count) ?? 0,
    likedByMe: r.liked_by_me === true,
    inMyPlaylist: r.in_my_playlist === true,
    position: count(r.position),
  };
}

/** setof MediaRow (or a single row) → items; anything that is not a media row is dropped. */
export function parseMediaRows(raw: unknown): MediaItem[] {
  const rows = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return rows.map(parseMediaRow).filter((x): x is MediaItem => x !== null);
}

// ---------------------------------------------------------------------------
// How an item plays
// ---------------------------------------------------------------------------

/** Only secure links are ever opened or played (as for live darshan; the database asks for https since 0560). */
export function secureUrl(url: string | null | undefined): string | null {
  const s = (url ?? '').trim();
  return /^https:\/\/\S+$/i.test(s) ? s : null;
}

/** The 11-character video id of a YouTube link (watch, youtu.be, embed, shorts, live), or null. */
export function youtubeIdFromUrl(url: string | null | undefined): string | null {
  const s = (url ?? '').trim();
  const m =
    /^https?:\/\/(?:www\.|m\.|music\.)?(?:youtube\.com|youtube-nocookie\.com)\/(?:watch\?(?:[^#]*&)?v=|embed\/|shorts\/|live\/|v\/)([A-Za-z0-9_-]{11})(?![A-Za-z0-9_-])/i.exec(s) ??
    /^https?:\/\/youtu\.be\/([A-Za-z0-9_-]{11})(?![A-Za-z0-9_-])/i.exec(s);
  return m ? m[1] : null;
}

type Playable = Pick<MediaItem, 'kind' | 'mediaPath' | 'mediaUrl' | 'meta'>;

export function youtubeIdOf(item: Playable): string | null {
  return item.meta.youtubeId ?? youtubeIdFromUrl(item.mediaUrl);
}

export function youtubeWatchUrl(id: string): string {
  return `https://www.youtube.com/watch?v=${id}`;
}

/** Privacy-enhanced embed (no cookies until the member presses play). */
export function youtubeEmbedUrl(id: string): string {
  return `https://www.youtube-nocookie.com/embed/${id}?rel=0&playsinline=1`;
}

export function youtubeThumbnailUrl(id: string): string {
  return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
}

const AUDIO_FILE = /\.(mp3|m4a|m4b|aac|wav|ogg|oga|opus|flac|weba|webm|mp4)(?:[?#]|$)/i;

/** Where the audio player gets the sound: a content-bucket key (signed first) or a direct https link. */
export type AudioRef = { path: string } | { url: string };

/**
 * Audio the in-app player can play: an uploaded stavan / podcast, or a direct
 * https link to an audio file. YouTube and web pages are watched or opened
 * instead; videos are never auto-played.
 */
export function audioSourceOf(item: Playable): AudioRef | null {
  if (item.kind !== 'stavan' && item.kind !== 'podcast') return null;
  if (item.meta.source === 'youtube' || youtubeIdOf(item)) return null;
  if (item.mediaPath) return { path: item.mediaPath };
  const url = secureUrl(item.mediaUrl);
  if (!url) return null;
  if (item.meta.source === 'link' && !AUDIO_FILE.test(url)) return null;
  return { url };
}

/** How a video (or a stavan / podcast that lives on YouTube or a web page) is watched. */
export type WatchRef = { kind: 'youtube'; id: string } | { kind: 'file'; ref: AudioRef } | { kind: 'link'; url: string };

export function watchSourceOf(item: Playable): WatchRef | null {
  if (item.kind === 'recipe') return null;
  const yt = youtubeIdOf(item);
  if (yt) return { kind: 'youtube', id: yt };
  if (item.kind === 'video') {
    if (item.mediaPath) return { kind: 'file', ref: { path: item.mediaPath } };
    const url = secureUrl(item.mediaUrl);
    if (!url) return null;
    return item.meta.source === 'link' ? { kind: 'link', url } : { kind: 'file', ref: { url } };
  }
  if (audioSourceOf(item)) return null;
  const url = secureUrl(item.mediaUrl);
  return url ? { kind: 'link', url } : null;
}

/** What the main button of an item does: play it here, watch it, open its web page, or nothing yet. */
export type Playback = 'audio' | 'watch' | 'link' | 'none';

export function playbackOf(item: Playable): Playback {
  if (audioSourceOf(item)) return 'audio';
  const w = watchSourceOf(item);
  if (!w) return 'none';
  return w.kind === 'link' ? 'link' : 'watch';
}

/** Picture for a row or detail: the uploaded photo / thumbnail (content bucket), else YouTube's own. */
export function pictureOf(item: Playable): { path: string } | { url: string } | null {
  const path = item.meta.photoPath ?? item.meta.thumbnailPath;
  if (path) return { path };
  const yt = youtubeIdOf(item);
  return yt ? { url: youtubeThumbnailUrl(yt) } : null;
}

/** Whole minutes for a duration label ("6 min"); seconds under a minute stay seconds. */
export function durationParts(seconds: number | null | undefined): { hours: number; minutes: number; seconds: number } | null {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return null;
  const s = Math.round(seconds);
  if (s < 60) return { hours: 0, minutes: 0, seconds: s };
  const totalMinutes = Math.round(s / 60);
  return { hours: Math.floor(totalMinutes / 60), minutes: totalMinutes % 60, seconds: 0 };
}

/** "4:05" / "1:02:09" for the player clock. */
export function clockLabel(seconds: number | null | undefined): string {
  const s = Math.max(0, Math.floor(Number.isFinite(seconds ?? NaN) ? (seconds as number) : 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

// ---------------------------------------------------------------------------
// Likes and My playlist as the member sees them
// ---------------------------------------------------------------------------

/**
 * The heart and count to show. `override` is the member's own latest tap in
 * this session (kept app-wide so every screen agrees); once a reload carries
 * the same state the server count is used as is.
 */
export function likeShown(item: Pick<MediaItem, 'likedByMe' | 'likeCount'>, override: boolean | undefined): { liked: boolean; count: number } {
  const liked = override ?? item.likedByMe;
  const delta = liked === item.likedByMe ? 0 : liked ? 1 : -1;
  return { liked, count: Math.max(0, item.likeCount + delta) };
}

export function playlistShown(item: Pick<MediaItem, 'inMyPlaylist'>, override: boolean | undefined): boolean {
  return override ?? item.inMyPlaylist;
}

/**
 * When My playlist is empty the shortcut plays the community's most-liked
 * stavans, then podcasts, then videos (shown, never auto-played). `items`
 * arrive most-liked first (media_library p_sort 'liked'); the order within a
 * kind is kept.
 */
export function mostLikedQueue(items: MediaItem[], limit = 30): MediaItem[] {
  const rank: Record<string, number> = { stavan: 0, podcast: 1, video: 2 };
  return items
    .filter((i) => i.kind in rank)
    .map((item, at) => ({ item, at }))
    .sort((a, b) => rank[a.item.kind] - rank[b.item.kind] || a.at - b.at)
    .slice(0, limit)
    .map((x) => x.item);
}

/** Search text for p_query: trimmed, single spaces, at most 100 characters; null when empty. */
export function searchQuery(q: string | null | undefined): string | null {
  const s = (q ?? '').trim().replace(/\s+/g, ' ').slice(0, 100);
  return s ? s : null;
}

/** Recipes filter chip ("Fully Jain only"). */
export function onlyFullyJain<T extends Pick<MediaItem, 'meta'>>(items: T[]): T[] {
  return items.filter((i) => i.meta.fullyJain === true);
}

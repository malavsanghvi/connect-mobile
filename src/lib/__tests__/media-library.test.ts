import { describe, expect, it } from '@jest/globals';

import {
  audioSourceOf,
  canPlaylist,
  clockLabel,
  durationParts,
  isMediaKind,
  likeShown,
  mostLikedQueue,
  onlyFullyJain,
  parseMediaMeta,
  parseMediaRow,
  parseMediaRows,
  pictureOf,
  playbackOf,
  playlistShown,
  searchQuery,
  secureUrl,
  watchSourceOf,
  youtubeEmbedUrl,
  youtubeIdFromUrl,
  type MediaItem,
} from '../media-library';

const YT = 'dQw4w9WgXcQ';

const row = (over: Record<string, unknown> = {}) => ({
  id: 'i1',
  kind: 'stavan',
  title: 'Navkar Mantra',
  body_md: 'Namo Arihantanam…',
  language: 'gu',
  media_path: null,
  media_url: null,
  metadata: {},
  published_at: '2026-09-01T10:00:00Z',
  like_count: 3,
  liked_by_me: false,
  in_my_playlist: false,
  ...over,
});

const item = (over: Record<string, unknown> = {}): MediaItem => {
  const parsed = parseMediaRow(row(over));
  if (!parsed) throw new Error('bad fixture');
  return parsed;
};

describe('parsing MediaRow', () => {
  it('reads every field', () => {
    const it1 = item({ media_path: 'c1/media/stavan/x-navkar.mp3', metadata: { source: 'upload', artist: 'Ravi', aliases: ['Navkaar'], duration_seconds: 245 }, position: 2 });
    expect(it1).toMatchObject({
      id: 'i1',
      kind: 'stavan',
      title: 'Navkar Mantra',
      bodyMd: 'Namo Arihantanam…',
      language: 'gu',
      mediaPath: 'c1/media/stavan/x-navkar.mp3',
      mediaUrl: null,
      likeCount: 3,
      likedByMe: false,
      inMyPlaylist: false,
      position: 2,
    });
    expect(it1.meta).toMatchObject({ source: 'upload', artist: 'Ravi', aliases: ['Navkaar'], durationSeconds: 245 });
  });
  it('drops rows that are not media', () => {
    expect(parseMediaRow(row({ kind: 'notice' }))).toBeNull();
    expect(parseMediaRow(row({ id: null }))).toBeNull();
    expect(parseMediaRow(null)).toBeNull();
    expect(parseMediaRows([row(), row({ id: 'i2', kind: 'faq' }), 'junk', row({ id: 'i3', kind: 'recipe' })]).map((i) => i.id)).toEqual(['i1', 'i3']);
    expect(parseMediaRows(row()).map((i) => i.id)).toEqual(['i1']);
    expect(parseMediaRows(null)).toEqual([]);
  });
  it('is forgiving about counts and flags', () => {
    expect(item({ like_count: null }).likeCount).toBe(0);
    expect(item({ like_count: '7' }).likeCount).toBe(7);
    expect(item({ liked_by_me: 'true' }).likedByMe).toBe(false);
    expect(item({ body_md: '   ' }).bodyMd).toBeNull();
    expect(item({ title: null }).title).toBe('');
  });
  it('reads metadata defensively', () => {
    const m = parseMediaMeta({
      source: 'cassette',
      duration_seconds: -4,
      aliases: 'Navkaar, Namokar',
      tags: ['morning', '', 3],
      youtube_id: 'not-an-id',
      episode: 12,
      fully_jain: 'true',
      ingredients: 'Moong dal\nGhee\n\n',
      servings: '4',
      prep_minutes: 10.4,
      cook_minutes: 'soon',
    });
    expect(m.source).toBeNull();
    expect(m.durationSeconds).toBeNull();
    expect(m.aliases).toEqual(['Navkaar', 'Namokar']);
    expect(m.tags).toEqual(['morning', '3']);
    expect(m.youtubeId).toBeNull();
    expect(m.episode).toBe('12');
    expect(m.fullyJain).toBe(true);
    expect(m.ingredients).toEqual(['Moong dal', 'Ghee']);
    expect(m.servings).toBe(4);
    expect(m.prepMinutes).toBe(10);
    expect(m.cookMinutes).toBeNull();
    expect(parseMediaMeta(null).aliases).toEqual([]);
    expect(parseMediaMeta({ ingredients: ['Rice, basmati', 'Salt'] }).ingredients).toEqual(['Rice, basmati', 'Salt']);
  });
  it('knows the kinds and which go on a playlist', () => {
    expect(isMediaKind('podcast')).toBe(true);
    expect(isMediaKind('audio_lesson')).toBe(false);
    expect(canPlaylist('stavan')).toBe(true);
    expect(canPlaylist('video')).toBe(true);
    expect(canPlaylist('recipe')).toBe(false);
  });
});

describe('links', () => {
  it('only accepts https', () => {
    expect(secureUrl(' https://example.org/a.mp3 ')).toBe('https://example.org/a.mp3');
    expect(secureUrl('http://example.org/a.mp3')).toBeNull();
    expect(secureUrl('javascript:alert(1)')).toBeNull();
    expect(secureUrl('https://exa mple.org')).toBeNull();
    expect(secureUrl(null)).toBeNull();
  });
  it('finds the YouTube id in the usual link shapes', () => {
    for (const url of [
      `https://www.youtube.com/watch?v=${YT}`,
      `https://youtube.com/watch?feature=share&v=${YT}`,
      `https://m.youtube.com/watch?v=${YT}&t=30`,
      `https://youtu.be/${YT}?si=abc`,
      `https://www.youtube.com/embed/${YT}`,
      `https://www.youtube.com/shorts/${YT}`,
      `https://www.youtube.com/live/${YT}`,
      `https://www.youtube-nocookie.com/embed/${YT}`,
    ]) {
      expect(youtubeIdFromUrl(url)).toBe(YT);
    }
    expect(youtubeIdFromUrl('https://www.youtube.com/channel/UCabc')).toBeNull();
    expect(youtubeIdFromUrl(`https://example.org/watch?v=${YT}`)).toBeNull();
    expect(youtubeIdFromUrl(`https://youtu.be/${YT}extra`)).toBeNull();
    expect(youtubeEmbedUrl(YT)).toBe(`https://www.youtube-nocookie.com/embed/${YT}?rel=0&playsinline=1`);
  });
});

describe('how an item plays', () => {
  it('plays uploaded stavans and podcasts in the app', () => {
    const s = item({ media_path: 'c1/media/stavan/a.mp3', metadata: { source: 'upload' } });
    expect(audioSourceOf(s)).toEqual({ path: 'c1/media/stavan/a.mp3' });
    expect(playbackOf(s)).toBe('audio');
    expect(watchSourceOf(s)).toBeNull();
  });
  it('plays a direct https audio link, but opens a web page link', () => {
    expect(audioSourceOf(item({ kind: 'podcast', media_url: 'https://cdn.example.org/ep1.m4a?sig=1', metadata: { source: 'link' } }))).toEqual({ url: 'https://cdn.example.org/ep1.m4a?sig=1' });
    const page = item({ kind: 'podcast', media_url: 'https://podcasts.example.org/show/ep1', metadata: { source: 'link' } });
    expect(audioSourceOf(page)).toBeNull();
    expect(watchSourceOf(page)).toEqual({ kind: 'link', url: 'https://podcasts.example.org/show/ep1' });
    expect(playbackOf(page)).toBe('link');
    expect(audioSourceOf(item({ media_url: 'http://insecure.example.org/a.mp3' }))).toBeNull();
  });
  it('watches stavans that live on YouTube', () => {
    const s = item({ media_url: `https://youtu.be/${YT}`, metadata: { source: 'youtube' } });
    expect(audioSourceOf(s)).toBeNull();
    expect(watchSourceOf(s)).toEqual({ kind: 'youtube', id: YT });
    expect(playbackOf(s)).toBe('watch');
    expect(audioSourceOf(item({ metadata: { youtube_id: YT } }))).toBeNull();
  });
  it('never auto-plays a video: it is watched', () => {
    expect(audioSourceOf(item({ kind: 'video', media_path: 'c1/media/video/a.mp4' }))).toBeNull();
    expect(watchSourceOf(item({ kind: 'video', media_path: 'c1/media/video/a.mp4' }))).toEqual({ kind: 'file', ref: { path: 'c1/media/video/a.mp4' } });
    expect(watchSourceOf(item({ kind: 'video', media_url: `https://www.youtube.com/watch?v=${YT}` }))).toEqual({ kind: 'youtube', id: YT });
    expect(watchSourceOf(item({ kind: 'video', media_url: 'https://cdn.example.org/a.mp4' }))).toEqual({ kind: 'file', ref: { url: 'https://cdn.example.org/a.mp4' } });
    expect(watchSourceOf(item({ kind: 'video', media_url: 'https://vimeo.com/123', metadata: { source: 'link' } }))).toEqual({ kind: 'link', url: 'https://vimeo.com/123' });
    expect(playbackOf(item({ kind: 'video', media_path: 'c1/media/video/a.mp4' }))).toBe('watch');
  });
  it('shows "coming soon" when nothing has been added', () => {
    expect(playbackOf(item())).toBe('none');
    expect(playbackOf(item({ kind: 'video' }))).toBe('none');
    expect(playbackOf(item({ kind: 'recipe', media_url: `https://youtu.be/${YT}` }))).toBe('none');
  });
  it('picks a picture: uploaded photo, thumbnail, then YouTube', () => {
    expect(pictureOf(item({ kind: 'recipe', metadata: { photo_path: 'c1/media/recipe/p.jpg', thumbnail_path: 'c1/t.jpg' } }))).toEqual({ path: 'c1/media/recipe/p.jpg' });
    expect(pictureOf(item({ kind: 'video', metadata: { thumbnail_path: 'c1/t.jpg' } }))).toEqual({ path: 'c1/t.jpg' });
    expect(pictureOf(item({ kind: 'video', media_url: `https://youtu.be/${YT}` }))).toEqual({ url: `https://i.ytimg.com/vi/${YT}/hqdefault.jpg` });
    expect(pictureOf(item())).toBeNull();
  });
});

describe('labels', () => {
  it('durationParts', () => {
    expect(durationParts(null)).toBeNull();
    expect(durationParts(0)).toBeNull();
    expect(durationParts(42)).toEqual({ hours: 0, minutes: 0, seconds: 42 });
    expect(durationParts(245)).toEqual({ hours: 0, minutes: 4, seconds: 0 });
    expect(durationParts(3725)).toEqual({ hours: 1, minutes: 2, seconds: 0 });
  });
  it('clockLabel', () => {
    expect(clockLabel(0)).toBe('0:00');
    expect(clockLabel(65.9)).toBe('1:05');
    expect(clockLabel(3729)).toBe('1:02:09');
    expect(clockLabel(NaN)).toBe('0:00');
    expect(clockLabel(-5)).toBe('0:00');
    expect(clockLabel(undefined)).toBe('0:00');
  });
  it('searchQuery', () => {
    expect(searchQuery('  navkar   mantra ')).toBe('navkar mantra');
    expect(searchQuery('   ')).toBeNull();
    expect(searchQuery(undefined)).toBeNull();
    expect(searchQuery('x'.repeat(150))).toHaveLength(100);
  });
});

describe('likes and My playlist', () => {
  it("shows the member's own latest tap with an adjusted count", () => {
    const i = item({ like_count: 3, liked_by_me: false });
    expect(likeShown(i, undefined)).toEqual({ liked: false, count: 3 });
    expect(likeShown(i, true)).toEqual({ liked: true, count: 4 });
    expect(likeShown(i, false)).toEqual({ liked: false, count: 3 });
    const liked = item({ like_count: 1, liked_by_me: true });
    expect(likeShown(liked, false)).toEqual({ liked: false, count: 0 });
    expect(likeShown(item({ like_count: 0, liked_by_me: true }), false)).toEqual({ liked: false, count: 0 });
  });
  it('playlistShown', () => {
    expect(playlistShown(item({ in_my_playlist: true }), undefined)).toBe(true);
    expect(playlistShown(item({ in_my_playlist: true }), false)).toBe(false);
  });
  it('most-liked fallback: stavans, then podcasts, then videos; recipes never', () => {
    const list = [
      item({ id: 'v1', kind: 'video' }),
      item({ id: 'p1', kind: 'podcast' }),
      item({ id: 'r1', kind: 'recipe' }),
      item({ id: 's1', kind: 'stavan' }),
      item({ id: 'p2', kind: 'podcast' }),
      item({ id: 's2', kind: 'stavan' }),
    ];
    expect(mostLikedQueue(list).map((i) => i.id)).toEqual(['s1', 's2', 'p1', 'p2', 'v1']);
    expect(mostLikedQueue(list, 3).map((i) => i.id)).toEqual(['s1', 's2', 'p1']);
    expect(mostLikedQueue([])).toEqual([]);
  });
  it('fully Jain filter keeps only recipes marked fully Jain', () => {
    const list = [item({ id: 'a', kind: 'recipe', metadata: { fully_jain: true } }), item({ id: 'b', kind: 'recipe', metadata: { fully_jain: false } }), item({ id: 'c', kind: 'recipe' })];
    expect(onlyFullyJain(list).map((i) => i.id)).toEqual(['a']);
  });
});

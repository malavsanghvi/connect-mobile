import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { listAlbumPreviews } from '../api/photos';

type Row = Record<string, unknown>;

// What the fake database holds, and the album of every "first photos" request made (one request per album looked at).
const mockData: { photo_albums: Row[]; events: Row[]; photos: Row[] } = { photo_albums: [], events: [], photos: [] };
const mockPhotoReads: string[] = [];

jest.mock('../supabase', () => ({
  supabase: {
    from: (table: 'photo_albums' | 'events' | 'photos') => {
      const filters: Record<string, unknown> = {};
      const query = {
        select: () => query,
        in: () => query,
        order: () => query,
        eq: (column: string, value: unknown) => {
          filters[column] = value;
          return query;
        },
        limit: (n: number) => {
          filters.limit = n;
          return query;
        },
        then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => {
          let data = mockData[table];
          if (table === 'photos') {
            mockPhotoReads.push(String(filters.album_id));
            data = data.filter((p) => p.album_id === filters.album_id && p.status === filters.status).slice(0, Number(filters.limit));
          }
          return Promise.resolve({ data, error: null }).then(resolve, reject);
        },
      };
      return query;
    },
  },
}));

/** Album n, made on the nth day of 2026 (so a higher n is newer), with its photos. */
function album(n: number, photos: string[] | 'none', over: Row = {}) {
  const id = `a${n}`;
  mockData.photo_albums.push({ id, center_id: 'c1', event_id: null, title: `Album ${n}`, external_url: null, visibility: 'members', created_at: new Date(Date.UTC(2026, 0, n)).toISOString(), ...over });
  for (const [i, name] of (photos === 'none' ? [] : photos).entries()) {
    mockData.photos.push({ album_id: id, storage_path: `c1/${id}/${name}`, status: 'approved', created_at: new Date(Date.UTC(2026, 0, n, 12, i)).toISOString() });
  }
}

const withPhotos = ['1.jpg', '2.jpg'];
const ids = (list: { album: { id: string } }[]) => list.map((x) => x.album.id);

beforeEach(() => {
  mockData.photo_albums = [];
  mockData.events = [];
  mockData.photos = [];
  mockPhotoReads.length = 0;
});

describe('listAlbumPreviews (the albums of Home’s Photos rail)', () => {
  it('reads the first photos of the newest albums only, one small request each, when they all have some', async () => {
    for (let n = 1; n <= 12; n += 1) album(n, withPhotos);
    const previews = await listAlbumPreviews('c1', 8);
    expect(ids(previews)).toEqual(['a12', 'a11', 'a10', 'a9', 'a8', 'a7', 'a6', 'a5']);
    // Eight requests for eight albums: nothing is read for the older ones.
    expect(mockPhotoReads).toHaveLength(8);
    expect(previews[0]).toMatchObject({ hasMedia: true, coverPath: 'c1/a12/1.jpg', event: null });
  });

  it('passes over albums with nothing to open and takes the next newest in their place', async () => {
    // Staff made albums for the next events before their photos arrived: the three newest are empty.
    for (let n = 1; n <= 9; n += 1) album(n, withPhotos);
    for (let n = 10; n <= 12; n += 1) album(n, 'none');
    const previews = await listAlbumPreviews('c1', 8);
    expect(ids(previews)).toEqual(['a9', 'a8', 'a7', 'a6', 'a5', 'a4', 'a3', 'a2']);
    // The first round looked at the 8 newest (5 usable), the second only at the 3 more it needed.
    expect(mockPhotoReads).toEqual(['a12', 'a11', 'a10', 'a9', 'a8', 'a7', 'a6', 'a5', 'a4', 'a3', 'a2']);
  });

  it('keeps an album with no photo here but an online album (https) to go to, and passes over one with a link that is not', async () => {
    album(3, 'none', { external_url: 'https://photos.app.goo.gl/abc' });
    album(2, 'none', { external_url: 'http://example.com/album' });
    album(1, withPhotos);
    const previews = await listAlbumPreviews('c1', 8);
    expect(ids(previews)).toEqual(['a3', 'a1']);
    expect(previews[0]).toMatchObject({ hasMedia: false, coverPath: null });
  });

  it('counts a video-only album: it has something to open but no picture to show as its cover', async () => {
    album(2, ['clip.mp4']);
    album(1, ['1.jpg']);
    const previews = await listAlbumPreviews('c1', 8);
    expect(previews[0]).toMatchObject({ hasMedia: true, coverPath: null });
    expect(previews[0].album.id).toBe('a2');
  });

  it('uses the first picture as the cover, even when a video comes before it', async () => {
    album(1, ['clip.mp4', '2.jpg']);
    expect((await listAlbumPreviews('c1', 8))[0]).toMatchObject({ hasMedia: true, coverPath: 'c1/a1/2.jpg' });
  });

  it('stops after three rounds when nothing has anything to open, so it never reads every album', async () => {
    for (let n = 1; n <= 40; n += 1) album(n, 'none');
    expect(await listAlbumPreviews('c1', 8)).toEqual([]);
    expect(mockPhotoReads).toHaveLength(24);
  });

  it('orders by when the event starts, else when the album was made (the Photos grid’s order)', async () => {
    mockData.events.push({ id: 'e1', name: 'Mahavir Jayanti', starts_at: '2026-06-01T18:00:00Z', ends_at: null });
    album(5, withPhotos);
    album(1, withPhotos, { event_id: 'e1' });
    album(3, withPhotos);
    const previews = await listAlbumPreviews('c1', 8);
    expect(ids(previews)).toEqual(['a1', 'a5', 'a3']);
    expect(previews[0].event).toEqual({ name: 'Mahavir Jayanti', starts_at: '2026-06-01T18:00:00Z', ends_at: null });
  });

  it('asks for nothing more when there are no albums, or none are wanted', async () => {
    expect(await listAlbumPreviews('c1', 8)).toEqual([]);
    album(1, withPhotos);
    expect(await listAlbumPreviews('c1', 0)).toEqual([]);
    expect(await listAlbumPreviews('c1', Number.NaN)).toEqual([]);
    expect(mockPhotoReads).toEqual([]);
  });
});

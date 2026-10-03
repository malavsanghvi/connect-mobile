import { describe, expect, it } from '@jest/globals';

import { albumLeadsSomewhere, albumOpenTarget, onlineAlbumUrl } from '../album-open';

const card = (external_url: string | null, photos = 0, videos = 0) => ({ album: { external_url }, photos, videos });

describe('albumOpenTarget', () => {
  it('opens the online album straight away when the photos live there and none are in the app', () => {
    expect(albumOpenTarget(card('https://photos.app.goo.gl/abc'))).toBe('online');
    expect(onlineAlbumUrl(card('https://photos.app.goo.gl/abc'))).toBe('https://photos.app.goo.gl/abc');
  });
  it('opens the album itself once it has photos or videos in the app, even with an online link', () => {
    expect(albumOpenTarget(card('https://photos.app.goo.gl/abc', 12))).toBe('photos');
    expect(albumOpenTarget(card('https://photos.app.goo.gl/abc', 0, 2))).toBe('photos');
    expect(onlineAlbumUrl(card('https://photos.app.goo.gl/abc', 12))).toBeNull();
  });
  it('opens the album itself when there is no link', () => {
    expect(albumOpenTarget(card(null))).toBe('photos');
    expect(albumOpenTarget(card('', 3))).toBe('photos');
  });
  it('never opens an address that is not https directly', () => {
    expect(albumOpenTarget(card('http://example.org/album'))).toBe('photos');
    expect(albumOpenTarget(card('javascript:alert(1)'))).toBe('photos');
    expect(albumOpenTarget(card('not a link'))).toBe('photos');
  });
});

describe('albumLeadsSomewhere', () => {
  it('is true for an album with a photo or a video in the app', () => {
    expect(albumLeadsSomewhere(card(null, 1))).toBe(true);
    expect(albumLeadsSomewhere(card(null, 0, 1))).toBe(true);
    expect(albumLeadsSomewhere(card('https://photos.app.goo.gl/abc', 12))).toBe(true);
  });
  it('is true for an album whose photos live in an online album (https)', () => {
    expect(albumLeadsSomewhere(card('https://photos.app.goo.gl/abc'))).toBe(true);
  });
  it('is false for an album with nothing in the app and no https link to go to', () => {
    expect(albumLeadsSomewhere(card(null))).toBe(false);
    expect(albumLeadsSomewhere(card(''))).toBe(false);
    expect(albumLeadsSomewhere(card('http://example.org/album'))).toBe(false);
    expect(albumLeadsSomewhere(card('not a link'))).toBe(false);
  });
});

import { describe, expect, it } from '@jest/globals';

import { photoFileName, photoMimeType } from '../photo-files';

describe('photoFileName', () => {
  it('numbers photos from 1 and keeps the stored extension', () => {
    expect(photoFileName('c1/a1/u-1.png', 0)).toBe('photo-1.png');
    expect(photoFileName('c1/a1/u-9.HEIC', 8)).toBe('photo-9.heic');
    expect(photoFileName('https://example.org/p/abc.webp?x=1', 2)).toBe('photo-3.webp');
  });
  it('falls back to jpg when the path has no extension (an online photo address)', () => {
    expect(photoFileName('https://lh3.googleusercontent.com/pw/AbCdEf', 0)).toBe('photo-1.jpg');
  });
});

describe('photoMimeType', () => {
  it('maps the common extensions and defaults to jpeg', () => {
    expect(photoMimeType('photo-1.png')).toBe('image/png');
    expect(photoMimeType('photo-1.heic')).toBe('image/heic');
    expect(photoMimeType('photo-1.webp')).toBe('image/webp');
    expect(photoMimeType('clip.mp4')).toBe('video/mp4');
    expect(photoMimeType('clip.mov')).toBe('video/quicktime');
    expect(photoMimeType('photo-1.jpg')).toBe('image/jpeg');
    expect(photoMimeType('noextension')).toBe('image/jpeg');
  });
});

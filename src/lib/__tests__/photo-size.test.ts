import { describe, expect, it } from '@jest/globals';

import { isGooglePhotoUrl, sizedPhotoUrl } from '../photo-size';

const BASE = 'https://lh3.googleusercontent.com/pw/AP1GczN-abc_DEF123';

describe('sizedPhotoUrl', () => {
  it('asks Google for a square tile, a large view and a bigger copy to save', () => {
    expect(sizedPhotoUrl(BASE, 'thumb')).toBe(`${BASE}=w480-h480-c`);
    expect(sizedPhotoUrl(BASE, 'full')).toBe(`${BASE}=w1600`);
    expect(sizedPhotoUrl(BASE, 'save')).toBe(`${BASE}=w4096`);
  });
  it('leaves our own signed Storage links and other addresses alone', () => {
    const signed = 'https://abc.supabase.co/storage/v1/object/sign/photos/c/a/u-1.jpg?token=xyz';
    expect(sizedPhotoUrl(signed, 'thumb')).toBe(signed);
    expect(sizedPhotoUrl('https://example.org/p.jpg', 'full')).toBe('https://example.org/p.jpg');
  });
  it('never adds a second size to an address that already has one', () => {
    expect(sizedPhotoUrl(`${BASE}=w800`, 'thumb')).toBe(`${BASE}=w800`);
  });
  it('passes a missing address through', () => {
    expect(sizedPhotoUrl(undefined, 'thumb')).toBeUndefined();
  });
});

describe('isGooglePhotoUrl', () => {
  it('recognises only bare Google Photos image addresses over https', () => {
    expect(isGooglePhotoUrl(BASE)).toBe(true);
    expect(isGooglePhotoUrl('http://lh3.googleusercontent.com/pw/abc')).toBe(false);
    expect(isGooglePhotoUrl('https://lh3.googleusercontent.com/a/abc')).toBe(false);
    expect(isGooglePhotoUrl(null)).toBe(false);
  });
});

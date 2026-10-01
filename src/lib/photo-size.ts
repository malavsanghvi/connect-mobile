/**
 * Photos imported from a Google Photos album (connect-crm 0564) are stored as Google's bare image address,
 * https://lh3.googleusercontent.com/pw/<token>, which on its own returns only a small default picture. Google serves a
 * chosen size when a suffix is added: a square crop for grid tiles, a large image for the viewer, a bigger one to save.
 * Any other address (our own signed Storage links) is left as it is.
 */
export type PhotoSize = 'thumb' | 'full' | 'save';

const GOOGLE_PHOTO = /^https:\/\/lh3\.googleusercontent\.com\/pw\/[^=\s?#]+$/;

const SUFFIX: Record<PhotoSize, string> = { thumb: '=w480-h480-c', full: '=w1600', save: '=w4096' };

export function isGooglePhotoUrl(url: string | null | undefined): boolean {
  return !!url && GOOGLE_PHOTO.test(url);
}

export function sizedPhotoUrl(url: string | undefined, size: PhotoSize): string | undefined {
  if (!url) return url;
  return isGooglePhotoUrl(url) ? `${url}${SUFFIX[size]}` : url;
}

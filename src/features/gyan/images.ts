import type { ImageSource } from 'expo-image';

import { BUCKETS, signedUrl } from '@/lib/api/files';
import { useLoad } from '@/lib/use-load';

import type { ImageRef } from './activity';

/**
 * Pictures bundled with the app, named in lesson content as "asset:<name>".
 * The spot coordinates live in the lesson content, measured on the picture
 * named here, so a new picture comes with new coordinates in the content.
 * `placeholder: true` marks a stand-in drawing and shows a small caption
 * under it; a community that wants its own photo instead points the lesson
 * at a content-bucket key (with coordinates measured on that photo), which
 * needs no app change.
 */
const BUNDLED: Record<string, { source: number; width: number; height: number; placeholder: boolean }> = {
  // The derasar photo of the murti of Mahavir Swami (WebP, no metadata), bundled for every community.
  'mahavir-murti': { source: require('../../../assets/gyan/mahavir-murti.webp'), width: 1200, height: 1600, placeholder: false },
};

export type ResolvedImage =
  | { status: 'ready'; source: ImageSource | number; aspect: number | null; placeholder: boolean; retry?: () => void }
  | { status: 'loading' }
  | { status: 'error'; message: string; retry?: () => void };

/**
 * The source for an activity image: bundled, https, or a signed URL from the
 * content bucket. A storage image also carries `retry` when ready: a picture
 * that fails to load may have an expired (one-hour) link, so Retry signs a
 * new one rather than reloading the old.
 */
export function useActivityImage(ref: ImageRef | null, missingMessage: string): ResolvedImage | null {
  const key = ref?.kind === 'storage' ? ref.key : null;
  const signed = useLoad(() => (key ? signedUrl(key, BUCKETS.content, 'load the picture') : Promise.resolve(null)), [key], 'load the picture');
  if (!ref) return null;
  if (ref.kind === 'asset') {
    const a = BUNDLED[ref.name];
    return a ? { status: 'ready', source: a.source, aspect: a.width / a.height, placeholder: a.placeholder } : { status: 'error', message: missingMessage };
  }
  if (ref.kind === 'url') return { status: 'ready', source: { uri: ref.url }, aspect: null, placeholder: false };
  if (signed.error) return { status: 'error', message: signed.error.userMessage, retry: () => void signed.reload() };
  if (!signed.data) return { status: 'loading' };
  return { status: 'ready', source: { uri: signed.data }, aspect: null, placeholder: false, retry: () => void signed.reload() };
}

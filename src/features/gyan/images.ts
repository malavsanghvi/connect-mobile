import type { ImageSource } from 'expo-image';

import { BUCKETS, signedUrl } from '@/lib/api/files';
import { useLoad } from '@/lib/use-load';

import type { ImageRef } from './activity';

/**
 * Pictures bundled with the app, named in lesson content as "asset:<name>".
 * `placeholder: true` shows a small "the derasar photo is coming" caption;
 * when the community's own photo replaces the file, set it to false (or point
 * the lesson at the photo in the content bucket instead, with new spot
 * coordinates — no app change needed).
 */
const BUNDLED: Record<string, { source: number; width: number; height: number; placeholder: boolean }> = {
  'mahavir-murti': { source: require('../../../assets/gyan/mahavir-murti.png'), width: 900, height: 1200, placeholder: true },
};

export type ResolvedImage =
  | { status: 'ready'; source: ImageSource | number; aspect: number | null; placeholder: boolean }
  | { status: 'loading' }
  | { status: 'error'; message: string; retry?: () => void };

/** The source for an activity image: bundled, https, or a signed URL from the content bucket. */
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
  return { status: 'ready', source: { uri: signed.data }, aspect: null, placeholder: false };
}

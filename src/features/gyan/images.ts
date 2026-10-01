import type { ImageSource } from 'expo-image';
import { useState } from 'react';

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
  | { status: 'ready'; source: ImageSource | number; aspect: number | null; placeholder: boolean; renew?: () => Promise<void> }
  | { status: 'loading' }
  | { status: 'error'; message: string; retry?: () => void };

/**
 * The source for an activity image: bundled, https, or a signed URL from the
 * content bucket. A storage image also carries `renew` when ready: a picture
 * that fails to load may have an expired (one-hour) link, so its Retry signs
 * a new one rather than reloading the old (usePictureRetry).
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
  // reload() never throws: a failed signing shows as the error above.
  return { status: 'ready', source: { uri: signed.data }, aspect: null, placeholder: false, renew: () => signed.reload() };
}

/**
 * A picture that failed to load, and its Retry. A storage picture first gets
 * a new link and only then loads again (`renewing` meanwhile), so Retry never
 * reloads the expired link and fails a second time. `attempt` keys the Image,
 * so each Retry is a fresh load.
 */
export function usePictureRetry(img: ResolvedImage | null) {
  const [failed, setFailed] = useState(false);
  const [renewing, setRenewing] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const retry = async () => {
    const renew = img?.status === 'ready' ? img.renew : undefined;
    if (renew) {
      setRenewing(true);
      try {
        await renew();
      } finally {
        setRenewing(false);
      }
    }
    setFailed(false);
    setAttempt((a) => a + 1);
  };
  return { failed, renewing, attempt, onError: () => setFailed(true), retry: () => void retry() };
}

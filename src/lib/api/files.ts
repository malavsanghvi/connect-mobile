import { storageRef } from '@/features/give/rules';

import { AppError, logError, report } from '../errors';
import { supabase } from '../supabase';

/**
 * Supabase Storage buckets the member app reads. The schema stores bare paths
 * (store_items.photo_path, statements.storage_path); a path may also start
 * with its bucket name or be a full URL.
 */
export const BUCKETS = { storePhotos: 'store', statements: 'statements' } as const;

const ONE_HOUR = 60 * 60;

/** A short-lived URL for one private file. Throws a plain-English AppError. */
export async function signedUrl(path: string, bucket: string, action: string): Promise<string> {
  const ref = storageRef(path, bucket);
  if (!ref) throw new AppError(`We couldn't ${action} — the file isn't stored yet.`, `empty storage path for ${bucket}`);
  if ('url' in ref) return ref.url;
  const res = await supabase.storage.from(ref.bucket).createSignedUrl(ref.key, ONE_HOUR);
  if (res.error || !res.data?.signedUrl) throw report(res.error ?? new Error('no signed url returned'), action);
  return res.data.signedUrl;
}

/**
 * Signed URLs for many files (store photos). A photo that can't be signed is
 * logged and left out, so the item shows its plain tile instead of a broken
 * image; a failure of the whole request is thrown so the screen can say so.
 */
export async function signedUrls(paths: string[], bucket: string, action: string): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const keys: { path: string; key: string }[] = [];
  for (const path of [...new Set(paths)]) {
    const ref = storageRef(path, bucket);
    if (!ref) continue;
    if ('url' in ref) out.set(path, ref.url);
    else keys.push({ path, key: ref.key });
  }
  if (keys.length === 0) return out;
  const res = await supabase.storage.from(bucket).createSignedUrls(
    keys.map((k) => k.key),
    ONE_HOUR,
  );
  if (res.error) throw report(res.error, action);
  for (const row of res.data ?? []) {
    const match = keys.find((k) => k.key === row.path);
    if (!match) continue;
    if (row.signedUrl && !row.error) out.set(match.path, row.signedUrl);
    else logError(`signing ${bucket}/${row.path} (showing the plain tile instead)`, row.error ?? 'no url');
  }
  return out;
}

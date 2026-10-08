import { parseCategoryProfile, type CategoryProfile } from '../categories';
import { logError, toAppError } from '../errors';
import { isMissingRpcError } from '../modules';
import { readPref, writePref } from '../storage';
import { supabase } from '../supabase';

/**
 * What one read of `app.category_profile(center)` found (connect-crm 0594). It answers with or without a session.
 *   answered  the profile, and the raw answer (which is what the device keeps, so a later build reads it afresh)
 *   missing   the database does not have the function yet: the community is treated as the category it says (or a Jain Center)
 *   failed    the read did not work (offline, a refusal): the cached or built-in profile stays, the cause is logged
 */
export type CategoryRead = { kind: 'answered'; profile: CategoryProfile; raw: unknown } | { kind: 'missing' } | { kind: 'failed' };

const logged = new Set<string>();

function logOnce(cause: string, context: string, err: unknown): void {
  if (logged.has(cause)) return;
  logged.add(cause);
  logError(context, err);
}

/** Never rejects. */
export async function loadCategoryProfile(centerId: string): Promise<CategoryRead> {
  try {
    const res = await supabase.rpc('category_profile', { p_center: centerId });
    if (res.error) {
      if (isMissingRpcError(res.error)) {
        logOnce('missing', 'reading the kind of organization: app.category_profile is not deployed yet, so the community is shown as the kind it says it is', res.error);
        return { kind: 'missing' };
      }
      const detail = toAppError(res.error, 'read the kind of organization').detail;
      logOnce(`error:${detail}`, 'reading the kind of organization failed, so the last known layout stays', res.error);
      return { kind: 'failed' };
    }
    const profile = parseCategoryProfile(res.data);
    if (!profile) {
      logOnce('unusable', 'reading the kind of organization: the answer was not a profile, so the last known layout stays', new Error(JSON.stringify(res.data)?.slice(0, 300) ?? 'nothing'));
      return { kind: 'failed' };
    }
    return { kind: 'answered', profile, raw: res.data };
  } catch (err) {
    logOnce(`thrown:${err instanceof Error ? err.message : String(err)}`, 'reading the kind of organization failed, so the last known layout stays', err);
    return { kind: 'failed' };
  }
}

// ---------------------------------------------------------------------------
// The device keeps the last answer for each community (keyed by the community, unlike the other device preferences), so
// the next cold start lays the app out right before the network answers.
// ---------------------------------------------------------------------------

const CACHE_PREFIX = 'categoryProfile.';
const CACHE_VERSION = 1;

type CacheEntry = { v: number; raw: unknown };

export function cacheKey(slug: string): string {
  return `${CACHE_PREFIX}${slug}`;
}

/** The profile this device last read for the community, or null (never read, or unreadable). Never rejects. */
export async function readCachedProfile(slug: string): Promise<CategoryProfile | null> {
  const entry = await readPref<CacheEntry | null>(cacheKey(slug), null);
  if (!entry || typeof entry !== 'object' || entry.v !== CACHE_VERSION) return null;
  return parseCategoryProfile(entry.raw);
}

/** Remember the answer for next time. The caller logs a failure (the app works without the cache). */
export async function writeCachedProfile(slug: string, raw: unknown): Promise<void> {
  await writePref<CacheEntry>(cacheKey(slug), { v: CACHE_VERSION, raw });
}

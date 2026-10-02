/**
 * Event flyers in the member app (pure, no React or Supabase). The portal (connect-crm) designs or
 * uploads the flyer and stores its key in events.flyer_path (bucket 'content'); the app only shows,
 * shares and saves it. The QR code on a printed flyer opens `/e/<event id>` (see flyerLinkTarget).
 */

const IMAGE_EXT = new Set(['png', 'jpg', 'jpeg', 'webp']);

/** "Diwali Mela" + "c/events/e/flyer-1.png" → "diwali-mela-flyer.png". The extension comes from the stored path (a query string is ignored); png otherwise. */
export function flyerFileName(eventName: string | null | undefined, path: string | null | undefined): string {
  const slug =
    (eventName ?? '')
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60)
      .replace(/-+$/g, '') || 'event';
  const found = /\.([a-z0-9]{2,5})(?:[?#]|$)/i.exec((path ?? '').trim())?.[1]?.toLowerCase();
  const ext = found && IMAGE_EXT.has(found) ? found : 'png';
  return `${slug}-flyer.${ext}`;
}

/** The content type for a flyer file name from flyerFileName (png when unknown). */
export function flyerMimeType(fileName: string): 'image/png' | 'image/jpeg' | 'image/webp' {
  const ext = (fileName.split('.').pop() ?? '').toLowerCase();
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'webp') return 'image/webp';
  return 'image/png';
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(s: unknown): s is string {
  return typeof s === 'string' && UUID.test(s);
}

export type FlyerLinkHref = '/' | '/welcome' | '/family-match' | `/event/${string}`;

/**
 * Where the flyer's QR link (`/e/<id>`) sends this visitor:
 * - signed out: guest mode, then the event (a members-only event shows "This event is for members");
 * - signed in but not linked to a family yet, or still onboarding: the same start screen as a join
 *   link (family matching), so the link never skips onboarding;
 * - a linked member: the event.
 * A link without a valid event id goes to that start screen too (home for a member or a guest
 * already browsing, the welcome screen for anyone else signed out), like join/[code].
 */
export function flyerLinkTarget(state: { signedIn: boolean; linked: boolean; onboarding: boolean; guest?: boolean }, id: string | null | undefined): { guest: boolean; href: FlyerLinkHref } {
  const unfinished = state.signedIn && (!state.linked || state.onboarding);
  if (!isUuid(id)) return { guest: false, href: unfinished ? '/family-match' : state.signedIn || state.guest ? '/' : '/welcome' };
  const event = `/event/${id.toLowerCase()}` as const;
  if (!state.signedIn) return { guest: true, href: event };
  if (unfinished) return { guest: false, href: '/family-match' };
  return { guest: false, href: event };
}

/** Signed flyer links last an hour (files.ts); Share and Save sign again after 50 minutes so the link can't expire mid-download. */
export const FLYER_RESIGN_AFTER_MS = 50 * 60 * 1000;

export function needsResign(signedAt: number, now: number): boolean {
  return !(now - signedAt < FLYER_RESIGN_AFTER_MS);
}

/**
 * A share or save that failed because Storage refused the signed link (HTTP 400 for an expired
 * token, 403 for a refused one). media.ts puts the status in the error detail: "HTTP 403" (web),
 * "response has status: 400" (Android), "server returned HTTP 403" (iOS).
 */
export function isExpiredLinkError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { detail?: unknown; message?: unknown };
  const text = [e.detail, e.message].filter((v): v is string => typeof v === 'string').join(' ');
  return /\b(?:http|status:?)\s*(?:400|403)\b/i.test(text);
}

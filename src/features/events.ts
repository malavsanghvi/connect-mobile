import type { Translate } from '@/i18n';
import { rsvpBlockReason, rsvpState, type EventRow, type Rsvp } from '@/lib/api/events';
import { formatDate } from '@/lib/format';
import { colors } from '@/theme';

const BANDS = [colors.maroon, colors.store, colors.navy, colors.purple, colors.brown];

/** Deterministic band colour per event so the list is easy to scan. */
export function bandFor(eventId: string): string {
  let h = 0;
  for (let i = 0; i < eventId.length; i += 1) h = (h * 31 + eventId.charCodeAt(i)) >>> 0;
  return BANDS[h % BANDS.length];
}

export function eventStatusLine(t: Translate, e: EventRow, rsvp: Rsvp | null, count: number, now: Date, tz: string | null): { text: string; tone: 'green' | 'muted' | 'brown' | 'navy' } {
  const state = rsvpState(rsvp);
  if (state === 'rsvpd') return { text: t('events.statusAttending', { n: count }), tone: 'green' };
  if (state === 'confirmed') return { text: t('events.statusConfirmed', { n: count }), tone: 'green' };
  if (state === 'attended') return { text: t('events.statusAttended'), tone: 'green' };
  const block = rsvpBlockReason(e, now);
  if (state === 'cancelled' && !block) return { text: t('events.statusCancelled'), tone: 'muted' };
  if (block === 'not_open_yet') return { text: t('events.statusOpensOn', { date: formatDate(e.rsvp_opens_at, tz) }), tone: 'muted' };
  if (block === 'closed' || block === 'past') return { text: t('events.statusClosed'), tone: 'muted' };
  return { text: t('events.statusOpen'), tone: 'brown' };
}

/** "1 person" / "3 people". */
export function peopleLabel(t: Translate, n: number): string {
  return n === 1 ? t('home.person') : t('home.people', { n });
}

/** Membership tier as a single member's tag ("Life member"). */
export function tierSingular(t: Translate, tier: string | null | undefined): string | null {
  if (tier === 'life') return t('events.tierLife');
  if (tier === 'yearly') return t('events.tierYearly');
  if (tier === 'community') return t('events.tierCommunity');
  return null;
}

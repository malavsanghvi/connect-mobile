import { communityById, communityBySlug, type CommunityResult } from './community';
import { findEvent } from './events';
import { BUCKETS, signedUrl } from './files';

/**
 * A one-hour link to an event's flyer (events.flyer_path in the private 'content' bucket; a legacy
 * https flyer is used as it is). Members can sign any flyer of an event they can see; a guest only
 * the current flyer of a published public event (connect-crm 0578, app.can_read_object).
 */
export async function eventFlyerUrl(path: string): Promise<string> {
  return signedUrl(path, BUCKETS.content, 'load the flyer');
}

/**
 * The community a flyer's QR link (`/e/<event id>`, optionally `?c=<web name>`) belongs to when it
 * is not the one open here, or null to open the event here. The community the link names wins;
 * otherwise the event's own, when this visitor can read the event (a guest reads the public events
 * of every community, a member only their own community's). A link naming a community that isn't
 * open, or an event this visitor can't see, opens here, where the event screen says what it can.
 */
export async function eventLinkCommunity(eventId: string, named: string | null, here: { id: string; slug: string }): Promise<CommunityResult | null> {
  if (named) return named === here.slug ? null : communityBySlug(named);
  const event = await findEvent(eventId);
  if (!event || event.center_id === here.id) return null;
  return communityById(event.center_id);
}

import { BUCKETS, signedUrl } from './files';

/**
 * A one-hour link to an event's flyer (events.flyer_path in the private 'content' bucket; a legacy
 * https flyer is used as it is). Members can sign any flyer of an event they can see; a guest only
 * the current flyer of a published public event (connect-crm 0578, app.can_read_object).
 */
export async function eventFlyerUrl(path: string): Promise<string> {
  return signedUrl(path, BUCKETS.content, 'load the flyer');
}

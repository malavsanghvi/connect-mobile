import { useLocalSearchParams } from 'expo-router';

import { RsvpLinkPage } from '@/features/rsvp-contact/manage';

/**
 * https://<member app>/rsvp/<token>: the link in the confirmation email of an RSVP made without signing in (connect-crm
 * docs/RSVP_WITHOUT_LOGIN.md). Outside the route guards and the community choice, like e/[id] and join/[code]: the token in the link is
 * the key, so it opens for a family that never signed in, on a phone where the app was never set up. `?visit=1` is the page opened from
 * "See my tickets" right after saving (look, not cancel).
 */
export default function RsvpLinkScreen() {
  const params = useLocalSearchParams<{ token: string; visit?: string | string[] }>();
  const token = typeof params.token === 'string' ? params.token : null;
  const visit = params.visit === '1';
  return <RsvpLinkPage token={token} visit={visit} />;
}

import { Platform } from 'react-native';

import { addressForChoice, communityFromHost, onMemberDomain, pickerAddress } from '@/lib/community';
import { env } from '@/lib/env';

/**
 * The web address the member app was opened on, read once (the page reloads when it changes). Native builds
 * and any address outside the member domain (a bare IP, localhost, an older link) have none, so the app
 * behaves exactly as before. The rules themselves are pure and tested in lib/community.ts.
 */
function currentHostname(): string | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  return window.location.hostname || null;
}

const hostname = currentHostname();

/** "jsh" on jsh.weaverams.org; null elsewhere. */
export const hostSlug: string | null = communityFromHost(hostname, env.memberBaseDomain);

/** On app.weaverams.org (or the bare domain): the page that lists the organizations. */
export const pickerHost: boolean = onMemberDomain(hostname, env.memberBaseDomain) && !hostSlug;

/** Where choosing this community should send the browser, or null to open it here. */
export function addressFor(slug: string): string | null {
  return addressForChoice({ hostname, baseDomain: env.memberBaseDomain, hostSlug, slug });
}

/** Where "Switch community" goes on an organization's own address, or null when the in-app list is right. */
export function switchAddress(): string | null {
  return hostSlug && env.memberBaseDomain ? pickerAddress(env.memberBaseDomain) : null;
}

/** Leave this page for another address (the page unloads, so nothing after it runs). */
export function goTo(address: string): void {
  window.location.assign(address);
}

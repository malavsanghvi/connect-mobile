import { describe, expect, it } from '@jest/globals';

import { LEGACY_COMMUNITY_SLUG, communityDefaults } from '../env';

describe('which community a build is made for (EXPO_PUBLIC_CENTER_SLUG)', () => {
  it('names none in the shared app, so the finder suggests no organization', () => {
    expect(communityDefaults(undefined).buildCommunity).toBe('');
    expect(communityDefaults('').buildCommunity).toBe('');
    expect(communityDefaults('   ').buildCommunity).toBe('');
  });
  it('names the organization of a build made for one (JSH, or any other)', () => {
    expect(communityDefaults('jsh')).toEqual({ buildCommunity: 'jsh', centerSlug: 'jsh' });
    expect(communityDefaults(' jcnj ')).toEqual({ buildCommunity: 'jcnj', centerSlug: 'jcnj' });
  });
  it('keeps the legacy default for an install that was signed in before communities could be chosen', () => {
    // JSH was the only community then; this is what keeps those members in JSH with no new step.
    expect(LEGACY_COMMUNITY_SLUG).toBe('jsh');
    expect(communityDefaults(undefined).centerSlug).toBe('jsh');
    expect(communityDefaults('').centerSlug).toBe('jsh');
  });
});

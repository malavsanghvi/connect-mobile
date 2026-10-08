import { describe, expect, it, jest } from '@jest/globals';

import { pledgeSourceFor, type Campaign } from '../api/giving';

// The module imports the Supabase client; this test only reads a pure function, so the client is stubbed.
jest.mock('../supabase', () => ({ supabase: {} }));

const campaign = (kind: string) => ({ kind }) as Campaign;

describe('which pledge source a campaign creates', () => {
  it('a gift to a Pathshala campaign is an ordinary gift, never a Pathshala fee (a member cannot create fee pledges since connect-crm 0591)', () => {
    expect(pledgeSourceFor(campaign('pathshala'))).toBe('general');
  });

  it('never returns pathshala_fee, whatever the campaign', () => {
    const kinds = ['general', 'sponsorship', 'construction', 'pathshala', 'membership', 'event', 'other'];
    for (const kind of kinds) expect(pledgeSourceFor(campaign(kind))).not.toBe('pathshala_fee');
    expect(pledgeSourceFor(null)).not.toBe('pathshala_fee');
  });

  it('keeps the other mappings', () => {
    expect(pledgeSourceFor(campaign('sponsorship'))).toBe('sponsorship');
    expect(pledgeSourceFor(campaign('construction'))).toBe('construction');
    expect(pledgeSourceFor(campaign('membership'))).toBe('membership_fee');
    expect(pledgeSourceFor(null)).toBe('general');
  });
});

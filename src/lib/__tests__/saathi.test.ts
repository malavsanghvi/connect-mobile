import { describe, expect, it } from '@jest/globals';

import { circleVisibility, pendingCircleMembers, sharesWithFamily } from '../saathi';

describe('saathi family circle', () => {
  it('treats a member with no settings row as sharing (the table defaults)', () => {
    expect(sharesWithFamily('p1', [])).toBe(true);
    expect(sharesWithFamily('p1', [{ person_id: 'p2', opted_in: false, share_with_family: false }])).toBe(true);
  });

  it('counts someone as not sharing when they opted out of Saathi or turned family sharing off', () => {
    expect(sharesWithFamily('p1', [{ person_id: 'p1', opted_in: true, share_with_family: false }])).toBe(false);
    expect(sharesWithFamily('p1', [{ person_id: 'p1', opted_in: false, share_with_family: true }])).toBe(false);
    expect(sharesWithFamily('p1', [{ person_id: 'p1', opted_in: true, share_with_family: true }])).toBe(true);
  });

  it('always shows the viewer their own progress', () => {
    expect(circleVisibility({ isMe: true, viewerIsAdult: false, sharing: false })).toBe('visible');
    expect(circleVisibility({ isMe: true, viewerIsAdult: true, sharing: false })).toBe('visible');
  });

  it("shows an adult the family's progress, except for members who do not share it", () => {
    expect(circleVisibility({ isMe: false, viewerIsAdult: true, sharing: true })).toBe('visible');
    expect(circleVisibility({ isMe: false, viewerIsAdult: true, sharing: false })).toBe('notSharing');
  });

  it("keeps everyone else's progress private from a child (RLS lets a child read only their own)", () => {
    expect(circleVisibility({ isMe: false, viewerIsAdult: false, sharing: true })).toBe('private');
  });

  it('lists the people named by open add-member requests, and nothing else', () => {
    const rows = [
      { id: 'r1', kind: 'add_member', status: 'open', details: { first_name: ' Anya ', last_name: 'Shah', relationship: 'Daughter', dob: '2016-11-21' } },
      { id: 'r2', kind: 'change_relationship', status: 'open', details: { person_id: 'p1', relationship: 'Spouse' } },
      { id: 'r3', kind: 'add_member', status: 'approved', details: { first_name: 'Dev' } },
      { id: 'r4', kind: 'add_member', status: 'open', details: { last_name: 'Mehta' } },
      { id: 'r5', kind: 'add_member', status: 'open', details: null },
      { id: 'r6', kind: 'add_member', status: 'open', details: ['not', 'an', 'object'] },
    ];
    expect(pendingCircleMembers(rows)).toEqual([
      { requestId: 'r1', name: 'Anya', relationship: 'Daughter' },
      { requestId: 'r4', name: 'Mehta', relationship: null },
      { requestId: 'r5', name: null, relationship: null },
      { requestId: 'r6', name: null, relationship: null },
    ]);
  });
});

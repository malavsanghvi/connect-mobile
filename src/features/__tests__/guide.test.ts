import { describe, expect, it } from '@jest/globals';

import { directionsUrl, firstStepsDone, markFor, parseTimingsTable, questionRef, readCenterContact, registrationStatus, replyWithin, rosterBodyLabel, telUrl } from '../guide';

describe('guide helpers', () => {
  it('reads contact details from branding without inventing any', () => {
    expect(readCenterContact({ branding: {} })).toEqual({ placeName: null, address: null, addressNote: null, phone: null, mapUrl: null, links: [] });
    const c = readCenterContact({
      branding: {
        address: '3905 Arc St, Houston, TX 77063',
        phone: '(713) 555-0100',
        website: 'https://example.org/',
        links: [{ label: 'YouTube', url: 'https://youtube.com/x', sub: 'Pravachans' }, { label: 'Bad', url: 'javascript:alert(1)' }, { url: 'https://nolabel' }],
      },
    });
    expect(c.links).toEqual([
      { label: 'example.org', url: 'https://example.org/', sub: null },
      { label: 'YouTube', url: 'https://youtube.com/x', sub: 'Pravachans' },
    ]);
    expect(directionsUrl(c)).toBe('https://www.google.com/maps/search/?api=1&query=3905%20Arc%20St%2C%20Houston%2C%20TX%2077063');
    expect(telUrl(c.phone)).toBe('tel:7135550100');
    expect(telUrl('abc')).toBeNull();
  });

  it('turns the timings table into rows and keeps the rest as a note', () => {
    const md = '| What | When |\n|---|---|\n| Derasar | 7:30 AM – 6:00 PM daily |\n| Aarti | 12:30 PM |\n\nPlease remove leather items.';
    expect(parseTimingsTable(md)).toEqual({
      rows: [
        { what: 'Derasar', when: '7:30 AM – 6:00 PM daily' },
        { what: 'Aarti', when: '12:30 PM' },
      ],
      note: 'Please remove leather items.',
    });
  });

  it('counts first steps and builds marks', () => {
    expect(firstStepsDone({ whatsapp: true, zone: false, membership: true, volunteer: false, ask: true })).toBe(3);
    expect(markFor('Vice President')).toBe('VP');
    expect(markFor('YouTube')).toBe('YO');
    expect(rosterBodyLabel('executive_committee')).toBe('Executive Committee');
    expect(rosterBodyLabel('pathshala_team')).toBe('Pathshala Team');
    expect(replyWithin(24)).toBe('day');
    expect(replyWithin(72)).toBe('days');
    expect(questionRef('3f2a1c9d-0000-4000-8000-000000000001')).toBe('Q-3F2A1C');
  });

  it('works out registration windows', () => {
    const now = new Date('2026-09-24T12:00:00Z');
    expect(registrationStatus(null, null, now)).toEqual({ kind: 'open' });
    expect(registrationStatus('2027-01-05T00:00:00Z', null, now)).toEqual({ kind: 'opens', on: '2027-01-05' });
    expect(registrationStatus(null, '2026-09-01T00:00:00Z', now)).toEqual({ kind: 'closed' });
  });
});

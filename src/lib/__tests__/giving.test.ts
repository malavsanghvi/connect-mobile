import { describe, expect, it, jest } from '@jest/globals';

import { listGivingPurposes } from '../api/giving';

jest.mock('../supabase', () => {
  // A minimal chainable query-builder mock: every method returns `this` except the final await,
  // which resolves via `then` (mirroring how supabase-js's PostgrestFilterBuilder is thenable).
  function fakeTable(rows: unknown[]) {
    const builder: Record<string, unknown> = {};
    const chain = () => builder;
    builder.select = chain;
    builder.eq = chain;
    builder.order = chain;
    builder.then = (resolve: (v: { data: unknown[]; error: null }) => unknown) => resolve({ data: rows, error: null });
    return builder;
  }

  const funds = [
    { id: 'fund-general', name: 'General fund' },
    { id: 'fund-dev-dravya', name: 'Dev Dravya' },
    { id: 'fund-construction', name: 'Temple construction' },
  ];
  const campaigns = [
    { id: 'camp-dev-dravya', name: 'Dev Dravya', description: null, fund_id: 'fund-dev-dravya' },
    { id: 'camp-ayambil', name: 'Ayambil Oli sponsorship', description: 'Sponsor a day of Ayambil.', fund_id: 'fund-general' },
  ];

  return {
    supabase: {
      from: (table: string) => {
        if (table === 'funds') return fakeTable(funds);
        if (table === 'campaigns') return fakeTable(campaigns);
        throw new Error(`unexpected table ${table}`);
      },
    },
  };
});

describe('listGivingPurposes', () => {
  it('does not list a fund a second time when a published campaign shares its exact name (the recurring-gift picker duplicate bug)', async () => {
    const purposes = await listGivingPurposes('center-1');
    const devDravyaEntries = purposes.filter((p) => p.label === 'Dev Dravya');
    expect(devDravyaEntries).toHaveLength(1);
    expect(devDravyaEntries[0].key).toBe('campaign:camp-dev-dravya');
  });

  it('still lists a fund on its own when no campaign shares its name, and keeps differently-named campaigns on the same fund', async () => {
    const labels = (await listGivingPurposes('center-1')).map((p) => p.label);
    expect(labels).toContain('General fund');
    expect(labels).toContain('Temple construction');
    expect(labels).toContain('Ayambil Oli sponsorship');
    expect(labels).toHaveLength(4);
  });
});

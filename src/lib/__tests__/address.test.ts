import { describe, expect, it } from '@jest/globals';

import { cityOptions, isValidZip, normalizeCity, normalizeState, normalizeZip, placeForZip, stateName, stateOptions, US_STATES, zipOptions, zipStateMismatch, zipStates, type AddressSuggestion } from '../address';
import { comboListShown, filterCombo } from '../combo';

describe('state', () => {
  it('lists the 50 states, DC and the 5 inhabited territories, each code once', () => {
    expect(US_STATES).toHaveLength(56);
    expect(new Set(US_STATES.map((s) => s.code)).size).toBe(56);
    expect(stateName('dc')).toBe('District of Columbia');
    expect(stateName('XX')).toBeNull();
  });

  it('finds Texas from "tex" or "tx" in the type-ahead, and New Jersey from "jer"', () => {
    expect(filterCombo(stateOptions(), 'tex')[0]).toMatchObject({ value: 'TX', label: 'Texas' });
    expect(filterCombo(stateOptions(), 'tx')[0].value).toBe('TX');
    expect(filterCombo(stateOptions(), 'jer').map((o) => o.value)).toEqual(['NJ']);
    expect(filterCombo(stateOptions(), 'virgin').map((o) => o.value)).toEqual(['VA', 'WV', 'VI']);
    expect(filterCombo(stateOptions(), 'virgin isl').map((o) => o.value)).toEqual(['VI']);
  });

  it('stores the 2-letter code for a code, a full name, or the start of exactly one name', () => {
    expect(normalizeState(' tx ')).toBe('TX');
    expect(normalizeState('texas')).toBe('TX');
    expect(normalizeState('New  Jersey')).toBe('NJ');
    expect(normalizeState('us virgin islands')).toBe('VI');
    expect(normalizeState('tex')).toBe('TX');
    expect(normalizeState('new')).toBe('NEW');
    expect(normalizeState('Ontario')).toBe('ONTARIO');
    expect(normalizeState('  ')).toBe('');
  });
});

describe('city and ZIP', () => {
  it('title-cases a city the way Postgres initcap does', () => {
    expect(normalizeCity('  new   BRUNSWICK ')).toBe('New Brunswick');
    expect(normalizeCity("o'fallon")).toBe("O'Fallon");
    expect(normalizeCity('winston-salem')).toBe('Winston-Salem');
    expect(normalizeCity('st. louis')).toBe('St. Louis');
  });

  it('keeps 5 digits or ZIP+4, and leaves anything else for the form to flag', () => {
    expect(normalizeZip(' 08817 ')).toBe('08817');
    expect(normalizeZip('088171234')).toBe('08817-1234');
    expect(normalizeZip('08817 1234')).toBe('08817-1234');
    expect(normalizeZip('0881')).toBe('0881');
    expect(isValidZip('08817-1234')).toBe(true);
    expect(isValidZip('0881')).toBe(false);
  });
});

describe('ZIP → state sanity check', () => {
  it('knows the state of a ZIP prefix, including the exceptions inside a range', () => {
    expect(zipStates('08817')).toEqual(['NJ']);
    expect(zipStates('77001')).toEqual(['TX']);
    expect(zipStates('73301')).toEqual(['TX']);
    expect(zipStates('73102')).toEqual(['OK']);
    expect(zipStates('20101')).toEqual(['VA']);
    expect(zipStates('20001')).toEqual(['DC']);
    expect(zipStates('05501')).toEqual(['MA']);
    expect(zipStates('05401')).toEqual(['VT']);
    expect(zipStates('00901')).toEqual(['PR']);
    expect(zipStates('96799')).toEqual(['HI', 'AS']);
  });

  it('never questions a military, unassigned or incomplete ZIP', () => {
    expect(zipStates('09012')).toBeNull();
    expect(zipStates('34001')).toBeNull();
    expect(zipStates('96201')).toBeNull();
    expect(zipStates('0881')).toBeNull();
  });

  it('warns only when a full ZIP and a state code disagree', () => {
    expect(zipStateMismatch('77001', 'NJ')).toEqual(['TX']);
    expect(zipStateMismatch('77001', 'tx')).toBeNull();
    expect(zipStateMismatch('770', 'NJ')).toBeNull();
    expect(zipStateMismatch('77001', 'Ne')).toEqual(['TX']);
    expect(zipStateMismatch('77001', 'N')).toBeNull();
    expect(zipStateMismatch('96799', 'AS')).toBeNull();
  });
});

describe('suggestions from app.address_suggestions', () => {
  const rows: AddressSuggestion[] = [
    { postal_code: '08817', city: null, state_region: null, households: 0, from_zone: true },
    { postal_code: '08820', city: null, state_region: null, households: 0, from_zone: true },
    { postal_code: '08817', city: 'Edison', state_region: 'NJ', households: 12, from_zone: false },
    { postal_code: '08820', city: 'Edison', state_region: 'NJ', households: 5, from_zone: false },
    { postal_code: '08820', city: 'Iselin', state_region: 'NJ', households: 2, from_zone: false },
    { postal_code: '08854', city: 'Piscataway', state_region: 'NJ', households: 7, from_zone: false },
  ];

  it('lists each ZIP once, zone ZIPs first, with the places known for it', () => {
    expect(zipOptions(rows, 'Community zone')).toEqual([
      { value: '08817', label: '08817', detail: 'Edison, NJ · Community zone' },
      { value: '08820', label: '08820', detail: 'Edison, NJ · Iselin, NJ · Community zone' },
      { value: '08854', label: '08854', detail: 'Piscataway, NJ' },
    ]);
    expect(filterCombo(zipOptions(rows, 'zone'), '0885').map((o) => o.value)).toEqual(['08854']);
  });

  it("suggests the chosen ZIP's cities, else every city the community knows, most households first", () => {
    expect(cityOptions(rows, '08820').map((o) => o.value)).toEqual(['Edison', 'Iselin']);
    expect(cityOptions(rows, '').map((o) => [o.value, o.detail])).toEqual([
      ['Edison', 'NJ'],
      ['Piscataway', 'NJ'],
      ['Iselin', 'NJ'],
    ]);
    expect(cityOptions(rows, '99999').map((o) => o.value)).toEqual(['Edison', 'Piscataway', 'Iselin']);
  });

  it('fills city and state from a ZIP only when the community knows exactly one place for it', () => {
    expect(placeForZip(rows, '08817')).toEqual({ city: 'Edison', state: 'NJ' });
    expect(placeForZip(rows, '08817-1234')).toEqual({ city: 'Edison', state: 'NJ' });
    expect(placeForZip(rows, '08820')).toBeNull();
    expect(placeForZip(rows, '0881')).toBeNull();
  });
});

describe('type-ahead list', () => {
  const opts = [
    { value: 'NJ', label: 'New Jersey' },
    { value: 'NY', label: 'New York' },
  ];

  it('shows the first options before anything is typed, and ranks an exact match first', () => {
    expect(filterCombo(opts, '', 1)).toEqual([opts[0]]);
    expect(filterCombo(opts, 'ny').map((o) => o.value)).toEqual(['NY']);
    expect(filterCombo(opts, 'new').map((o) => o.value)).toEqual(['NJ', 'NY']);
  });

  it('hides the list when nothing matches or the field already holds the only match', () => {
    expect(comboListShown([], 'x')).toBe(false);
    expect(comboListShown([opts[1]], 'ny')).toBe(false);
    expect(comboListShown([opts[1]], 'new y')).toBe(true);
  });
});

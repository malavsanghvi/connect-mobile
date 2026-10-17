import { describe, expect, it, jest } from '@jest/globals';

import { en } from '../../../i18n/en';
import { AppError } from '../../../lib/errors';
import { changedPrefs, loadThanksPrefs, parseThanksPrefs, RECOGNITION_CHOICES, saveThanksPrefs, REACH_CHOICES, THANKS_CHOICES, type ThanksPrefs } from '../../../lib/api/care-prefs';
import { RECOGNITION_KEYS, REACH_KEYS, THANKS_KEYS } from '../choices';

// "How would you like to be thanked?" (connect-crm 0897): a member's own three choices and nothing else.

const mockRpc = jest.fn<(name: string, args: unknown) => Promise<{ data: unknown; error: unknown }>>();
jest.mock('../../../lib/supabase', () => ({
  supabase: { rpc: (name: string, args: unknown) => mockRpc(name, args) },
}));

const none: ThanksPrefs = { available: true, thanks: null, recognition: null, channel: null };

describe('parseThanksPrefs', () => {
  it('reads the three choices when the question is asked', () => {
    expect(parseThanksPrefs({ available: true, thanks: 'card', recognition: 'private_only', channel: 'post' })).toEqual({ available: true, thanks: 'card', recognition: 'private_only', channel: 'post' });
    expect(parseThanksPrefs({ available: true })).toEqual(none);
  });
  it('is "not available" whenever the database says so or says anything unexpected, never a guess', () => {
    const off = { available: false, thanks: null, recognition: null, channel: null };
    expect(parseThanksPrefs({ available: false })).toEqual(off);
    expect(parseThanksPrefs(null)).toEqual(off);
    expect(parseThanksPrefs('yes')).toEqual(off);
    expect(parseThanksPrefs([])).toEqual(off);
    expect(parseThanksPrefs({ thanks: 'card' })).toEqual(off);
  });
  it('an unknown choice is no choice', () => {
    expect(parseThanksPrefs({ available: true, thanks: 'gold', recognition: 'famous', channel: 'pigeon' })).toEqual(none);
  });
  it('keeps nothing else the database might add: a member sees only these three', () => {
    const r = parseThanksPrefs({ available: true, thanks: 'call', notes: ['x'], owner: 'Sam', health: 'Cooling', do_not_ask: true });
    expect(Object.keys(r).sort()).toEqual(['available', 'channel', 'recognition', 'thanks']);
  });
});

describe('changedPrefs', () => {
  it('sends only what changed, null to clear a choice', () => {
    const before: ThanksPrefs = { available: true, thanks: 'call', recognition: null, channel: 'phone' };
    expect(changedPrefs(before, { thanks: 'call', recognition: null, channel: 'phone' })).toEqual({});
    expect(changedPrefs(before, { thanks: 'card', recognition: null, channel: 'phone' })).toEqual({ thanks: 'card' });
    expect(changedPrefs(before, { thanks: null, recognition: 'anonymous', channel: 'phone' })).toEqual({ thanks: null, recognition: 'anonymous' });
  });
});

describe('the words', () => {
  it('every card has its words, in the order the screen shows them', () => {
    expect([...THANKS_KEYS]).toEqual([...THANKS_CHOICES]);
    expect([...RECOGNITION_KEYS]).toEqual([...RECOGNITION_CHOICES]);
    expect([...REACH_KEYS]).toEqual([...REACH_CHOICES]);
    for (const k of THANKS_KEYS) expect(en[`thanks.thanked.${k}` as const]).toBeTruthy();
    for (const k of RECOGNITION_KEYS) expect(en[`thanks.recognised.${k}` as const]).toBeTruthy();
    for (const k of REACH_KEYS) expect(en[`thanks.reach.${k}` as const]).toBeTruthy();
  });
  it('names no tradition and has no exclamation mark', () => {
    const mine = Object.entries(en).filter(([k]) => k.startsWith('thanks.') || k === 'family.thanks');
    expect(mine.length).toBeGreaterThan(20);
    for (const [k, v] of mine) {
      expect([k, v.match(/jain|jsh|temple|derasar|pathshala|boli|labh|puja|seva|tithi/i)?.[0] ?? null]).toEqual([k, null]);
      expect([k, v.includes('!')]).toEqual([k, false]);
    }
  });
  it('says the choice is the household\'s own and who sees it', () => {
    expect(en['thanks.privacy']).toContain('your household');
    expect(en['thanks.privacy']).toContain('Only the people at your organization who look after relationships can see it');
    expect(en['thanks.notAsked']).toContain('{center} is not asking this yet');
  });
});

describe('the two calls', () => {
  it('asks the database whether the question is asked, for this community only', async () => {
    mockRpc.mockResolvedValueOnce({ data: { available: true, thanks: 'card', recognition: null, channel: null }, error: null });
    const r = await loadThanksPrefs('center-1');
    expect(mockRpc).toHaveBeenCalledWith('member_care_preferences', { p_center: 'center-1' });
    expect(r).toEqual({ available: true, thanks: 'card', recognition: null, channel: null });
  });
  it('saves only what changed, and returns the saved choices', async () => {
    mockRpc.mockResolvedValueOnce({ data: { available: true, thanks: 'call', recognition: 'anonymous', channel: null }, error: null });
    const r = await saveThanksPrefs('center-1', { thanks: 'call', recognition: 'anonymous' });
    expect(mockRpc).toHaveBeenCalledWith('save_member_care_preferences', { p_center: 'center-1', p_prefs: { thanks: 'call', recognition: 'anonymous' } });
    expect(r.recognition).toBe('anonymous');
  });
  it('a refusal is an error in plain words, never a silent success', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { code: 'P0001', message: 'Your organization is not asking this yet.' } });
    await expect(saveThanksPrefs('center-1', { thanks: 'card' })).rejects.toBeInstanceOf(AppError);
    mockRpc.mockResolvedValueOnce({ data: null, error: { code: '42501', message: 'permission denied' } });
    await expect(loadThanksPrefs('center-1')).rejects.toBeInstanceOf(AppError);
  });
});

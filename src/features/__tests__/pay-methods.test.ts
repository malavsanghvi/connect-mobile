import { describe, expect, it } from '@jest/globals';

import { canReportZelle, chosenOnline, fromLegacyOptions, joinNames, onlineMethods, orderMethods, otherMethods, parseMemberMethods, zelleMethod, type OnlineMethod, type ZelleMethod } from '../pay/methods';

type Entry = Record<string, unknown>;

const card: Entry = { key: 'card', family: 'provider_checkout', label: 'Card', provider: 'stripe', mode: 'live', wallets: ['apple_pay', 'google_pay'], also: [], sort: 10 };
const paypal: Entry = { key: 'paypal', family: 'provider_checkout', label: 'PayPal', provider: 'paypal', mode: 'live', wallets: [], also: ['venmo'], sort: 20 };
const zelle: Entry = {
  key: 'zelle',
  family: 'reported_transfer',
  label: 'Zelle',
  mode: 'live',
  instructions: { recipient: 'give@jsh.example', name: 'Jain Society of Houston', memo_hint: 'Your member number' },
  report: { available: true, confirmation: 'ask', window_days: 10 },
  sort: 30,
};
const check: Entry = { key: 'check', family: 'instructions', label: 'Check', method: 'check', instructions: { payee: 'JSH', address: '3905 Arbor St' }, sort: 40 };
const cash: Entry = { key: 'cash', family: 'instructions', label: 'Cash (bhandar)', method: 'cash', instructions: { where: 'The office' }, sort: 50 };

const answer = (methods: Entry[], over: Entry = {}) => ({ environment: 'production', currency: 'usd', online_unavailable: null, methods, ...over });
const keys = (list: { key: string }[]) => list.map((m) => m.key);

describe('the list of ways to give (app.member_payment_methods)', () => {
  it('keeps the community\'s order, whatever order the answer arrives in', () => {
    const parsed = parseMemberMethods(answer([check, zelle, paypal, card]));
    expect(keys(parsed!.methods)).toEqual(['card', 'paypal', 'zelle', 'check']);
  });

  it('keeps the listed order for equal sort values, and for a list that has none (a stable sort)', () => {
    const equal = ['d', 'b', 'c', 'a'].map((key) => ({ ...cash, key, sort: 5 }));
    expect(keys(parseMemberMethods(answer(equal))!.methods)).toEqual(['d', 'b', 'c', 'a']);
    const none = ['d', 'b', 'c', 'a'].map((key) => ({ ...cash, key, sort: undefined }));
    expect(keys(parseMemberMethods(answer(none))!.methods)).toEqual(['d', 'b', 'c', 'a']);
  });

  it('orders by sort and never changes the list it was given', () => {
    const input = [{ sort: 3, id: 'x' }, { sort: 1, id: 'y' }, { sort: 3, id: 'z' }, { sort: 2, id: 'w' }];
    expect(orderMethods(input).map((m) => m.id)).toEqual(['y', 'w', 'x', 'z']);
    expect(input.map((m) => m.id)).toEqual(['x', 'y', 'z', 'w']);
  });

  it('lets the member choose between Card and PayPal when both are connected', () => {
    const list = parseMemberMethods(answer([paypal, card, zelle, check]));
    const online = onlineMethods(list);
    expect(online.map((m) => [m.key, m.processor, m.mode, m.legacy])).toEqual([
      ['card', 'stripe', 'live', false],
      ['paypal', 'paypal', 'live', false],
    ]);
    expect(online[0].wallets).toEqual(['apple_pay', 'google_pay']);
    expect(online[1].also).toEqual(['venmo']);
  });

  it('chooses the first online method until the member picks one, and falls back when the pick is gone', () => {
    const list = parseMemberMethods(answer([card, paypal]));
    expect(chosenOnline(list, null)?.key).toBe('card');
    expect(chosenOnline(list, 'paypal')?.processor).toBe('paypal');
    expect(chosenOnline(list, 'venmo')?.key).toBe('card');
    expect(chosenOnline(parseMemberMethods(answer([zelle, check])), 'card')).toBeNull();
    expect(chosenOnline(null, null)).toBeNull();
  });

  it('treats anything that is not plainly live as test, so the member is told and never charged unknowingly', () => {
    const odd = parseMemberMethods(answer([{ ...card, mode: 'whatever' }, { ...paypal, mode: undefined }]));
    expect(onlineMethods(odd).map((m) => m.mode)).toEqual(['test', 'test']);
  });

  it('shows no online choice when none is connected, and says why', () => {
    const list = parseMemberMethods(answer([zelle, check], { online_unavailable: 'offline_only' }));
    expect(onlineMethods(list)).toEqual([]);
    expect(list!.onlineUnavailable).toBe('offline_only');
    expect(keys(otherMethods(list))).toEqual(['zelle', 'check']);
  });

  it('copes with a list of nothing at all', () => {
    const list = parseMemberMethods(answer([], { online_unavailable: 'not_connected' }));
    expect(list).toEqual({ source: 'methods', environment: 'production', sandbox: false, onlineUnavailable: 'not_connected', methods: [] });
    expect(otherMethods(list)).toEqual([]);
    expect(zelleMethod(list)).toBeNull();
    expect(canReportZelle(list)).toBe(false);
  });

  it('reads Zelle: the address, the name to look for, the memo, and the report window', () => {
    const z = zelleMethod(parseMemberMethods(answer([zelle]))) as ZelleMethod;
    expect(z.instructions).toEqual({ recipient: 'give@jsh.example', name: 'Jain Society of Houston', memoHint: 'Your member number' });
    expect(z.rehearsal).toBe(false);
    expect(z.reportAvailable).toBe(true);
    expect(z.windowDays).toBe(10);
  });

  it('reads the report window and falls back to 10 days for nonsense', () => {
    const win = (v: unknown) => (zelleMethod(parseMemberMethods(answer([{ ...zelle, report: { available: true, window_days: v } }]))) as ZelleMethod).windowDays;
    expect(win(14)).toBe(14);
    expect(win('7')).toBe(7);
    expect(win(2)).toBe(10);
    expect(win(31)).toBe(10);
    expect(win(null)).toBe(10);
    expect(win(7.5)).toBe(10);
  });

  it('offers "I sent it" only when the database says reports can be made', () => {
    expect(canReportZelle(parseMemberMethods(answer([zelle])))).toBe(true);
    expect(canReportZelle(parseMemberMethods(answer([{ ...zelle, report: { available: false } }])))).toBe(false);
    expect(canReportZelle(parseMemberMethods(answer([{ ...zelle, report: undefined }])))).toBe(false);
    // Zelle is still listed, as instructions, when reports cannot be made.
    expect(zelleMethod(parseMemberMethods(answer([{ ...zelle, report: { available: false } }])))?.instructions.recipient).toBe('give@jsh.example');
  });

  it('never shows the real address in a sandbox, even if the answer carries it', () => {
    const rehearsal = { ...zelle, mode: 'rehearsal', instructions: { name: 'Sandbox: no real money moves', recipient: 'real@jsh.example', memo_hint: 'Member number' } };
    const z = zelleMethod(parseMemberMethods(answer([rehearsal], { environment: 'sandbox' }))) as ZelleMethod;
    expect(z.rehearsal).toBe(true);
    expect(z.instructions.recipient).toBeNull();
    expect(z.instructions.memoHint).toBe('Member number');
    // The sandbox itself is enough: an answer that forgot the mode still hides the address.
    const forgot = zelleMethod(parseMemberMethods(answer([{ ...zelle, mode: 'live' }], { environment: 'sandbox' }))) as ZelleMethod;
    expect(forgot.rehearsal).toBe(true);
    expect(forgot.instructions.recipient).toBeNull();
    expect(parseMemberMethods(answer([zelle], { environment: 'sandbox' }))!.sandbox).toBe(true);
  });

  it('leaves out what this build does not know, and still shows the rest', () => {
    const list = parseMemberMethods(
      answer([
        card,
        { key: 'square', family: 'provider_checkout', label: 'Square', provider: 'square', sort: 1 },
        { key: 'venmo_direct', family: 'reported_transfer', label: 'Venmo', sort: 2 },
        { key: 'crypto', family: 'instructions', label: 'Crypto', method: 'bitcoin', instructions: {}, sort: 3 },
        { key: 'future', family: 'something_new', label: 'New', sort: 4 },
        'not an object' as unknown as Entry,
        { family: 'instructions', method: 'check' },
        check,
      ]),
    );
    expect(keys(list!.methods)).toEqual(['card', 'check']);
  });

  it('shows only text instruction fields, trimmed', () => {
    const list = parseMemberMethods(answer([{ ...check, instructions: { payee: '  JSH  ', address: '', note: 5, junk: { a: 1 } } }]));
    expect((list!.methods[0] as { instructions: Record<string, string> }).instructions).toEqual({ payee: 'JSH' });
  });

  it('keeps the community\'s own name for a method', () => {
    const list = parseMemberMethods(answer([{ ...card, label: 'Credit or debit card' }, { ...cash, label: 'Cash at the bhandar' }]));
    expect((list!.methods[0] as OnlineMethod).label).toBe('Credit or debit card');
    expect(list!.methods[1]).toMatchObject({ kind: 'instructions', label: 'Cash at the bhandar', method: 'cash' });
  });

  it('is not an answer at all when the shape is wrong', () => {
    for (const bad of [null, undefined, 'x', 7, [], {}, { methods: 'x' }, { methods: null }]) expect(parseMemberMethods(bad)).toBeNull();
  });

  it('names wallets and extras for the note under a choice', () => {
    expect(joinNames(['apple_pay', 'google_pay'])).toBe('Apple Pay and Google Pay');
    expect(joinNames(['apple_pay'])).toBe('Apple Pay');
    expect(joinNames(['apple_pay', 'google_pay', 'venmo'])).toBe('Apple Pay, Google Pay and Venmo');
    expect(joinNames(['mystery'])).toBe('');
    expect(joinNames([])).toBe('');
  });
});

describe('the older list (app.member_payment_options), used when the portal does not have the new one yet', () => {
  const legacy = {
    online: { processor: 'stripe', mode: 'live', methods: ['card'], donor_covers_fee_allowed: false },
    online_unavailable: null,
    offline: [
      { method: 'zelle', instructions: { recipient: 'give@jsh.example', name: 'JSH' } },
      { method: 'check', instructions: { payee: 'JSH' } },
      { method: 'cash', instructions: {} },
    ],
    environment: 'production',
  };

  it('behaves as before: the processor the server picked, no choice, and no processor sent', () => {
    const list = fromLegacyOptions(legacy);
    expect(list.source).toBe('options');
    const online = onlineMethods(list);
    expect(online).toHaveLength(1);
    expect(online[0]).toMatchObject({ processor: 'stripe', mode: 'live', legacy: true, label: 'Stripe', wallets: [], also: [] });
    expect(chosenOnline(list, 'paypal')?.processor).toBe('stripe');
  });

  it('shows the offline methods in the order the server gave, Zelle as plain instructions (no "I sent it")', () => {
    const list = fromLegacyOptions(legacy);
    expect(keys(otherMethods(list))).toEqual(['zelle', 'check', 'cash']);
    expect(zelleMethod(list)).toBeNull();
    expect(canReportZelle(list)).toBe(false);
    expect(otherMethods(list)[0]).toMatchObject({ kind: 'instructions', method: 'zelle', label: null, instructions: { recipient: 'give@jsh.example', name: 'JSH' } });
  });

  it('names PayPal, and carries why online is off', () => {
    expect(onlineMethods(fromLegacyOptions({ ...legacy, online: { processor: 'paypal', mode: 'test' } }))[0]).toMatchObject({ key: 'paypal', label: 'PayPal', mode: 'test', processor: 'paypal' });
    const off = fromLegacyOptions({ online: null, online_unavailable: 'test_mode', offline: [], environment: 'sandbox' });
    expect(onlineMethods(off)).toEqual([]);
    expect(off).toMatchObject({ onlineUnavailable: 'test_mode', sandbox: true, methods: [] });
  });

  it('copes with a thin or odd answer without throwing', () => {
    expect(fromLegacyOptions(null).methods).toEqual([]);
    expect(fromLegacyOptions({ online: { processor: 'square' }, offline: [null, { instructions: {} }, 'x'] }).methods).toEqual([]);
  });
});

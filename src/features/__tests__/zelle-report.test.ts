import { describe, expect, it } from '@jest/globals';

import {
  centsParam,
  centsToField,
  initialPledgeSelection,
  isWaiting,
  newestFirst,
  normalizeConfirmation,
  parseReportAmount,
  parseReports,
  pledgesWithWaitingReport,
  splitIds,
  statusLook,
  validateReport,
  type PaymentReport,
  type ReportInput,
} from '../pay/zelle-report';

const TODAY = '2026-10-03';
const OPEN = ['p1', 'p2', 'p3'];
const ctx = { today: TODAY, openPledgeIds: OPEN };
const input = (over: Partial<ReportInput> = {}): ReportInput => ({ amount: '250', date: '10/01/2026', confirmation: '', senderName: '', pledgeIds: [], ...over });

describe('the amount, in whole cents', () => {
  it.each([
    ['250', 25000],
    ['12.5', 1250],
    ['12.50', 1250],
    ['1,000.00', 100000],
    ['1,000', 100000],
    ['$12', 1200],
    ['$ 1,234.56', 123456],
    ['.5', 50],
    ['12.', 1200],
    ['0.01', 1],
    ['  250  ', 25000],
    ['1,000,000', 100000000],
    ['007', 700],
  ])('reads %s as %i cents', (text, cents) => {
    expect(parseReportAmount(text)).toEqual({ ok: true, cents });
  });

  it('never goes through floating point (19.99 * 100 is 1998.9999999999998)', () => {
    expect(19.99 * 100).not.toBe(1999);
    for (const [text, cents] of [['19.99', 1999], ['1.15', 115], ['0.07', 7], ['987654.32', 98765432], ['8.2', 820]] as const) {
      expect(parseReportAmount(text)).toEqual({ ok: true, cents });
    }
  });

  it.each([
    ['', 'amount_required'],
    ['   ', 'amount_required'],
    ['$', 'amount_required'],
    ['abc', 'amount_invalid'],
    ['12.345', 'amount_invalid'],
    ['1,00', 'amount_invalid'],
    ['1,0000', 'amount_invalid'],
    ['-5', 'amount_invalid'],
    ['1e3', 'amount_invalid'],
    ['12,50', 'amount_invalid'],
    ['.', 'amount_invalid'],
    ['१२', 'amount_invalid'],
    ['0', 'amount_too_small'],
    ['0.00', 'amount_too_small'],
    ['1,000,000.01', 'amount_too_large'],
    ['5000000', 'amount_too_large'],
    ['99999999999999999999', 'amount_too_large'],
  ])('refuses "%s" (%s) instead of guessing', (text, problem) => {
    expect(parseReportAmount(text)).toEqual({ ok: false, problem });
  });

  it('puts a total from the Pay sheet in the field as dollars', () => {
    expect(centsToField(125000)).toBe('1250');
    expect(centsToField(1250)).toBe('12.50');
    expect(centsToField(5)).toBe('0.05');
    for (const bad of [0, -5, 12.5, Number.NaN, null, undefined]) expect(centsToField(bad as number)).toBe('');
    // what the field shows is read back as the same cents
    for (const cents of [1, 99, 100, 1999, 125000, 100000000]) expect(parseReportAmount(centsToField(cents))).toEqual({ ok: true, cents });
  });
});

describe('the report form', () => {
  it('accepts a complete report and returns what to send', () => {
    const res = validateReport(input({ amount: '250.00', date: '09/27/2026', confirmation: ' JPM99BXK2Q1V ', senderName: ' Rahul Shah ', pledgeIds: ['p1', 'p2'] }), ctx);
    expect(res).toEqual({ ok: true, value: { amountCents: 25000, sentOn: '2026-09-27', confirmation: 'JPM99BXK2Q1V', senderName: 'Rahul Shah', pledgeIds: ['p1', 'p2'] } });
  });

  it('asks for the confirmation number but does not require it', () => {
    const res = validateReport(input({ confirmation: '' }), ctx);
    expect(res).toMatchObject({ ok: true, value: { confirmation: null } });
    expect(validateReport(input({ confirmation: '   ' }), ctx)).toMatchObject({ ok: true, value: { confirmation: null } });
  });

  it('checks a confirmation number only when one is given: 6 to 40 letters and digits', () => {
    const conf = (c: string) => validateReport(input({ confirmation: c }), ctx);
    expect(conf('AB-12 34')).toMatchObject({ ok: true, value: { confirmation: 'AB-12 34' } });
    expect(conf('ab12')).toEqual({ ok: false, problems: { confirmation: 'confirmation_invalid' } });
    expect(conf('!!!!!!!!')).toEqual({ ok: false, problems: { confirmation: 'confirmation_invalid' } });
    expect(conf('A'.repeat(41))).toEqual({ ok: false, problems: { confirmation: 'confirmation_invalid' } });
    expect(conf('A'.repeat(40))).toMatchObject({ ok: true });
    expect(conf(`${'A'.repeat(30)}${'-'.repeat(31)}`)).toEqual({ ok: false, problems: { confirmation: 'confirmation_invalid' } });
    expect(normalizeConfirmation('jpm-99 bxk2q1v')).toBe('JPM99BXK2Q1V');
  });

  it('takes a date up to today and back 60 days, in the community\'s calendar', () => {
    const date = (d: string) => validateReport(input({ date: d }), ctx);
    expect(date('10/03/2026')).toMatchObject({ ok: true, value: { sentOn: '2026-10-03' } });
    expect(date('2026-10-03')).toMatchObject({ ok: true, value: { sentOn: '2026-10-03' } });
    expect(date('08/04/2026')).toMatchObject({ ok: true, value: { sentOn: '2026-08-04' } }); // exactly 60 days
    expect(date('08/03/2026')).toEqual({ ok: false, problems: { date: 'date_old' } }); // 61 days
    expect(date('10/04/2026')).toEqual({ ok: false, problems: { date: 'date_future' } });
    expect(date('01/01/2027')).toEqual({ ok: false, problems: { date: 'date_future' } });
    expect(date('02/30/2026')).toEqual({ ok: false, problems: { date: 'date_invalid' } });
    expect(date('yesterday')).toEqual({ ok: false, problems: { date: 'date_invalid' } });
    expect(date('')).toEqual({ ok: false, problems: { date: 'date_required' } });
  });

  it('counts the 60 days across a year end', () => {
    const jan = { today: '2027-01-10', openPledgeIds: [] };
    expect(validateReport(input({ date: '11/11/2026' }), jan)).toMatchObject({ ok: true });
    expect(validateReport(input({ date: '11/10/2026' }), jan)).toEqual({ ok: false, problems: { date: 'date_old' } });
  });

  it('keeps the name as shown at the bank, trimmed, or leaves it out', () => {
    expect(validateReport(input({ senderName: '' }), ctx)).toMatchObject({ ok: true, value: { senderName: null } });
    expect(validateReport(input({ senderName: 'x'.repeat(120) }), ctx)).toMatchObject({ ok: true });
    expect(validateReport(input({ senderName: 'x'.repeat(121) }), ctx)).toEqual({ ok: false, problems: { senderName: 'sender_too_long' } });
  });

  it('lets the member name no pledge, some, or all of the open ones, each once', () => {
    expect(validateReport(input({ pledgeIds: [] }), ctx)).toMatchObject({ ok: true, value: { pledgeIds: [] } });
    expect(validateReport(input({ pledgeIds: ['p3', 'p1', 'p3'] }), ctx)).toMatchObject({ ok: true, value: { pledgeIds: ['p3', 'p1'] } });
  });

  it('refuses a pledge the family no longer has open', () => {
    expect(validateReport(input({ pledgeIds: ['p1', 'gone'] }), ctx)).toEqual({ ok: false, problems: { pledges: 'pledge_gone' } });
  });

  it('refuses more than 20 pledges in one report', () => {
    const many = Array.from({ length: 21 }, (_, i) => `q${i}`);
    expect(validateReport(input({ pledgeIds: many }), { today: TODAY, openPledgeIds: many })).toEqual({ ok: false, problems: { pledges: 'pledges_too_many' } });
    expect(validateReport(input({ pledgeIds: many.slice(0, 20) }), { today: TODAY, openPledgeIds: many })).toMatchObject({ ok: true });
  });

  it('reports every problem at once, one per field', () => {
    const res = validateReport(input({ amount: '12.345', date: '12/25/2026', confirmation: 'x', senderName: 'y'.repeat(130), pledgeIds: ['nope'] }), ctx);
    expect(res).toEqual({
      ok: false,
      problems: { amount: 'amount_invalid', date: 'date_future', confirmation: 'confirmation_invalid', senderName: 'sender_too_long', pledges: 'pledge_gone' },
    });
  });

  it('never sends a float: the amount is whole cents', () => {
    const res = validateReport(input({ amount: '19.99' }), ctx);
    expect(res.ok && Number.isInteger(res.value.amountCents) && res.value.amountCents).toBe(1999);
  });
});

describe('opening the form from the Pay sheet', () => {
  it('ticks the pledges the sheet was for, and counts the ones the family no longer has open', () => {
    expect(initialPledgeSelection(['p1', 'gone', 'p2', 'p1'], OPEN)).toEqual({ selected: ['p1', 'p2'], dropped: 1 });
    expect(initialPledgeSelection([], OPEN)).toEqual({ selected: [], dropped: 0 });
    expect(initialPledgeSelection(['x'], [])).toEqual({ selected: [], dropped: 1 });
  });

  it('reads the route parameters safely', () => {
    expect(splitIds('a, b,,c')).toEqual(['a', 'b', 'c']);
    expect(splitIds(['a,b', 'c'])).toEqual(['a', 'b', 'c']);
    expect(splitIds(undefined)).toEqual([]);
    expect(splitIds('')).toEqual([]);
    expect(centsParam('12500')).toBe(12500);
    expect(centsParam(['500'])).toBe(500);
    for (const bad of ['12.5', '-1', '0', '1e3', 'abc', '', '100000001', undefined, null, '1234567890']) expect(centsParam(bad as string)).toBeNull();
  });
});

const report = (over: Partial<PaymentReport> = {}): PaymentReport => ({
  id: 'r1',
  amountCents: 25000,
  sentOn: '2026-09-27',
  dueOn: '2026-10-07',
  status: 'reported',
  confirmation: null,
  senderName: null,
  pledgeIds: [],
  isTest: false,
  receiptNumber: null,
  rejectReason: null,
  createdAt: '2026-09-27T15:00:00Z',
  ...over,
});

describe('the family\'s reports (app.my_payment_reports)', () => {
  const row = {
    id: 'r1',
    household_id: 'h1',
    method: 'zelle',
    amount_cents: 25000,
    sent_on: '2026-09-27',
    due_on: '2026-10-07',
    status: 'reported',
    confirmation: 'JPM99BXK2Q1V',
    sender_name: 'Rahul Shah',
    pledge_ids: ['p1'],
    is_test: false,
    receipt_number: null,
    reject_reason: null,
    created_at: '2026-09-27T15:00:00+00:00',
  };

  it('reads a row into our own type', () => {
    expect(parseReports([row])).toEqual({
      skipped: 0,
      reports: [
        { id: 'r1', amountCents: 25000, sentOn: '2026-09-27', dueOn: '2026-10-07', status: 'reported', confirmation: 'JPM99BXK2Q1V', senderName: 'Rahul Shah', pledgeIds: ['p1'], isTest: false, receiptNumber: null, rejectReason: null, createdAt: '2026-09-27T15:00:00+00:00' },
      ],
    });
  });

  it('leaves out a row it cannot trust and says how many', () => {
    const res = parseReports([row, { ...row, id: 'r2', status: 'refunded' }, { ...row, id: 'r3', amount_cents: 12.5 }, { ...row, id: 'r4', amount_cents: 0 }, { ...row, id: 'r5', sent_on: 'soon' }, { ...row, id: undefined }, null, 'x']);
    expect(res!.reports.map((r) => r.id)).toEqual(['r1']);
    expect(res!.skipped).toBe(7);
  });

  it('takes whole cents sent as a number or as digits, nothing else', () => {
    expect(parseReports([{ ...row, amount_cents: '1250' }])!.reports[0].amountCents).toBe(1250);
    expect(parseReports([{ ...row, amount_cents: '12.50' }])!.skipped).toBe(1);
  });

  it('is not a list at all when it is not an array', () => {
    for (const bad of [null, undefined, {}, 'x', 3]) expect(parseReports(bad)).toBeNull();
    expect(parseReports([])).toEqual({ reports: [], skipped: 0 });
  });

  it('shows a pledge as Reported only while a report for it is waiting', () => {
    const reports = [
      report({ id: 'a', status: 'reported', pledgeIds: ['p1'] }),
      report({ id: 'b', status: 'unmatched', pledgeIds: ['p2'] }),
      report({ id: 'c', status: 'matched', pledgeIds: ['p3'] }),
      report({ id: 'd', status: 'withdrawn', pledgeIds: ['p4'] }),
      report({ id: 'e', status: 'rejected', pledgeIds: ['p5'] }),
    ];
    expect([...pledgesWithWaitingReport(reports)].sort()).toEqual(['p1', 'p2']);
    expect(pledgesWithWaitingReport([])).toEqual(new Set());
    expect(['reported', 'unmatched'].every((s) => isWaiting({ status: s as PaymentReport['status'] }))).toBe(true);
    expect(['matched', 'rejected', 'withdrawn'].some((s) => isWaiting({ status: s as PaymentReport['status'] }))).toBe(false);
  });

  it('labels each status in plain words, and never shows "Reported" as received money', () => {
    expect(statusLook('reported')).toEqual({ labelKey: 'zelle.status.reported', tone: 'amber' });
    expect(statusLook('unmatched')).toEqual({ labelKey: 'zelle.status.unmatched', tone: 'red' });
    expect(statusLook('matched')).toEqual({ labelKey: 'zelle.status.matched', tone: 'green' });
    expect(statusLook('rejected').labelKey).toBe('zelle.status.rejected');
    expect(statusLook('withdrawn')).toEqual({ labelKey: 'zelle.status.withdrawn', tone: 'grey' });
    // only a report matched at the bank is green
    expect((['reported', 'unmatched', 'rejected', 'withdrawn'] as const).filter((s) => statusLook(s).tone === 'green')).toEqual([]);
  });

  it('lists the newest report first, without changing the list it was given', () => {
    const list = [report({ id: 'old', createdAt: '2026-09-01T00:00:00Z' }), report({ id: 'new', createdAt: '2026-10-02T00:00:00Z' }), report({ id: 'mid', createdAt: '2026-09-20T00:00:00Z' })];
    expect(newestFirst(list).map((r) => r.id)).toEqual(['new', 'mid', 'old']);
    expect(list.map((r) => r.id)).toEqual(['old', 'new', 'mid']);
  });
});

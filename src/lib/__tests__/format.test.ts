import { describe, expect, it } from '@jest/globals';

import {
  addDays,
  daysBetween,
  formatCents,
  formatCentsCompact,
  formatDateTime,
  formatDay,
  formatDob,
  formatOtp,
  formatPhone,
  formatTimeLeft,
  formatTimeOfDay,
  joinNames,
  parseAmountToCents,
  parseDobInput,
  toE164,
  todayAt,
} from '../format';

describe('cents formatting', () => {
  it('drops cents on whole dollars and groups thousands', () => {
    expect(formatCents(124000)).toBe('$1,240');
    expect(formatCents(500000)).toBe('$5,000');
    expect(formatCents(0)).toBe('$0');
  });
  it('shows cents when there are any, or when asked', () => {
    expect(formatCents(1299)).toBe('$12.99');
    expect(formatCents(299)).toBe('$2.99');
    expect(formatCents(124000, { alwaysCents: true })).toBe('$1,240.00');
    expect(formatCents(-1050)).toBe('-$10.50');
  });
  it('compacts round thousands', () => {
    expect(formatCentsCompact(1000000)).toBe('$10K');
    expect(formatCentsCompact(15100)).toBe('$151');
  });
  it('parses typed amounts into integer cents', () => {
    expect(parseAmountToCents('101')).toBe(10100);
    expect(parseAmountToCents('$1,250.5')).toBe(125050);
    expect(parseAmountToCents('12.99')).toBe(1299);
    expect(parseAmountToCents('0')).toBeNull();
    expect(parseAmountToCents('abc')).toBeNull();
    expect(parseAmountToCents('1.999')).toBeNull();
  });
});

describe('dates and times', () => {
  it('formats Postgres times', () => {
    expect(formatTimeOfDay('07:14:00')).toBe('7:14 AM');
    expect(formatTimeOfDay('19:21')).toBe('7:21 PM');
    expect(formatTimeOfDay('12:00:00')).toBe('12:00 PM');
    expect(formatTimeOfDay('00:30:00')).toBe('12:30 AM');
  });
  it('formats calendar dates', () => {
    expect(formatDay('2026-09-22')).toBe('Tue, Sep 22');
    expect(formatDob('1985-03-14')).toBe('03/14/1985');
  });
  it('formats timestamps in the center time zone', () => {
    expect(formatDateTime('2026-09-27T15:00:00Z', 'America/Chicago')).toBe('Sun, Sep 27 · 10:00 AM');
    expect(todayAt('America/Chicago', new Date('2026-09-23T03:00:00Z'))).toBe('2026-09-22');
  });
  it('parses dates of birth and rejects impossible ones', () => {
    expect(parseDobInput('03/14/1985')).toBe('1985-03-14');
    expect(parseDobInput('3-14-1985')).toBe('1985-03-14');
    expect(parseDobInput('1985-03-14')).toBe('1985-03-14');
    expect(parseDobInput('02/30/2020')).toBeNull();
    expect(parseDobInput('hello')).toBeNull();
  });
  it('does calendar arithmetic without time zones', () => {
    expect(addDays('2026-09-30', 1)).toBe('2026-10-01');
    expect(daysBetween('2026-09-22', '2026-10-06')).toBe(14);
  });
  it('describes time left before a cutoff', () => {
    const now = new Date('2026-09-22T12:00:00Z');
    expect(formatTimeLeft('2026-09-26T12:00:00Z', now)).toBe('4 days');
    expect(formatTimeLeft('2026-09-22T17:00:00Z', now)).toBe('5 hours');
    expect(formatTimeLeft('2026-09-22T12:10:00Z', now)).toBe('10 minutes');
    expect(formatTimeLeft('2026-09-21T12:00:00Z', now)).toBe('');
  });
});

describe('contact details', () => {
  it('normalises US phone numbers to E.164 and back', () => {
    expect(toE164('(713) 555-0142')).toBe('+17135550142');
    expect(toE164('1 713 555 0142')).toBe('+17135550142');
    expect(toE164('+44 20 7946 0958')).toBe('+442079460958');
    expect(toE164('555-0142')).toBeNull();
    expect(formatPhone('+17135550142')).toBe('(713) 555-0142');
  });
  it('shows the one-time code in two groups', () => {
    expect(formatOtp('482917')).toBe('482 917');
    expect(formatOtp('48')).toBe('48');
  });
  it('joins names naturally', () => {
    expect(joinNames(['Priya'])).toBe('Priya');
    expect(joinNames(['Priya', 'Rahul', 'Anya'])).toBe('Priya, Rahul and Anya');
  });
});

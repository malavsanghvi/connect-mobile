import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { AppError } from '../errors';
import { cancelContactRsvp, parseCancel, parseView, viewContactRsvp } from '../api/rsvp-manage';

// The page behind the link in the confirmation email of an RSVP made without signing in (connect-crm 0822): the two calls and how the
// app reads what the database answers.

type Answer = { data: unknown; error: unknown };
const mockCalls: { fn: string; args: unknown }[] = [];
let mockAnswers: Answer[] = [];

jest.mock('../supabase', () => ({
  supabase: {
    rpc: (fn: string, args: unknown) => {
      mockCalls.push({ fn, args });
      return Promise.resolve(mockAnswers.shift() ?? { data: null, error: null });
    },
  },
}));

const TOKEN = 't'.repeat(32);
const page = {
  ok: true,
  event: { name: 'Spring Picnic', starts_at: '2026-10-19T15:30:00Z', ends_at: '2026-10-19T19:00:00Z', venue: 'Lakeside Park' },
  status: 'rsvpd',
  can_cancel: true,
  people: [
    { slot: 2, label: 'P***a S**h', kind: 'adult', status: 'rsvpd', checked_in: false, ticket: 'TICKET-2' },
    { slot: 1, label: 'M***v S**h', kind: 'adult', status: 'rsvpd', checked_in: true, ticket: 'TICKET-1' },
    { slot: 3, label: 'Child 1', kind: 'child', status: 'cancelled', checked_in: false, ticket: null },
  ],
};

beforeEach(() => {
  mockCalls.length = 0;
  mockAnswers = [];
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('the RSVP page, as the app reads it', () => {
  it('keeps the event, the status, whether it can be cancelled and the people in slot order with their tickets', () => {
    expect(parseView(page)).toEqual({
      ok: true,
      event: { name: 'Spring Picnic', startsAt: '2026-10-19T15:30:00Z', endsAt: '2026-10-19T19:00:00Z', venue: 'Lakeside Park' },
      status: 'rsvpd',
      canCancel: true,
      people: [
        { slot: 1, label: 'M***v S**h', kind: 'adult', status: 'rsvpd', checkedIn: true, ticket: 'TICKET-1' },
        { slot: 2, label: 'P***a S**h', kind: 'adult', status: 'rsvpd', checkedIn: false, ticket: 'TICKET-2' },
        { slot: 3, label: 'Child 1', kind: 'child', status: 'cancelled', checkedIn: false, ticket: null },
      ],
    });
  });

  it('reads an event without an end or a venue', () => {
    expect(parseView({ ...page, event: { name: 'Open Day', starts_at: null, ends_at: null, venue: null }, can_cancel: false })).toMatchObject({
      ok: true,
      canCancel: false,
      event: { name: 'Open Day', startsAt: null, endsAt: null, venue: null },
    });
  });

  it('reads a refusal as its code and the database’s sentence', () => {
    expect(parseView({ ok: false, code: 'expired', message: 'This page timed out. Start again.' })).toEqual({ ok: false, code: 'expired', message: 'This page timed out. Start again.' });
  });

  it('does not trust an answer it does not know: no event, no status, no object at all', () => {
    for (const odd of [{ ok: true, status: 'rsvpd', people: [] }, { ok: true, event: { name: 'x' } }, null, 'ok', [], 7]) {
      expect(parseView(odd)).toMatchObject({ ok: false, code: 'unknown' });
    }
    expect(console.error).toHaveBeenCalled();
  });

  it('reads a cancel', () => {
    expect(parseCancel({ ok: true, status: 'cancelled' })).toEqual({ ok: true, status: 'cancelled' });
    expect(parseCancel({ ok: false, code: 'too_late', message: 'x' })).toMatchObject({ ok: false, code: 'too_late' });
  });
});

describe('the calls', () => {
  it('view the RSVP with the token and nothing else', async () => {
    mockAnswers = [{ data: page, error: null }];
    expect(await viewContactRsvp(TOKEN)).toMatchObject({ ok: true, status: 'rsvpd' });
    expect(mockCalls).toEqual([{ fn: 'rsvp_contact_view', args: { p_token: TOKEN } }]);
  });

  it('cancel with the token', async () => {
    mockAnswers = [{ data: { ok: true, status: 'cancelled' }, error: null }];
    expect(await cancelContactRsvp(TOKEN)).toEqual({ ok: true, status: 'cancelled' });
    expect(mockCalls).toEqual([{ fn: 'rsvp_contact_cancel', args: { p_token: TOKEN } }]);
  });

  it('return a refusal as an answer, not as an error', async () => {
    mockAnswers = [{ data: { ok: false, code: 'rate_limited', message: 'Too many tries from this phone.' }, error: null }];
    await expect(viewContactRsvp(TOKEN)).resolves.toMatchObject({ ok: false, code: 'rate_limited' });
  });

  it('throw a fault in plain English, with the action in it, and never log the token', async () => {
    mockAnswers = [{ data: null, error: { message: 'Failed to fetch' } }];
    const err = await viewContactRsvp(TOKEN).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).userMessage).toBe("We couldn't load your RSVP. Check your internet connection and try again.");
    expect(JSON.stringify((console.error as jest.Mock).mock.calls)).not.toContain(TOKEN);
  });

  it('throw when the server answers nothing at all (never a silent success)', async () => {
    mockAnswers = [{ data: null, error: null }];
    await expect(cancelContactRsvp(TOKEN)).rejects.toMatchObject({ userMessage: "We couldn't cancel your RSVP. Please try again." });
  });
});

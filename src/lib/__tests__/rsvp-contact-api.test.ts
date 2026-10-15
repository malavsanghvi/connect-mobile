import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { AppError } from '../errors';
import { lookupFamily, parseLookup, parseSubmit, parseUndo, parseVerify, submitContactRsvp, undoContactRsvp, verifyContactCode } from '../api/rsvp-contact';

// RSVP without signing in (connect-crm 0822-0824): the calls, and how the app reads what the database answers.

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

const members = [
  { slot: 2, label: 'P***a S**h', kind: 'adult', under_12: false },
  { slot: 1, label: 'M***v S**h', kind: 'adult', under_12: false },
  { slot: 3, label: 'Child 1', kind: 'child', under_12: true },
];
const choose = { ok: true, step: 'choose', handle: 'h'.repeat(32), expires_in: 1800, members, send_to: { email: 'm***@g***.com', phone: '+1 *** *** **87' } };

beforeEach(() => {
  mockCalls.length = 0;
  mockAnswers = [];
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('the family, as the app reads it', () => {
  it('keeps the partly hidden people in slot order, the masked contacts and the handle', () => {
    expect(parseLookup(choose)).toEqual({
      ok: true,
      step: 'choose',
      handle: 'h'.repeat(32),
      expiresIn: 1800,
      members: [
        { slot: 1, label: 'M***v S**h', kind: 'adult', under12: false },
        { slot: 2, label: 'P***a S**h', kind: 'adult', under12: false },
        { slot: 3, label: 'Child 1', kind: 'child', under12: true },
      ],
      sendTo: { email: 'm***@g***.com', phone: '+1 *** *** **87' },
    });
  });

  it('has no phone when the family has none on file', () => {
    expect(parseLookup({ ...choose, send_to: { email: 'm***@g***.com', phone: null } })).toMatchObject({ sendTo: { email: 'm***@g***.com', phone: null } });
  });

  it('reads a code step, which tells nothing about the family', () => {
    expect(parseLookup({ ok: true, step: 'code', handle: 'c'.repeat(32), expires_in: 600 })).toEqual({ ok: true, step: 'code', handle: 'c'.repeat(32), expiresIn: 600 });
  });

  it('reads the right code like the lookup of an event without a code', () => {
    expect(parseVerify(choose)).toMatchObject({ ok: true, step: 'choose', handle: 'h'.repeat(32) });
  });

  it('reads a refusal as its code, the database’s sentence and the tries left', () => {
    expect(parseLookup({ ok: false, code: 'not_found', message: 'We could not find a family record.' })).toEqual({ ok: false, code: 'not_found', message: 'We could not find a family record.', triesLeft: null });
    expect(parseVerify({ ok: false, code: 'bad_code', message: 'x', tries_left: 3 })).toMatchObject({ ok: false, code: 'bad_code', triesLeft: 3 });
  });

  it('does not trust an answer it does not know: no family without a handle or people, and no object at all', () => {
    for (const odd of [{ ok: true, step: 'choose', members }, { ok: true, step: 'choose', handle: 'x'.repeat(32), members: [] }, { ok: true, step: 'code' }, null, 'ok', [], 42]) {
      expect(parseLookup(odd)).toMatchObject({ ok: false, code: 'unknown' });
    }
    expect(console.error).toHaveBeenCalled();
  });

  it('reads the saved RSVP: how many, where the confirmation went, until when it can be undone', () => {
    expect(parseSubmit({ ok: true, status: 'rsvpd', count: 3, send_to: { email: 'm***@g***.com' }, undo_until: '2026-10-16T12:15:00Z' })).toEqual({
      ok: true,
      status: 'rsvpd',
      count: 3,
      sendTo: { email: 'm***@g***.com', phone: null },
      undoUntil: '2026-10-16T12:15:00Z',
    });
    expect(parseSubmit({ ok: false, code: 'full', message: 'This event is full.' })).toMatchObject({ ok: false, code: 'full' });
    expect(parseSubmit({ ok: true, status: 'rsvpd' })).toMatchObject({ ok: false, code: 'unknown' });
  });

  it('reads an undo', () => {
    expect(parseUndo({ ok: true, status: 'cancelled' })).toEqual({ ok: true, status: 'cancelled' });
    expect(parseUndo({ ok: false, code: 'too_late', message: 'x' })).toMatchObject({ ok: false, code: 'too_late' });
  });
});

describe('the calls', () => {
  it('look up the family with the event and the contact, and nothing else', async () => {
    mockAnswers = [{ data: choose, error: null }];
    const r = await lookupFamily('11111111-1111-1111-1111-111111111111', '+17135550142');
    expect(r).toMatchObject({ ok: true, step: 'choose' });
    expect(mockCalls).toEqual([{ fn: 'rsvp_contact_lookup', args: { p_event: '11111111-1111-1111-1111-111111111111', p_contact: '+17135550142' } }]);
  });

  it('check a code with the handle', async () => {
    mockAnswers = [{ data: choose, error: null }];
    await verifyContactCode('h'.repeat(32), '482917');
    expect(mockCalls).toEqual([{ fn: 'rsvp_contact_verify', args: { p_handle: 'h'.repeat(32), p_code: '482917' } }]);
  });

  it('save the RSVP with the handle, the slots ticked and the slots that need help', async () => {
    mockAnswers = [{ data: { ok: true, status: 'rsvpd', count: 2, send_to: { email: 'm***@g***.com' }, undo_until: '2026-10-16T12:15:00Z' }, error: null }];
    await submitContactRsvp('h'.repeat(32), [1, 3], [3]);
    expect(mockCalls).toEqual([{ fn: 'rsvp_contact_submit', args: { p_handle: 'h'.repeat(32), p_slots: [1, 3], p_assist: [3] } }]);
  });

  it('undo with the handle', async () => {
    mockAnswers = [{ data: { ok: true, status: 'cancelled' }, error: null }];
    expect(await undoContactRsvp('h'.repeat(32))).toEqual({ ok: true, status: 'cancelled' });
    expect(mockCalls).toEqual([{ fn: 'rsvp_contact_undo', args: { p_handle: 'h'.repeat(32) } }]);
  });

  it('return a refusal as an answer, not as an error', async () => {
    mockAnswers = [{ data: { ok: false, code: 'rate_limited', message: 'Too many tries from this phone.' }, error: null }];
    await expect(lookupFamily('e', '+17135550142')).resolves.toMatchObject({ ok: false, code: 'rate_limited' });
  });

  it('throw a fault in plain English, with the action in it, and log it', async () => {
    mockAnswers = [{ data: null, error: { message: 'Failed to fetch', code: undefined } }];
    const err = await lookupFamily('e', '+17135550142').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).userMessage).toBe("We couldn't look up your family. Check your internet connection and try again.");
    expect(console.error).toHaveBeenCalled();
  });

  it('throw when the server answers nothing at all (never a silent success)', async () => {
    mockAnswers = [{ data: null, error: null }];
    await expect(submitContactRsvp('h', [1], [])).rejects.toMatchObject({ userMessage: "We couldn't save your RSVP. Please try again." });
  });
});

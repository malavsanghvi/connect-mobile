import { describe, expect, it } from '@jest/globals';

import { en } from '../../i18n/en';
import { translate } from '../../i18n';
import type { ContactPerson } from '../../lib/api/rsvp-contact';
import { failureText, specFor, stageAfter } from '../rsvp-contact/failures';
import { allPicked, allowsAssistance, assistSlots, canUndo, guestRsvpAvailable, mmss, personTagKey, pickedSlots, readCode, readContact } from '../rsvp-contact/rules';

// RSVP without signing in (connect-crm docs/RSVP_WITHOUT_LOGIN.md section 2): who is offered it, what a typed contact becomes,
// and what is said for every refusal the database can give.

const FREE = { contact_rsvp: 'open', is_paid: false, confidential: false, audience: 'members_and_guests' };
const family: ContactPerson[] = [
  { slot: 1, label: 'M***v S**h', kind: 'adult', under12: false },
  { slot: 2, label: 'P***a S**h', kind: 'adult', under12: false },
  { slot: 3, label: 'Child 1', kind: 'child', under12: true },
  { slot: 4, label: 'Child 2', kind: 'child', under12: false },
];

describe('who is offered "RSVP without signing in"', () => {
  it('is a visitor who is not signed in, on a free event with the switch on, while the RSVP window is open', () => {
    expect(guestRsvpAvailable({ member: null, event: FREE, block: null })).toBe(true);
    expect(guestRsvpAvailable({ member: null, event: { ...FREE, contact_rsvp: 'code' }, block: null })).toBe(true);
    expect(guestRsvpAvailable({ member: null, event: { ...FREE, audience: 'public' }, block: null })).toBe(true);
  });

  it('is not drawn for a signed-in member: the RSVP form is exactly what it was', () => {
    expect(guestRsvpAvailable({ member: { household: { id: 'h1' } }, event: FREE, block: null })).toBe(false);
  });

  it('is not drawn when the event has the switch off (the default), or anything but code and open', () => {
    for (const contact_rsvp of ['off', '', 'sometimes', 'OPEN']) expect(guestRsvpAvailable({ member: null, event: { ...FREE, contact_rsvp }, block: null })).toBe(false);
  });

  it('is not drawn before the RSVPs open, after they close, or for a past or finished event', () => {
    for (const block of ['not_open_yet', 'closed', 'past']) expect(guestRsvpAvailable({ member: null, event: FREE, block })).toBe(false);
  });

  it('is not drawn for a paid, confidential or members-only event (the database refuses those too)', () => {
    expect(guestRsvpAvailable({ member: null, event: { ...FREE, is_paid: true }, block: null })).toBe(false);
    expect(guestRsvpAvailable({ member: null, event: { ...FREE, confidential: true }, block: null })).toBe(false);
    for (const audience of ['members_only', 'life_members_only', 'pathshala_families']) expect(guestRsvpAvailable({ member: null, event: { ...FREE, audience }, block: null })).toBe(false);
  });
});

describe('what the visitor types', () => {
  it('becomes +1... for a US mobile number, however it is typed', () => {
    for (const typed of ['(713) 555-0142', '713-555-0142', '7135550142', '1 713 555 0142', '+1 713 555 0142']) expect(readContact('phone', typed)).toEqual({ ok: true, contact: '+17135550142' });
    expect(readContact('phone', '+44 20 7946 0958')).toEqual({ ok: true, contact: '+442079460958' });
  });

  it('is refused in plain words when it is not a number', () => {
    for (const typed of ['', '555', 'hello', '713 555']) expect(readContact('phone', typed)).toEqual({ ok: false, error: 'signin.phoneInvalid' });
    expect(translate('en', 'signin.phoneInvalid')).toMatch(/10-digit/);
  });

  it('is a trimmed, lower-case address for an email', () => {
    expect(readContact('email', '  Priya.Shah@Example.COM ')).toEqual({ ok: true, contact: 'priya.shah@example.com' });
    for (const typed of ['', 'priya', 'priya@', 'priya@example', 'a b@example.com']) expect(readContact('email', typed)).toEqual({ ok: false, error: 'signin.emailInvalid' });
  });

  it('is a 6-digit code, with the spaces dropped', () => {
    expect(readCode('482 917')).toBe('482917');
    expect(readCode('482917')).toBe('482917');
    for (const typed of ['', '48291', '4829171', 'abcdef']) expect(readCode(typed)).toBeNull();
  });
});

describe('who is coming', () => {
  it('ticks everyone the first time and sends the slot numbers, in order', () => {
    const picked = allPicked(family);
    expect(pickedSlots(family, picked)).toEqual([1, 2, 3, 4]);
    expect(pickedSlots(family, { ...picked, 2: false })).toEqual([1, 3, 4]);
    expect(pickedSlots(family, {})).toEqual([]);
  });

  it('sends help for the people who are coming only', () => {
    const picked = { ...allPicked(family), 3: false };
    expect(assistSlots(family, picked, { 1: true, 3: true })).toEqual([1]);
    expect(assistSlots(family, picked, {})).toEqual([]);
  });

  it('tags an adult, a child and a child under 12', () => {
    expect(family.map((m) => translate('en', personTagKey(m)))).toEqual(['Adult', 'Adult', 'Child · under 12', 'Child']);
  });

  it('offers help getting around only where the event has the flag the signed-in form reads', () => {
    expect(allowsAssistance(['assistance'])).toBe(true);
    expect(allowsAssistance(['child', 'senior'])).toBe(false);
    expect(allowsAssistance(null)).toBe(false);
    expect(allowsAssistance('assistance')).toBe(false);
  });
});

describe('after the RSVP is saved', () => {
  it('can be undone until the database’s 15 minutes are over, and not without a time', () => {
    const until = '2026-10-16T12:15:00Z';
    expect(canUndo(until, Date.parse('2026-10-16T12:00:00Z'))).toBe(true);
    expect(canUndo(until, Date.parse('2026-10-16T12:15:00Z'))).toBe(false);
    expect(canUndo(null, 0)).toBe(false);
    expect(canUndo('soon', 0)).toBe(false);
  });

  it('counts the seconds to a new code as minutes and seconds', () => {
    expect([60, 59, 5, 0, -3].map(mmss)).toEqual(['1:00', '0:59', '0:05', '0:00', '0:00']);
  });
});

/** Every code the database can answer with (connect-crm docs/RSVP_WITHOUT_LOGIN.md 7.1 and 8.1). */
const CODES = [
  'bad_contact',
  'not_found',
  'ambiguous',
  'already_rsvpd',
  'no_email',
  'cannot_send',
  'full',
  'quota',
  'closed',
  'demo',
  'unavailable',
  'rate_limited',
  'expired',
  'used',
  'bad_selection',
  'too_late',
  'bad_code',
  'locked',
  'use_email',
];
const failure = (code: string, over: Partial<{ message: string; triesLeft: number | null }> = {}) => ({ ok: false as const, code, message: over.message ?? '', triesLeft: over.triesLeft ?? null });

describe('what is said when the database says no', () => {
  it('has a sentence for every code, in the dictionary (so Gujarati and Hindi have it too)', () => {
    for (const code of CODES) {
      const spec = specFor(code);
      expect([code, spec.key in en]).toEqual([code, true]);
      expect([code, failureText((k, v) => translate('en', k, v), failure(code), 'Spring Picnic').length > 10]).toEqual([code, true]);
    }
  });

  it('says the sentences of the plan, not the database’s English, for the ones a visitor meets most', () => {
    const say = (code: string) => failureText((k, v) => translate('en', k, v), failure(code), 'Spring Picnic');
    expect(say('not_found')).toBe('We could not find a family record with that number or email. Check it, try the other one, or sign in. If your family is new here, join first.');
    expect(say('full')).toBe('Spring Picnic is full.');
    expect(say('demo')).toBe('This is a demo. RSVPs are not saved and nothing is sent.');
    expect(say('rate_limited')).toBe('Too many tries from this phone. Please wait a few minutes, or sign in.');
    expect(say('expired')).toBe('This page timed out. Start again.');
  });

  it('counts the tries left after a wrong code', () => {
    const say = (f: ReturnType<typeof failure>) => failureText((k, v) => translate('en', k, v), f, 'Spring Picnic');
    expect(say(failure('bad_code', { triesLeft: 4 }))).toBe('That code is not right. You have 4 tries left.');
    expect(say(failure('bad_code', { triesLeft: 1 }))).toBe('That code is not right. You have 1 try left.');
    expect(say(failure('bad_code'))).toBe('That code is not right. Check it and try again.');
  });

  it('says the database’s own sentence for a code it does not know, or a plain "try again" without one', () => {
    const say = (f: ReturnType<typeof failure>) => failureText((k, v) => translate('en', k, v), f, 'Spring Picnic');
    expect(say(failure('brand_new', { message: 'Something new happened.' }))).toBe('Something new happened.');
    expect(say(failure('brand_new'))).toBe('Something went wrong. Please try again.');
    expect(specFor('brand_new').tone).toBe('error');
  });

  it('puts the visitor where they can fix it: a wrong number or code stays, a page that timed out starts again, the rest get a screen', () => {
    expect(stageAfter({ code: 'not_found' }, 'find')).toBe('find');
    expect(stageAfter({ code: 'bad_contact' }, 'find')).toBe('find');
    expect(stageAfter({ code: 'bad_code' }, 'code')).toBe('code');
    expect(stageAfter({ code: 'bad_selection' }, 'choose')).toBe('choose');
    expect(stageAfter({ code: 'use_email' }, 'code')).toBe('code');
    expect(stageAfter({ code: 'expired' }, 'choose')).toBe('find');
    for (const code of ['full', 'already_rsvpd', 'no_email', 'cannot_send', 'quota', 'closed', 'demo', 'unavailable', 'rate_limited', 'used', 'locked']) expect([code, stageAfter({ code }, 'choose')]).toEqual([code, 'failed']);
    // "ambiguous" after the code was typed cannot be fixed by retyping the code
    expect(stageAfter({ code: 'ambiguous' }, 'code')).toBe('failed');
    expect(stageAfter({ code: 'ambiguous' }, 'find')).toBe('find');
  });

  it('gives a way on for every refusal that stops the visitor: sign in, start again, or back', () => {
    for (const code of ['not_found', 'already_rsvpd', 'no_email', 'cannot_send', 'quota', 'unavailable', 'rate_limited']) expect([code, specFor(code).actions.includes('signIn')]).toEqual([code, true]);
    expect(specFor('not_found').actions).toEqual(['signIn', 'join']);
    expect(specFor('expired').actions).toEqual(['startAgain']);
    for (const code of ['full', 'closed', 'demo']) expect(specFor(code).actions).toEqual(['back']);
  });

  it('never says whether a contact is on a family record before a code was typed', () => {
    // The only sentences for the code step are the generic "If that number is on a family record, we sent a code".
    expect(en['guestRsvp.codeBodyPhone']).toMatch(/^If that number is on a family record/);
    expect(en['guestRsvp.codeBodyEmail']).toMatch(/^If that address is on a family record/);
    expect(en['guestRsvp.err.bad_code']).not.toMatch(/record|found|family/i);
  });
});

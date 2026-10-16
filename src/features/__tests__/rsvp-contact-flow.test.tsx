import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { ReactElement } from 'react';
import { Text, TextInput } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import renderer, { act, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';

import { GuestRsvp } from '@/features/rsvp-contact/flow';
import { AppError } from '@/lib/errors';
import type { EventRow } from '@/lib/api/events';
import type { ContactFailure, LookupAnswer, SubmitAnswer, UndoAnswer, VerifyAnswer } from '@/lib/api/rsvp-contact';
import { SettingsProvider } from '@/providers/settings';

// RSVP without signing in, the whole visit (connect-crm docs/RSVP_WITHOUT_LOGIN.md section 2): the button, find the family, a code when
// the event asks for one, who is coming, saving, done and undo, and every refusal in plain words. The database is the mock.

const mockLookup = jest.fn<(eventId: string, contact: string) => Promise<LookupAnswer>>();
const mockVerify = jest.fn<(handle: string, code: string) => Promise<VerifyAnswer>>();
const mockSubmit = jest.fn<(handle: string, slots: number[], assist: number[]) => Promise<SubmitAnswer>>();
const mockUndo = jest.fn<(handle: string) => Promise<UndoAnswer>>();
const mockPush = jest.fn();

jest.mock('@/lib/api/rsvp-contact', () => ({
  lookupFamily: (e: string, c: string) => mockLookup(e, c),
  verifyContactCode: (h: string, c: string) => mockVerify(h, c),
  submitContactRsvp: (h: string, s: number[], a: number[]) => mockSubmit(h, s, a),
  undoContactRsvp: (h: string) => mockUndo(h),
}));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('@/lib/storage', () => ({ readPref: async (_k: string, fallback: unknown) => fallback, writePref: async () => undefined }));

const insets = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
const HANDLE = 'h'.repeat(32);
const CODE_HANDLE = 'c'.repeat(32);

const event = (over: Partial<EventRow> = {}): EventRow =>
  ({ id: 'e1', center_id: 'c1', name: 'Spring Picnic', contact_rsvp: 'open', lunch_enabled: false, attendee_flags: [], is_paid: false, confidential: false, audience: 'members_and_guests', ...over }) as EventRow;

const choose = { ok: true as const, step: 'choose' as const, handle: HANDLE, expiresIn: 1800, members: [
  { slot: 1, label: 'M***v S**h', kind: 'adult' as const, under12: false },
  { slot: 2, label: 'P***a S**h', kind: 'adult' as const, under12: false },
  { slot: 3, label: 'Child 1', kind: 'child' as const, under12: true },
], sendTo: { email: 'm***@g***.com', phone: '+1 *** *** **87' } };
const saved = (): SubmitAnswer => ({ ok: true, status: 'rsvpd', count: 3, sendTo: { email: 'm***@g***.com', phone: null }, undoUntil: new Date(Date.now() + 15 * 60_000).toISOString() });
const refusal = (code: string, over: Partial<ContactFailure> = {}): ContactFailure => ({ ok: false, code, message: '', triesLeft: null, ...over });

const mounted: ReactTestRenderer[] = [];
async function render(el: ReactElement): Promise<ReactTestRenderer> {
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(
      <SafeAreaProvider initialMetrics={insets}>
        <SettingsProvider>{el}</SettingsProvider>
      </SafeAreaProvider>,
    );
  });
  mounted.push(tree);
  return tree;
}

const flat = (node: ReactTestInstance): string =>
  [node.props.children]
    .flat(Infinity)
    .map((c: unknown) => (typeof c === 'string' || typeof c === 'number' ? String(c) : ''))
    .join('');
const texts = (tree: ReactTestRenderer): string[] => tree.root.findAllByType(Text).map(flat).filter(Boolean);
const hasText = (tree: ReactTestRenderer, s: string): boolean => texts(tree).some((t) => t === s);
const isPressable = (n: ReactTestInstance): boolean => typeof n.props.onPress === 'function' && typeof n.props.accessibilityRole === 'string';
const pressables = (tree: ReactTestRenderer, label: string): ReactTestInstance[] =>
  tree.root.findAll((n) => isPressable(n) && (n.props.accessibilityLabel === label || (n.props.accessibilityLabel === undefined && n.findAllByType(Text).some((x) => flat(x) === label))));
const has = (tree: ReactTestRenderer, label: string): boolean => pressables(tree, label).length > 0;
const press = async (tree: ReactTestRenderer, label: string): Promise<void> => {
  const hit = pressables(tree, label)[0];
  if (!hit) throw new Error(`nothing to press called "${label}" (on screen: ${texts(tree).join(' | ')})`);
  await act(async () => {
    hit.props.onPress();
  });
};
const type = async (tree: ReactTestRenderer, label: string, value: string): Promise<void> => {
  const input = tree.root.findAll((n) => n.type === TextInput && n.props.accessibilityLabel === label)[0];
  if (!input) throw new Error(`no field called "${label}"`);
  await act(async () => {
    input.props.onChangeText(value);
  });
};
const tickRows = (tree: ReactTestRenderer): string[] => tree.root.findAll((n) => n.props.accessibilityRole === 'checkbox' && typeof n.props.onPress === 'function').map((n) => `${String(n.props.accessibilityLabel)}=${String(n.props.accessibilityState?.checked)}`);

/** From the closed card to the family (an event without a code). */
async function toFamily(e: EventRow = event(), onSignIn: () => void = () => undefined): Promise<ReactTestRenderer> {
  mockLookup.mockResolvedValue(choose);
  const tree = await render(<GuestRsvp event={e} onSignIn={onSignIn} />);
  await press(tree, 'RSVP without signing in');
  await type(tree, 'Mobile number', '(713) 555-0142');
  await press(tree, 'Continue');
  return tree;
}

beforeEach(() => {
  for (const m of [mockLookup, mockVerify, mockSubmit, mockUndo, mockPush]) m.mockReset();
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(async () => {
  // Unmounting stops the code countdown, so no timer outlives its test.
  await act(async () => {
    for (const tree of mounted.splice(0)) tree.unmount();
  });
  jest.restoreAllMocks();
});

describe('the button', () => {
  it('is one quiet card that asks for nothing until it is pressed', async () => {
    const tree = await render(<GuestRsvp event={event()} onSignIn={() => undefined} />);
    expect(hasText(tree, 'Use the mobile number or email address we have for your family.')).toBe(true);
    expect(has(tree, 'RSVP without signing in')).toBe(true);
    expect(tree.root.findAllByType(TextInput)).toHaveLength(0);
    expect(mockLookup).not.toHaveBeenCalled();
  });
});

describe('an event without a code', () => {
  it('finds the family by a mobile number, shows it partly hidden with where the confirmation goes, and saves the RSVP', async () => {
    const tree = await toFamily();
    expect(mockLookup).toHaveBeenCalledWith('e1', '+17135550142');
    expect(texts(tree)).toEqual(expect.arrayContaining(["Who's coming?", 'M***v S**h', 'P***a S**h', 'Child 1', 'm***@g***.com', '+1 *** *** **87']));
    expect(texts(tree)).toEqual(expect.arrayContaining(['Your confirmation will be sent to', 'Phone on file', 'Names and numbers are partly hidden on purpose.', 'Child · under 12']));
    expect(tickRows(tree)).toEqual(['M***v S**h. Adult=true', 'P***a S**h. Adult=true', 'Child 1. Child · under 12=true']);
    // nothing but the partly hidden names and numbers is on the screen
    expect(texts(tree).join(' ')).not.toMatch(/7135550142|\(713\)/);

    mockSubmit.mockResolvedValue(saved());
    await press(tree, 'RSVP 3 people');
    expect(mockSubmit).toHaveBeenCalledWith(HANDLE, [1, 2, 3], []);
    expect(hasText(tree, 'You are registered')).toBe(true);
    expect(hasText(tree, 'You are registered for Spring Picnic: 3 people.')).toBe(true);
    expect(hasText(tree, 'We sent a confirmation to m***@g***.com. It has the link to see your tickets, change your plans or cancel.')).toBe(true);
    expect(has(tree, 'Undo this RSVP')).toBe(true);
  });

  it('sends only the people left ticked', async () => {
    const tree = await toFamily();
    await press(tree, 'P***a S**h. Adult');
    expect(tickRows(tree)[1]).toBe('P***a S**h. Adult=false');
    expect(has(tree, 'RSVP 2 people')).toBe(true);
    mockSubmit.mockResolvedValue({ ...saved(), count: 2 } as SubmitAnswer);
    await press(tree, 'RSVP 2 people');
    expect(mockSubmit).toHaveBeenCalledWith(HANDLE, [1, 3], []);
  });

  it('asks to select someone when nobody is ticked, and does not call the database', async () => {
    const tree = await toFamily();
    for (const row of ['M***v S**h. Adult', 'P***a S**h. Adult', 'Child 1. Child · under 12']) await press(tree, row);
    expect(has(tree, 'Select who is coming')).toBe(true);
    expect(pressables(tree, 'Select who is coming')[0].props.accessibilityState.disabled).toBe(true);
    expect(mockSubmit).not.toHaveBeenCalled();
  });

  it('goes back from "Not your family?" to the start, keeping nothing of the family', async () => {
    const tree = await toFamily();
    await press(tree, 'Not your family? Go back.');
    expect(hasText(tree, 'Find your family')).toBe(true);
    expect(texts(tree).join(' ')).not.toContain('M***v S**h');
  });

  it('can be undone for 15 minutes, after asking', async () => {
    const tree = await toFamily();
    mockSubmit.mockResolvedValue(saved());
    await press(tree, 'RSVP 3 people');
    await press(tree, 'Undo this RSVP');
    expect(hasText(tree, 'Cancel this RSVP for 3 people?')).toBe(true);
    expect(mockUndo).not.toHaveBeenCalled();
    mockUndo.mockResolvedValue({ ok: true, status: 'cancelled' });
    await press(tree, 'Yes, cancel it');
    expect(mockUndo).toHaveBeenCalledWith(HANDLE);
    expect(hasText(tree, 'Your RSVP was cancelled and the places were let go.')).toBe(true);
    expect(has(tree, 'RSVP without signing in')).toBe(true);
  });

  it('opens the tickets page for looking only, with the visit’s handle, for 30 minutes after saving', async () => {
    jest.useFakeTimers();
    try {
      const tree = await toFamily();
      mockSubmit.mockResolvedValue(saved());
      await press(tree, 'RSVP 3 people');
      expect(has(tree, 'See my tickets')).toBe(true);
      await press(tree, 'See my tickets');
      expect(mockPush).toHaveBeenCalledWith({ pathname: '/rsvp/[token]', params: { token: HANDLE, visit: '1' } });
      // the clock ticks every 15 seconds; at half an hour the handle is about to time out, so the button goes
      for (let s = 0; s < 125; s++) {
        await act(async () => {
          jest.advanceTimersByTime(15_000);
        });
      }
      expect(has(tree, 'See my tickets')).toBe(false);
      expect(hasText(tree, 'You are registered')).toBe(true);
    } finally {
      jest.useRealTimers();
    }
  });

  it('keeps the RSVP when the visitor says keep it', async () => {
    const tree = await toFamily();
    mockSubmit.mockResolvedValue(saved());
    await press(tree, 'RSVP 3 people');
    await press(tree, 'Undo this RSVP');
    await press(tree, 'Keep it');
    expect(hasText(tree, 'You are registered')).toBe(true);
    expect(mockUndo).not.toHaveBeenCalled();
  });

  it('stays on the event after Done, with no way to RSVP a second time from here', async () => {
    const tree = await toFamily();
    mockSubmit.mockResolvedValue(saved());
    await press(tree, 'RSVP 3 people');
    await press(tree, 'Done');
    expect(hasText(tree, 'You are registered')).toBe(true);
    expect(has(tree, 'Done')).toBe(false);
    expect(has(tree, 'RSVP without signing in')).toBe(false);
  });

  it('says the undo window is over when the database says it is too late', async () => {
    const tree = await toFamily();
    mockSubmit.mockResolvedValue(saved());
    await press(tree, 'RSVP 3 people');
    mockUndo.mockResolvedValue(refusal('too_late') as UndoAnswer);
    await press(tree, 'Undo this RSVP');
    await press(tree, 'Yes, cancel it');
    expect(hasText(tree, 'This RSVP can no longer be changed here because someone has already arrived. Please speak to the event team.')).toBe(true);
    await press(tree, 'Back');
    expect(hasText(tree, 'You are registered')).toBe(true);
    expect(has(tree, 'Undo this RSVP')).toBe(false);
  });

  it('shows lunch and help getting around only where the event has them, and sends who needs help', async () => {
    const tree = await toFamily(event({ lunch_enabled: true, attendee_flags: ['assistance'] }));
    expect(hasText(tree, 'Lunch is served after the program. Your time is set when you check in.')).toBe(true);
    const toggles = tree.root.findAll((n) => typeof n.props.onValueChange === 'function' && n.props.accessibilityLabel === 'Needs help getting around');
    expect(toggles).toHaveLength(3);
    await act(async () => {
      toggles[2].props.onValueChange(true);
    });
    mockSubmit.mockResolvedValue(saved());
    await press(tree, 'RSVP 3 people');
    expect(mockSubmit).toHaveBeenCalledWith(HANDLE, [1, 2, 3], [3]);

    const plain = await toFamily();
    expect(hasText(plain, 'Lunch is served after the program. Your time is set when you check in.')).toBe(false);
    expect(plain.root.findAll((n) => n.props.accessibilityLabel === 'Needs help getting around')).toHaveLength(0);
  });

  it('is one call when the button is pressed twice', async () => {
    mockLookup.mockReturnValue(new Promise(() => undefined));
    const tree = await render(<GuestRsvp event={event()} onSignIn={() => undefined} />);
    await press(tree, 'RSVP without signing in');
    await type(tree, 'Mobile number', '7135550142');
    const button = pressables(tree, 'Continue')[0];
    await act(async () => {
      button.props.onPress();
      button.props.onPress();
    });
    expect(mockLookup).toHaveBeenCalledTimes(1);
  });
});

describe('an event that asks for a code', () => {
  const codeEvent = event({ contact_rsvp: 'code' });
  const toCode = async (): Promise<ReactTestRenderer> => {
    mockLookup.mockResolvedValue({ ok: true, step: 'code', handle: CODE_HANDLE, expiresIn: 600 });
    const tree = await render(<GuestRsvp event={codeEvent} onSignIn={() => undefined} />);
    await press(tree, 'RSVP without signing in');
    await type(tree, 'Mobile number', '(713) 555-0142');
    await press(tree, 'Continue');
    return tree;
  };

  it('says a code will be sent, before anything about the family', async () => {
    mockLookup.mockResolvedValue({ ok: true, step: 'code', handle: CODE_HANDLE, expiresIn: 600 });
    const tree = await render(<GuestRsvp event={codeEvent} onSignIn={() => undefined} />);
    await press(tree, 'RSVP without signing in');
    expect(hasText(tree, 'Enter the mobile number or email address we have for your family. We will send a 6-digit code to it.')).toBe(true);
  });

  it('asks for the code, tells nothing about the family, and shows the family only after the right code', async () => {
    const tree = await toCode();
    expect(hasText(tree, 'Enter your code')).toBe(true);
    expect(hasText(tree, 'If that number is on a family record, we sent a 6-digit code to it. It works for 10 minutes.')).toBe(true);
    expect(hasText(tree, 'No code? Check the number, try your email, or sign in.')).toBe(true);
    expect(texts(tree).join(' ')).not.toContain('M***v');
    expect(pressables(tree, 'Check code')[0].props.accessibilityState.disabled).toBe(true);

    await type(tree, 'Code', '482 917');
    mockVerify.mockResolvedValue({ ...choose, handle: CODE_HANDLE });
    await press(tree, 'Check code');
    expect(mockVerify).toHaveBeenCalledWith(CODE_HANDLE, '482917');
    expect(hasText(tree, 'M***v S**h')).toBe(true);

    mockSubmit.mockResolvedValue(saved());
    await press(tree, 'RSVP 3 people');
    expect(mockSubmit).toHaveBeenCalledWith(CODE_HANDLE, [1, 2, 3], []);
  });

  it('counts the wrong tries left and stays on the code', async () => {
    const tree = await toCode();
    await type(tree, 'Code', '000000');
    mockVerify.mockResolvedValue(refusal('bad_code', { triesLeft: 4 }) as VerifyAnswer);
    await press(tree, 'Check code');
    expect(hasText(tree, 'That code is not right. You have 4 tries left.')).toBe(true);
    expect(hasText(tree, 'Enter your code')).toBe(true);
  });

  it('says the lock in words when there are too many wrong codes', async () => {
    const tree = await toCode();
    await type(tree, 'Code', '000000');
    mockVerify.mockResolvedValue(refusal('locked') as VerifyAnswer);
    await press(tree, 'Check code');
    expect(hasText(tree, 'Too many wrong codes. Please wait 15 minutes, or sign in.')).toBe(true);
    expect(has(tree, 'Sign in')).toBe(true);
  });

  it('asks for a new code only after three minutes, by looking the contact up again', async () => {
    jest.useFakeTimers();
    try {
      const tree = await toCode();
      expect(hasText(tree, 'Send a new code in 3:00')).toBe(true);
      expect(has(tree, 'Send a new code')).toBe(false);
      // the countdown is one second at a time, each scheduled once the screen has drawn the one before
      for (let s = 0; s < 180; s++) {
        await act(async () => {
          jest.advanceTimersByTime(1000);
        });
      }
      expect(has(tree, 'Send a new code')).toBe(true);
      mockLookup.mockClear();
      mockLookup.mockResolvedValue({ ok: true, step: 'code', handle: 'd'.repeat(32), expiresIn: 600 });
      await press(tree, 'Send a new code');
      expect(mockLookup).toHaveBeenCalledWith('e1', '+17135550142');
      expect(hasText(tree, 'Send a new code in 3:00')).toBe(true);
    } finally {
      jest.useRealTimers();
    }
  });

  it('turns to the email tab when the number cannot be texted', async () => {
    mockLookup.mockResolvedValue(refusal('use_email') as LookupAnswer);
    const tree = await render(<GuestRsvp event={codeEvent} onSignIn={() => undefined} />);
    await press(tree, 'RSVP without signing in');
    await type(tree, 'Mobile number', '(713) 555-0142');
    await press(tree, 'Continue');
    expect(hasText(tree, 'We cannot text a code to that number. Use your email address instead.')).toBe(true);
    await press(tree, 'Use my email address instead');
    expect(tree.root.findAll((n) => n.type === TextInput && n.props.accessibilityLabel === 'Email')).toHaveLength(1);
    mockLookup.mockResolvedValue({ ok: true, step: 'code', handle: CODE_HANDLE, expiresIn: 600 });
    await type(tree, 'Email', 'Priya.Shah@Example.com');
    await press(tree, 'Continue');
    expect(mockLookup).toHaveBeenLastCalledWith('e1', 'priya.shah@example.com');
    expect(hasText(tree, 'If that address is on a family record, we sent a 6-digit code to it. It works for 10 minutes.')).toBe(true);
  });
});

describe('when it does not work, in plain words, with the way on', () => {
  it('asks for a real number before calling the database', async () => {
    const tree = await render(<GuestRsvp event={event()} onSignIn={() => undefined} />);
    await press(tree, 'RSVP without signing in');
    await type(tree, 'Mobile number', '555');
    await press(tree, 'Continue');
    expect(hasText(tree, 'Enter a 10-digit US number, or an international number starting with +.')).toBe(true);
    expect(mockLookup).not.toHaveBeenCalled();
  });

  it('says no family was found, and offers to sign in or join', async () => {
    const signIn = jest.fn();
    mockLookup.mockResolvedValue(refusal('not_found') as LookupAnswer);
    const tree = await render(<GuestRsvp event={event()} onSignIn={signIn} />);
    await press(tree, 'RSVP without signing in');
    await type(tree, 'Mobile number', '(713) 555-0142');
    await press(tree, 'Continue');
    expect(hasText(tree, 'We could not find a family record with that number or email. Check it, try the other one, or sign in. If your family is new here, join first.')).toBe(true);
    expect(has(tree, 'New here? Join the community')).toBe(true);
    await press(tree, 'Sign in');
    expect(signIn).toHaveBeenCalledTimes(1);
  });

  it('says a connection fault with a retry, and tries again', async () => {
    mockLookup.mockRejectedValueOnce(new AppError("We couldn't look up your family. Check your internet connection and try again.", 'network error'));
    mockLookup.mockResolvedValue(choose);
    const tree = await render(<GuestRsvp event={event()} onSignIn={() => undefined} />);
    await press(tree, 'RSVP without signing in');
    await type(tree, 'Mobile number', '(713) 555-0142');
    await press(tree, 'Continue');
    expect(hasText(tree, "We couldn't look up your family. Check your internet connection and try again.")).toBe(true);
    await press(tree, 'Try again');
    expect(mockLookup).toHaveBeenCalledTimes(2);
    expect(hasText(tree, 'M***v S**h')).toBe(true);
  });

  it('says the event is full on a screen of its own, and goes back to the event', async () => {
    const tree = await toFamily();
    mockSubmit.mockResolvedValue(refusal('full') as SubmitAnswer);
    await press(tree, 'RSVP 3 people');
    expect(hasText(tree, 'Spring Picnic is full.')).toBe(true);
    expect(texts(tree).join(' ')).not.toContain('M***v');
    await press(tree, 'Back');
    expect(has(tree, 'RSVP without signing in')).toBe(true);
  });

  it('says a family that already has an RSVP uses the emailed link or signs in, with no names', async () => {
    mockLookup.mockResolvedValue(refusal('already_rsvpd') as LookupAnswer);
    const signIn = jest.fn();
    const tree = await render(<GuestRsvp event={event()} onSignIn={signIn} />);
    await press(tree, 'RSVP without signing in');
    await type(tree, 'Mobile number', '(713) 555-0142');
    await press(tree, 'Continue');
    expect(hasText(tree, 'Your family already has an RSVP for this event. To change it, use the link in your confirmation email, or sign in.')).toBe(true);
    await press(tree, 'Sign in');
    expect(signIn).toHaveBeenCalled();
  });

  it('says the page timed out and starts again', async () => {
    const tree = await toFamily();
    mockSubmit.mockResolvedValue(refusal('expired') as SubmitAnswer);
    await press(tree, 'RSVP 3 people');
    expect(hasText(tree, 'This page timed out. Start again.')).toBe(true);
    expect(hasText(tree, 'Find your family')).toBe(true);
  });

  it('says it is a demo when the community is one', async () => {
    mockLookup.mockResolvedValue(refusal('demo') as LookupAnswer);
    const tree = await render(<GuestRsvp event={event()} onSignIn={() => undefined} />);
    await press(tree, 'RSVP without signing in');
    await type(tree, 'Mobile number', '(713) 555-0142');
    await press(tree, 'Continue');
    expect(hasText(tree, 'This is a demo. RSVPs are not saved and nothing is sent.')).toBe(true);
  });

  it('shows a save that failed on the way with a retry, and keeps the people ticked', async () => {
    const tree = await toFamily();
    await press(tree, 'P***a S**h. Adult');
    mockSubmit.mockRejectedValueOnce(new AppError("We couldn't save your RSVP. Check your internet connection and try again.", 'network error'));
    await press(tree, 'RSVP 2 people');
    expect(hasText(tree, "We couldn't save your RSVP. Check your internet connection and try again.")).toBe(true);
    expect(tickRows(tree)[1]).toBe('P***a S**h. Adult=false');
    mockSubmit.mockResolvedValue({ ...saved(), count: 2 } as SubmitAnswer);
    await press(tree, 'Try again');
    expect(mockSubmit).toHaveBeenLastCalledWith(HANDLE, [1, 3], []);
    expect(hasText(tree, 'You are registered')).toBe(true);
  });
});

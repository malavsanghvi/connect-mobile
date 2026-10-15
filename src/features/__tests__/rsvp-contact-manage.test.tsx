import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { ReactElement } from 'react';
import { Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import renderer, { act, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';

import { RsvpLinkPage } from '@/features/rsvp-contact/manage';
import { AppError } from '@/lib/errors';
import type { CancelAnswer, ViewAnswer } from '@/lib/api/rsvp-manage';
import { SettingsProvider } from '@/providers/settings';

// The page behind the link in the confirmation email of an RSVP made without signing in (connect-crm docs/RSVP_WITHOUT_LOGIN.md): the
// event, the people with partly hidden names, a QR each, and "We can't make it". The database is the mock.

const mockView = jest.fn<(token: string) => Promise<ViewAnswer>>();
const mockCancel = jest.fn<(token: string) => Promise<CancelAnswer>>();
const mockReplace = jest.fn();

jest.mock('expo-router', () => ({ useRouter: () => ({ replace: mockReplace, push: jest.fn() }) }));
jest.mock('@/providers/app', () => ({ useApp: () => ({ center: { id: 'c1', time_zone: 'America/Chicago' } }) }));
jest.mock('@/providers/data-version', () => ({ useDataVersion: () => ({ version: 0, invalidate: () => undefined }) }));
jest.mock('@/lib/storage', () => ({ readPref: async (_k: string, fallback: unknown) => fallback, writePref: async () => undefined }));
jest.mock('@/lib/api/rsvp-manage', () => ({ viewContactRsvp: (t: string) => mockView(t), cancelContactRsvp: (t: string) => mockCancel(t) }));
jest.mock('react-native-qrcode-svg', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createElement } = require('react') as typeof import('react');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Text: RNText } = require('react-native') as typeof import('react-native');
  return { __esModule: true, default: ({ value }: { value: string }) => createElement(RNText, null, `QR:${value}`) };
});

const insets = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
const TOKEN = 't'.repeat(32);

const page = (over: Partial<Extract<ViewAnswer, { ok: true }>> = {}): ViewAnswer => ({
  ok: true,
  event: { name: 'Spring Picnic', startsAt: '2026-10-19T15:30:00Z', endsAt: '2026-10-19T19:00:00Z', venue: 'Lakeside Park' },
  status: 'rsvpd',
  canCancel: true,
  people: [
    { slot: 1, label: 'M***v S**h', kind: 'adult', status: 'rsvpd', checkedIn: false, ticket: 'TICKET-1' },
    { slot: 2, label: 'P***a S**h', kind: 'adult', status: 'rsvpd', checkedIn: false, ticket: 'TICKET-2' },
    { slot: 3, label: 'Child 1', kind: 'child', status: 'rsvpd', checkedIn: false, ticket: 'TICKET-3' },
  ],
  ...over,
});
const cancelledPage = (): ViewAnswer =>
  page({ status: 'cancelled', canCancel: false, people: [1, 2, 3].map((slot) => ({ slot, label: `Person ${slot}`, kind: 'adult' as const, status: 'cancelled', checkedIn: false, ticket: null })) });

const mounted: ReactTestRenderer[] = [];
async function open(token: string | null = TOKEN, visit = false): Promise<ReactTestRenderer> {
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(
      <SafeAreaProvider initialMetrics={insets}>
        <SettingsProvider>{(<RsvpLinkPage token={token} visit={visit} />) as ReactElement}</SettingsProvider>
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

beforeEach(() => {
  for (const m of [mockView, mockCancel, mockReplace]) m.mockReset();
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(async () => {
  await act(async () => {
    for (const tree of mounted.splice(0)) tree.unmount();
  });
  jest.restoreAllMocks();
});

describe('the page behind the emailed link', () => {
  it('shows the event, that the family is registered, and the people with their names partly hidden', async () => {
    mockView.mockResolvedValue(page());
    const tree = await open();
    expect(mockView).toHaveBeenCalledWith(TOKEN);
    expect(texts(tree)).toEqual(expect.arrayContaining(['Your RSVP', 'Spring Picnic', 'Lakeside Park', 'You are registered', "Who's coming?", 'M***v S**h', 'P***a S**h', 'Child 1']));
    expect(texts(tree).some((t) => /Oct 19/.test(t) && /10:30 AM/.test(t))).toBe(true);
    expect(hasText(tree, 'Names are partly hidden on purpose.')).toBe(true);
    expect(hasText(tree, 'Show these codes at the entrance.')).toBe(true);
    expect(texts(tree).join(' ')).toContain('Adult · Ticket · Spring Picnic');
    expect(texts(tree).join(' ')).toContain('Child · Ticket · Spring Picnic');
  });

  it('shows a ticket QR for a person only when they tap, and hides it again', async () => {
    mockView.mockResolvedValue(page());
    const tree = await open();
    expect(texts(tree).some((t) => t.startsWith('QR:'))).toBe(false);
    await press(tree, 'Show ticket code for M***v S**h');
    expect(hasText(tree, 'QR:TICKET-1')).toBe(true);
    expect(hasText(tree, 'QR:TICKET-2')).toBe(false);
    await press(tree, 'Hide ticket code for M***v S**h');
    expect(hasText(tree, 'QR:TICKET-1')).toBe(false);
  });

  it('marks a person who has arrived', async () => {
    const base = page() as Extract<ViewAnswer, { ok: true }>;
    mockView.mockResolvedValue({ ...base, canCancel: false, people: base.people.map((p) => (p.slot === 1 ? { ...p, checkedIn: true } : p)) });
    const tree = await open();
    expect(hasText(tree, 'Checked in')).toBe(true);
  });

  it('cancels after asking, then shows the RSVP as cancelled with no tickets', async () => {
    mockView.mockResolvedValueOnce(page());
    const tree = await open();
    expect(has(tree, "We can't make it")).toBe(true);
    await press(tree, "We can't make it");
    expect(hasText(tree, 'Cancel this RSVP for 3 people?')).toBe(true);
    expect(mockCancel).not.toHaveBeenCalled();
    mockCancel.mockResolvedValue({ ok: true, status: 'cancelled' });
    mockView.mockResolvedValue(cancelledPage());
    await press(tree, 'Yes, cancel it');
    expect(mockCancel).toHaveBeenCalledWith(TOKEN);
    expect(hasText(tree, 'This RSVP was cancelled')).toBe(true);
    expect(hasText(tree, 'The places were let go and the tickets no longer work.')).toBe(true);
    expect(has(tree, "We can't make it")).toBe(false);
    expect(texts(tree).join(' ')).not.toContain('Person 1');
  });

  it('keeps the RSVP when the family says keep it', async () => {
    mockView.mockResolvedValue(page());
    const tree = await open();
    await press(tree, "We can't make it");
    await press(tree, 'Keep it');
    expect(mockCancel).not.toHaveBeenCalled();
    expect(has(tree, "We can't make it")).toBe(true);
  });

  it('counts only the people whose places are still held in the question', async () => {
    const base = page() as Extract<ViewAnswer, { ok: true }>;
    mockView.mockResolvedValue({ ...base, people: base.people.map((p) => (p.slot === 3 ? { ...p, status: 'cancelled', ticket: null } : p)) });
    const tree = await open();
    await press(tree, "We can't make it");
    expect(hasText(tree, 'Cancel this RSVP for 2 people?')).toBe(true);
  });

  it('says why it cannot be cancelled any more, in words, when the database says so', async () => {
    mockView.mockResolvedValue(page({ canCancel: false }));
    const tree = await open();
    expect(has(tree, "We can't make it")).toBe(false);
    expect(hasText(tree, 'This RSVP can no longer be cancelled here. Please speak to the event team.')).toBe(true);
  });

  it('says it when the database turns the cancel down (someone arrived), and reads the page again', async () => {
    mockView.mockResolvedValue(page());
    const tree = await open();
    await press(tree, "We can't make it");
    mockCancel.mockResolvedValue({ ok: false, code: 'too_late', message: 'x' });
    await press(tree, 'Yes, cancel it');
    expect(hasText(tree, 'This RSVP can no longer be changed here because someone has already arrived. Please speak to the event team.')).toBe(true);
    expect(mockView).toHaveBeenCalledTimes(2);
  });

  it('shows a cancel that failed on the way with a retry', async () => {
    mockView.mockResolvedValue(page());
    const tree = await open();
    await press(tree, "We can't make it");
    mockCancel.mockRejectedValueOnce(new AppError("We couldn't cancel your RSVP. Check your internet connection and try again.", 'network error'));
    await press(tree, 'Yes, cancel it');
    expect(hasText(tree, "We couldn't cancel your RSVP. Check your internet connection and try again.")).toBe(true);
    mockCancel.mockResolvedValue({ ok: true, status: 'cancelled' });
    mockView.mockResolvedValue(cancelledPage());
    await press(tree, 'Try again');
    expect(mockCancel).toHaveBeenCalledTimes(2);
    expect(hasText(tree, 'This RSVP was cancelled')).toBe(true);
  });

  it('opened from "See my tickets" after saving, looks but does not cancel, and says where cancelling is', async () => {
    mockView.mockResolvedValue(page());
    const tree = await open(TOKEN, true);
    expect(hasText(tree, 'M***v S**h')).toBe(true);
    expect(has(tree, "We can't make it")).toBe(false);
    expect(hasText(tree, 'To cancel or change your plans, use the link in your confirmation email.')).toBe(true);
  });

  it('opens the app from the page', async () => {
    mockView.mockResolvedValue(page());
    const tree = await open();
    await press(tree, 'Open the app');
    expect(mockReplace).toHaveBeenCalledWith('/');
  });
});

describe('when the link does not work, in plain words', () => {
  it('does not ask the database about something that cannot be a token', async () => {
    for (const bad of [null, 'abc', `${TOKEN}!`]) {
      mockView.mockReset();
      const tree = await open(bad);
      expect(mockView).not.toHaveBeenCalled();
      expect(hasText(tree, 'This link has expired or is not valid. Use the link in your latest confirmation email, or sign in to see your RSVP.')).toBe(true);
    }
  });

  it('says an expired link has expired', async () => {
    mockView.mockResolvedValue({ ok: false, code: 'expired', message: 'This page timed out. Start again.' });
    const tree = await open();
    expect(hasText(tree, 'This link has expired or is not valid. Use the link in your latest confirmation email, or sign in to see your RSVP.')).toBe(true);
    expect(has(tree, 'Open the app')).toBe(true);
  });

  it('says too many tries and offers to try again', async () => {
    mockView.mockResolvedValueOnce({ ok: false, code: 'rate_limited', message: 'x' });
    const tree = await open();
    expect(hasText(tree, 'Too many tries from this phone. Please wait a few minutes and try again.')).toBe(true);
    mockView.mockResolvedValue(page());
    await press(tree, 'Try again');
    expect(hasText(tree, 'Spring Picnic')).toBe(true);
  });

  it('says a connection fault with a retry', async () => {
    mockView.mockRejectedValueOnce(new AppError("We couldn't load your RSVP. Check your internet connection and try again.", 'network error'));
    mockView.mockResolvedValue(page());
    const tree = await open();
    expect(hasText(tree, "We couldn't load your RSVP. Check your internet connection and try again.")).toBe(true);
    await press(tree, 'Try again');
    expect(hasText(tree, 'Spring Picnic')).toBe(true);
  });

  it('says a code it does not know with the database’s own sentence', async () => {
    mockView.mockResolvedValue({ ok: false, code: 'brand_new', message: 'Something new happened.' });
    const tree = await open();
    expect(hasText(tree, 'Something new happened.')).toBe(true);
  });
});

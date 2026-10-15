import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { ReactNode } from 'react';
import { Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import renderer, { act, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';

import EventScreen from '@/app/(app)/event/[id]';
import type { EventRow } from '@/lib/api/events';
import { SettingsProvider } from '@/providers/settings';

// The event screen with "RSVP without signing in" in it (connect-crm docs/RSVP_WITHOUT_LOGIN.md section 2): drawn only for a visitor who
// is not signed in, on an event that offers it; a signed-in member keeps the RSVP form and sees nothing new.

const mockFindEvent = jest.fn<() => Promise<EventRow | null>>();
const mockApp: { center: unknown; member: unknown; guest: boolean; setGuest: (v: boolean) => void } = { center: null, member: null, guest: true, setGuest: () => undefined };

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn(), replace: jest.fn() }), useLocalSearchParams: () => ({ id: 'e1' }) }));
jest.mock('expo-web-browser', () => ({ openBrowserAsync: async () => undefined }));
jest.mock('@/providers/app', () => ({ useApp: () => mockApp }));
jest.mock('@/providers/data-version', () => ({ useDataVersion: () => ({ version: 0, invalidate: () => undefined }) }));
jest.mock('@/providers/feedback', () => ({ useFeedback: () => ({ payNotice: () => undefined }) }));
jest.mock('@/features/event-flyer', () => ({ EventFlyer: () => null }));
jest.mock('@/features/pay', () => ({ startPayment: async () => undefined }));
jest.mock('@/lib/storage', () => ({ readPref: async (_k: string, fallback: unknown) => fallback, writePref: async () => undefined }));
jest.mock('@/lib/api/events', () => {
  const real = jest.requireActual<typeof import('@/lib/api/events')>('@/lib/api/events');
  return {
    ...real,
    findEvent: () => mockFindEvent(),
    getHouseholdRsvp: async () => null,
    listAttendees: async () => [],
    getPledgeById: async () => null,
  };
});
jest.mock('@/components/screen', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createElement } = require('react') as typeof import('react');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { View } = require('react-native') as typeof import('react-native');
  return { Screen: ({ children }: { children: ReactNode }) => createElement(View, null, children) };
});

const insets = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
const soon = new Date(Date.now() + 5 * 86_400_000).toISOString();

const event = (over: Partial<EventRow> = {}): EventRow =>
  ({
    id: 'e1',
    center_id: 'c1',
    name: 'Spring Picnic',
    description: null,
    venue: null,
    starts_at: soon,
    ends_at: null,
    status: 'published',
    audience: 'members_and_guests',
    contact_rsvp: 'open',
    is_paid: false,
    confidential: false,
    rsvp_opens_at: null,
    rsvp_closes_at: null,
    lunch_enabled: false,
    attendee_flags: [],
    commitment_options: {},
    ...over,
  }) as EventRow;

const member = {
  isAdult: true,
  today: '2026-10-16',
  household: { id: 'h1', display_name: 'Shah family' },
  membership: null,
  members: [{ role: 'self', isAdult: true, person: { id: 'p1', first_name: 'Priya', last_name: 'Shah', preferred_name: null, date_of_birth: null } }],
};

const flat = (node: ReactTestInstance): string =>
  [node.props.children]
    .flat(Infinity)
    .map((c: unknown) => (typeof c === 'string' || typeof c === 'number' ? String(c) : ''))
    .join('');
const texts = (tree: ReactTestRenderer): string[] => tree.root.findAllByType(Text).map(flat).filter(Boolean);
const hasText = (tree: ReactTestRenderer, s: string): boolean => texts(tree).some((t) => t === s);
const hasButton = (tree: ReactTestRenderer, label: string): boolean => tree.root.findAll((n) => n.props.accessibilityRole === 'button' && n.props.accessibilityLabel === label && typeof n.props.onPress === 'function').length > 0;

const mounted: ReactTestRenderer[] = [];
async function open(e: EventRow | null, who: { guest: boolean; member: unknown }): Promise<ReactTestRenderer> {
  mockFindEvent.mockResolvedValue(e);
  mockApp.member = who.member;
  mockApp.guest = who.guest;
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(
      <SafeAreaProvider initialMetrics={insets}>
        <SettingsProvider>
          <EventScreen />
        </SettingsProvider>
      </SafeAreaProvider>,
    );
  });
  mounted.push(tree);
  return tree;
}

beforeEach(() => {
  mockFindEvent.mockReset();
  mockApp.center = { id: 'c1', short_name: 'Lakeside Club', time_zone: 'America/Chicago', rules: null };
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(async () => {
  await act(async () => {
    for (const tree of mounted.splice(0)) tree.unmount();
  });
  jest.restoreAllMocks();
});

describe('a visitor who is not signed in', () => {
  it('sees the sign-in card as before, and under it "RSVP without signing in" when the event offers it', async () => {
    const tree = await open(event(), { guest: true, member: null });
    expect(hasText(tree, 'Sign in to RSVP for your family.')).toBe(true);
    expect(hasButton(tree, 'Sign in')).toBe(true);
    expect(hasButton(tree, 'RSVP without signing in')).toBe(true);
  });

  it('sees it for an event that asks for a code too', async () => {
    const tree = await open(event({ contact_rsvp: 'code' }), { guest: true, member: null });
    expect(hasButton(tree, 'RSVP without signing in')).toBe(true);
  });

  it('sees nothing new when the event has the switch off (the default): only the sign-in card', async () => {
    const tree = await open(event({ contact_rsvp: 'off' }), { guest: true, member: null });
    expect(hasText(tree, 'Sign in to RSVP for your family.')).toBe(true);
    expect(hasButton(tree, 'RSVP without signing in')).toBe(false);
    expect(hasText(tree, 'Use the mobile number or email address we have for your family.')).toBe(false);
  });

  it('sees nothing new once the RSVPs are closed or have not opened', async () => {
    const closed = await open(event({ status: 'rsvp_closed' }), { guest: true, member: null });
    expect(hasButton(closed, 'RSVP without signing in')).toBe(false);
    const later = await open(event({ rsvp_opens_at: new Date(Date.now() + 86_400_000).toISOString() }), { guest: true, member: null });
    expect(hasButton(later, 'RSVP without signing in')).toBe(false);
  });

  it('sees nothing new on a paid event', async () => {
    const tree = await open(event({ is_paid: true }), { guest: true, member: null });
    expect(hasButton(tree, 'RSVP without signing in')).toBe(false);
  });
});

describe('a signed-in member', () => {
  it('keeps the RSVP form and sees nothing of "RSVP without signing in", whatever the event offers', async () => {
    for (const contact_rsvp of ['open', 'code', 'off']) {
      const tree = await open(event({ contact_rsvp }), { guest: false, member });
      expect(hasText(tree, "Who's coming?")).toBe(true);
      expect(hasButton(tree, 'RSVP 1 person')).toBe(true);
      expect(hasButton(tree, 'RSVP without signing in')).toBe(false);
      expect(hasText(tree, 'Sign in to RSVP for your family.')).toBe(false);
    }
  });
});

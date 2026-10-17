import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { ReactElement, ReactNode } from 'react';
import { Text, TextInput } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import renderer, { act, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';

import MatchingScreen from '@/app/(app)/matching';
import { MatchEntryCard } from '@/features/matching/entry';
import { AppError } from '@/lib/errors';
import { parseMatchCard, type MatchCard } from '@/lib/match';
import { SettingsProvider } from '@/providers/settings';

const mockLoad = jest.fn<() => Promise<MatchCard>>();
const mockSet = jest.fn<(centerId: string, employer: string) => Promise<string>>();
const mockRemove = jest.fn<(centerId: string) => Promise<boolean>>();
const mockReport = jest.fn<(centerId: string) => Promise<number>>();
const mockUndo = jest.fn<(centerId: string, claim: string) => Promise<void>>();
const mockConfirm = jest.fn<(opts: Record<string, unknown>) => Promise<boolean>>();
const mockToast = jest.fn<(message: string) => void>();
const mockInvalidate = jest.fn();
const mockPush = jest.fn<(href: unknown) => void>();
const mockBrowser = jest.fn<(url: string) => Promise<void>>();
const mockCopy = jest.fn<(text: string) => Promise<'copied' | 'shared' | 'dismissed'>>();
const mockApp: { member: unknown; center: unknown; setGuest: () => void } = { member: null, center: null, setGuest: () => undefined };

jest.mock('expo-router', () => ({ useRouter: () => ({ push: (href: unknown) => mockPush(href), dismissTo: () => undefined }) }));
jest.mock('expo-web-browser', () => ({ openBrowserAsync: (url: string) => mockBrowser(url) }));
jest.mock('@/lib/clipboard', () => ({ copyText: (text: string) => mockCopy(text) }));
jest.mock('@/providers/app', () => ({ useApp: () => mockApp }));
jest.mock('@/providers/data-version', () => ({ useDataVersion: () => ({ version: 0, invalidate: () => mockInvalidate() }) }));
jest.mock('@/providers/feedback', () => ({ useFeedback: () => ({ toast: (m: string) => mockToast(m), confirm: (o: Record<string, unknown>) => mockConfirm(o) }) }));
jest.mock('@/lib/storage', () => ({ readPref: async (_k: string, fallback: unknown) => fallback, writePref: async () => undefined }));
jest.mock('@/lib/api/match', () => ({
  loadMatchCard: () => mockLoad(),
  setMyMatchEmployer: (c: string, e: string) => mockSet(c, e),
  removeMyMatchEmployer: (c: string) => mockRemove(c),
  reportMyMatchRequest: (c: string) => mockReport(c),
  undoMyMatchRequest: (c: string, id: string) => mockUndo(c, id),
}));
jest.mock('@/components/screen', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createElement } = require('react') as typeof import('react');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { View } = require('react-native') as typeof import('react-native');
  return { Screen: ({ children }: { children: ReactNode }) => createElement(View, null, children) };
});

// The first render loads the whole component tree.
jest.setTimeout(30_000);

const insets = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };

const FULL = {
  employer: 'Acme Corp',
  source: 'member',
  consented_at: '2026-10-01T10:00:00Z',
  withdrawn_at: null,
  suggestion: null,
  is_adult: true,
  matching_on: true,
  program: { id: 'pg1', company_name: 'Acme Corp', portal: 'Benevity', portal_url: 'https://acme.benevity.org/donate', deadline_note: 'Within 90 days of the gift' },
  process: {
    summary: 'Acme matches gifts one to one through its giving portal.',
    who_submits: 'member',
    steps: ['Sign in to the giving portal.', 'Choose your organization by its registered name and tax ID.', 'Enter the date of your gift.'],
    documents: ['Your receipt', 'Your employee number'],
    links: [
      { label: 'Acme giving guide', url: 'https://acme.example/giving' },
      { label: 'Plain link', url: 'http://acme.example/plain' },
      { label: 'Script link', url: 'javascript:alert(1)' },
    ],
    typical_days: 14,
    tips: 'Ask early in the year.',
  },
  org: { name: 'Riverbend Community', legal_name: 'Riverbend Community Association Inc.', ein: '12-3456789' },
  gifts: [
    { received_on: '2026-10-03', deadline_on: '2026-11-30' },
    { received_on: '2026-09-12', deadline_on: null },
  ],
  claims: [
    { id: 'c1', state: 'requested', state_at: '2026-10-10T12:00:00Z', company_name: 'Acme Corp', received_on: '2026-08-20', deadline_on: '2026-11-18', reported_by_member: true, can_undo: true },
    { id: 'c2', state: 'received', state_at: '2026-09-30T12:00:00Z', company_name: 'Acme Corp', received_on: '2026-07-04', deadline_on: null, reported_by_member: false, can_undo: false },
    { id: 'c3', state: 'asked', state_at: '2026-09-20T12:00:00Z', company_name: 'Acme Corp', received_on: '2026-09-01', deadline_on: '2026-12-01', reported_by_member: false, can_undo: false },
  ],
  today: '2026-10-17',
};

const NO_EMPLOYER = { ...FULL, employer: null, source: null, consented_at: null, program: null, process: null, gifts: [], claims: [] };
const NO_STEPS = { ...FULL, program: null, process: null, gifts: [] };

const card = (raw: Record<string, unknown>): MatchCard => {
  const parsed = parseMatchCard(raw);
  if (!parsed) throw new Error('fixture');
  return parsed;
};

async function render(el: ReactElement): Promise<ReactTestRenderer> {
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(
      <SafeAreaProvider initialMetrics={insets}>
        <SettingsProvider>{el}</SettingsProvider>
      </SafeAreaProvider>,
    );
  });
  return tree;
}

const flat = (node: ReactTestInstance): string =>
  [node.props.children]
    .flat(Infinity)
    .map((c: unknown) => (typeof c === 'string' || typeof c === 'number' ? String(c) : ''))
    .join('');
const texts = (tree: ReactTestRenderer): string[] => tree.root.findAllByType(Text).map(flat).filter(Boolean);
const has = (tree: ReactTestRenderer, s: string): boolean => texts(tree).some((t) => t.trim() === s);
const isPressable = (n: ReactTestInstance): boolean => typeof n.props.onPress === 'function' && typeof n.props.accessibilityRole === 'string';
const pressables = (tree: ReactTestRenderer, label: string): ReactTestInstance[] =>
  tree.root.findAll((n) => isPressable(n) && (n.props.accessibilityLabel === label || (n.props.accessibilityLabel === undefined && n.findAllByType(Text).some((x) => flat(x) === label))));
const hasButton = (tree: ReactTestRenderer, label: string): boolean => pressables(tree, label).length > 0;
const press = async (tree: ReactTestRenderer, label: string): Promise<void> => {
  const hit = pressables(tree, label)[0];
  if (!hit) throw new Error(`nothing to press called "${label}"`);
  await act(async () => {
    hit.props.onPress();
  });
};
const field = (tree: ReactTestRenderer): ReactTestInstance => {
  const hit = tree.root.findAllByType(TextInput).find((n) => n.props.accessibilityLabel === 'Where do you work?');
  if (!hit) throw new Error('no employer field');
  return hit;
};
const type = async (tree: ReactTestRenderer, value: string): Promise<void> => {
  await act(async () => {
    field(tree).props.onChangeText(value);
  });
};

async function open(raw: Record<string, unknown> | null, opts: { adult?: boolean } = {}): Promise<ReactTestRenderer> {
  if (raw) mockLoad.mockResolvedValue(card(raw));
  mockApp.member = { isAdult: opts.adult ?? true, household: { id: 'h1' }, today: '2026-10-17' };
  return render(<MatchingScreen />);
}

beforeEach(() => {
  for (const m of [mockLoad, mockSet, mockRemove, mockReport, mockUndo, mockConfirm, mockToast, mockInvalidate, mockPush, mockBrowser, mockCopy]) m.mockReset();
  mockApp.center = { id: 'c1', short_name: 'Riverbend' };
  mockConfirm.mockResolvedValue(true);
  mockBrowser.mockResolvedValue(undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('Does your employer match? with no employer on file', () => {
  it('says plainly how the employer is kept, and asks for it with the consent next to the button', async () => {
    const tree = await open(NO_EMPLOYER);
    const all = texts(tree);
    expect(all.some((t) => t.includes('kept only with your consent') && t.includes('only to help you ask for a match') && t.includes('remove it any time'))).toBe(true);
    expect(all).toContain('Your employer');
    expect(all).toContain('Adding it is your consent for your organization to keep it. It is used only to help you ask for a match, and you can remove it any time.');
    expect(hasButton(tree, 'Add my employer')).toBe(true);
    // Nothing else until there is an employer: no steps, no gifts, no requests.
    expect(all.some((t) => t.startsWith('How to ask'))).toBe(false);
    expect(hasButton(tree, 'I have asked my employer')).toBe(false);
    expect(has(tree, 'Your requests')).toBe(false);
  });

  it('adds what was typed, tidied, and says so only after the database has it', async () => {
    mockSet.mockResolvedValue('Acme Corp');
    const tree = await open(NO_EMPLOYER);
    await type(tree, '  Acme   Corp ');
    await press(tree, 'Add my employer');
    expect(mockSet).toHaveBeenCalledWith('c1', 'Acme Corp');
    expect(mockToast).toHaveBeenCalledWith('Your employer was added.');
    expect(mockInvalidate).toHaveBeenCalledTimes(1);
  });

  it('does not ask the database for an empty name, and says what to do', async () => {
    const tree = await open(NO_EMPLOYER);
    await press(tree, 'Add my employer');
    expect(mockSet).not.toHaveBeenCalled();
    expect(has(tree, "Type your employer's name first.")).toBe(true);
    expect(mockToast).not.toHaveBeenCalled();
  });

  it('offers the employer on the profile to confirm with one button', async () => {
    mockSet.mockResolvedValue('Globex');
    const tree = await open({ ...NO_EMPLOYER, suggestion: 'Globex' });
    expect(has(tree, 'Is Globex still your employer?')).toBe(true);
    await press(tree, 'Yes, add Globex');
    expect(mockSet).toHaveBeenCalledWith('c1', 'Globex');
    expect(mockToast).toHaveBeenCalledWith('Your employer was added.');
  });

  it('shows a refusal next to the button, with a retry that tries the same thing again, and never says it was added', async () => {
    mockSet.mockRejectedValueOnce(new AppError('Could not save your employer — Gift matching is not on for this community.', 'refused', '42501'));
    mockSet.mockResolvedValueOnce('Acme Corp');
    const tree = await open(NO_EMPLOYER);
    await type(tree, 'Acme Corp');
    await press(tree, 'Add my employer');
    expect(has(tree, 'Could not save your employer — Gift matching is not on for this community.')).toBe(true);
    expect(mockToast).not.toHaveBeenCalled();
    expect(mockInvalidate).not.toHaveBeenCalled();
    await press(tree, 'Try again');
    expect(mockSet).toHaveBeenCalledTimes(2);
    expect(mockSet).toHaveBeenLastCalledWith('c1', 'Acme Corp');
    expect(mockToast).toHaveBeenCalledWith('Your employer was added.');
    expect(has(tree, 'Could not save your employer — Gift matching is not on for this community.')).toBe(false);
  });
});

describe('Does your employer match? with an employer on file', () => {
  it('shows the steps for the employer: who asks, the numbered steps, what to have ready, https links, the portal, how long, the tips', async () => {
    const tree = await open(FULL);
    const all = texts(tree);
    expect(all).toContain('Acme Corp');
    expect(all).toContain('On file with your consent');
    expect(all).toContain('How to ask Acme Corp');
    expect(all).toContain('You make the request with your employer.');
    expect(all).toContain('Acme matches gifts one to one through its giving portal.');
    expect(all).toEqual(expect.arrayContaining(['1.', '2.', '3.', 'Sign in to the giving portal.', 'Enter the date of your gift.']));
    expect(all).toEqual(expect.arrayContaining(['Have these ready', 'Your receipt', 'Your employee number']));
    expect(all).toContain('Usually takes about 14 days.');
    expect(all).toContain('Deadline: Within 90 days of the gift');
    expect(all).toContain('Ask early in the year.');
    // Only the https link opens; the plain and the script links are not offered at all.
    expect(hasButton(tree, 'Acme giving guide')).toBe(true);
    expect(hasButton(tree, 'Plain link')).toBe(false);
    expect(hasButton(tree, 'Script link')).toBe(false);
    expect(hasButton(tree, 'Open Benevity')).toBe(true);
    await press(tree, 'Acme giving guide');
    expect(mockBrowser).toHaveBeenCalledWith('https://acme.example/giving');
    await press(tree, 'Open Benevity');
    expect(mockBrowser).toHaveBeenLastCalledWith('https://acme.benevity.org/donate');
  });

  it('shows the organization\'s registered name and tax ID with a copy button for each, and says Copied only when it is copied', async () => {
    mockCopy.mockResolvedValue('copied');
    const tree = await open(FULL);
    expect(texts(tree)).toEqual(expect.arrayContaining(['Registered name', 'Riverbend Community Association Inc.', 'Tax ID', '12-3456789']));
    await press(tree, 'Copy the registered name');
    expect(mockCopy).toHaveBeenLastCalledWith('Riverbend Community Association Inc.');
    expect(mockToast).toHaveBeenLastCalledWith('Copied.');
    mockCopy.mockResolvedValue('shared');
    mockToast.mockReset();
    await press(tree, 'Copy the tax ID');
    expect(mockCopy).toHaveBeenLastCalledWith('12-3456789');
    expect(mockToast).not.toHaveBeenCalled();
  });

  it('says a copy failed instead of pretending', async () => {
    mockCopy.mockRejectedValue(new AppError("We couldn't copy it from here. Press and hold the text to copy it yourself.", 'no clipboard'));
    const tree = await open(FULL);
    await press(tree, 'Copy the tax ID');
    expect(has(tree, "We couldn't copy it from here. Press and hold the text to copy it yourself.")).toBe(true);
    expect(mockToast).not.toHaveBeenCalled();
  });

  it('lists the gifts that can still be claimed by day and last day to ask, with no amount anywhere on the screen', async () => {
    const tree = await open(FULL);
    const all = texts(tree);
    expect(all).toContain('Gifts you can still claim');
    expect(all).toContain('Your gift of Oct 3, 2026');
    expect(all).toContain('Last day to ask: Nov 30, 2026 · 44 days left');
    expect(all).toContain('Your gift of Sep 12, 2026');
    expect(all.filter((t) => /\$|\bcents?\b|\bamount\b/i.test(t))).toEqual([]);
  });

  it('lists the requests with where each stands in the member\'s words, and a way back only for the one that can be taken back', async () => {
    const tree = await open(FULL);
    const all = texts(tree);
    expect(all).toContain('Your requests');
    expect(all).toContain('You said you asked your employer');
    expect(all).toContain('Your employer paid the match to your organization. Thank you');
    expect(all).toContain('Waiting for you to ask your employer');
    expect(pressables(tree, 'Take it back')).toHaveLength(1);
  });

  it('asks before saying "I have asked my employer", does nothing on "Not yet", and tells the plain result after Yes', async () => {
    mockReport.mockResolvedValue(2);
    const tree = await open(FULL);
    mockConfirm.mockResolvedValueOnce(false);
    await press(tree, 'I have asked my employer');
    expect(mockConfirm).toHaveBeenCalledTimes(1);
    expect(mockConfirm.mock.calls[0][0]).toMatchObject({ title: 'Did you ask Acme Corp?', confirmLabel: 'Yes, I asked', cancelLabel: 'Not yet' });
    expect(mockReport).not.toHaveBeenCalled();
    await press(tree, 'I have asked my employer');
    expect(mockReport).toHaveBeenCalledWith('c1');
    expect(mockToast).toHaveBeenCalledWith('Thank you. 2 gifts were marked as asked.');
    expect(mockInvalidate).toHaveBeenCalled();
  });

  it('shows why it could not be recorded next to the button, with a retry, and reads the card again', async () => {
    mockReport.mockRejectedValueOnce(new AppError('Could not record that you asked your employer — You have no gift that can still be claimed.', 'none', '22023'));
    const tree = await open(FULL);
    await press(tree, 'I have asked my employer');
    expect(has(tree, 'Could not record that you asked your employer — You have no gift that can still be claimed.')).toBe(true);
    expect(mockToast).not.toHaveBeenCalled();
    expect(mockInvalidate).toHaveBeenCalledTimes(1);
    mockReport.mockResolvedValueOnce(1);
    await press(tree, 'Try again');
    expect(mockReport).toHaveBeenCalledTimes(2);
    // One confirmation covered both tries.
    expect(mockConfirm).toHaveBeenCalledTimes(1);
    expect(mockToast).toHaveBeenCalledWith('Thank you. 1 gift was marked as asked.');
  });

  it('takes a request back after a confirmation', async () => {
    mockUndo.mockResolvedValue(undefined);
    const tree = await open(FULL);
    await press(tree, 'Take it back');
    expect(mockConfirm.mock.calls[0][0]).toMatchObject({ title: 'Take this request back?', confirmLabel: 'Yes, take it back' });
    expect(mockUndo).toHaveBeenCalledWith('c1', 'c1');
    expect(mockToast).toHaveBeenCalledWith('The request was taken back.');
  });

  it('shows a request that could not be taken back, in the database\'s words', async () => {
    mockUndo.mockRejectedValue(new AppError('Could not take your request back — Your organization has already moved this on, so it cannot be taken back here. Ask them.', 'moved', '22023'));
    const tree = await open(FULL);
    await press(tree, 'Take it back');
    expect(has(tree, 'Could not take your request back — Your organization has already moved this on, so it cannot be taken back here. Ask them.')).toBe(true);
    expect(mockToast).not.toHaveBeenCalled();
    expect(hasButton(tree, 'Try again')).toBe(true);
  });

  it('removes the employer only after the member says yes, and keeps it on "Keep it"', async () => {
    mockRemove.mockResolvedValue(true);
    const tree = await open(FULL);
    mockConfirm.mockResolvedValueOnce(false);
    await press(tree, 'Remove');
    expect(mockConfirm.mock.calls[0][0]).toMatchObject({ title: 'Remove your employer?', confirmLabel: 'Yes, remove it', cancelLabel: 'Keep it', tone: 'danger' });
    expect(mockRemove).not.toHaveBeenCalled();
    await press(tree, 'Remove');
    expect(mockRemove).toHaveBeenCalledWith('c1');
    expect(mockToast).toHaveBeenCalledWith('Your employer was removed.');
  });

  it('changes the employer: the field starts with the name on file, and Cancel puts it back', async () => {
    mockSet.mockResolvedValue('Globex Inc');
    const tree = await open(FULL);
    await press(tree, 'Change');
    expect(field(tree).props.value).toBe('Acme Corp');
    await press(tree, 'Cancel');
    expect(has(tree, 'On file with your consent')).toBe(true);
    await press(tree, 'Change');
    await type(tree, 'Globex Inc');
    await press(tree, 'Save');
    expect(mockSet).toHaveBeenCalledWith('c1', 'Globex Inc');
    expect(mockToast).toHaveBeenCalledWith('Your employer was changed.');
  });

  it('says plainly when the library has no steps for the employer, what to do, and offers nothing to report', async () => {
    const tree = await open(NO_STEPS);
    const all = texts(tree);
    expect(all).toContain('We do not have the steps for Acme Corp yet');
    expect(all.some((t) => t.includes("human resources team or its giving program"))).toBe(true);
    expect(hasButton(tree, 'I have asked my employer')).toBe(false);
    expect(has(tree, 'Gifts you can still claim')).toBe(false);
    // The member's earlier requests are still theirs to see.
    expect(has(tree, 'Your requests')).toBe(true);
  });

  it('says there is nothing to claim when no gift can be, and offers no button for it', async () => {
    const tree = await open({ ...FULL, gifts: [] });
    expect(has(tree, 'You have no gifts that can still be claimed right now.')).toBe(true);
    expect(hasButton(tree, 'I have asked my employer')).toBe(false);
  });
});

describe('Does your employer match? when it is not for this person or this community', () => {
  it('says it is not available when CatchTheMatch is off, and shows nothing else', async () => {
    const tree = await open({ ...FULL, matching_on: false });
    expect(has(tree, 'This is not available for your community.')).toBe(true);
    expect(has(tree, 'Your employer')).toBe(false);
    expect(hasButton(tree, 'Add my employer')).toBe(false);
  });

  it('gives a child "Ask a parent" and does not ask the database anything', async () => {
    const tree = await open(null, { adult: false });
    expect(has(tree, 'Ask a parent')).toBe(true);
    expect(mockLoad).not.toHaveBeenCalled();
  });

  it('gives "Ask a parent" when the database says the person is not an adult', async () => {
    const tree = await open({ ...FULL, is_adult: false });
    expect(has(tree, 'Ask a parent')).toBe(true);
    expect(hasButton(tree, 'Add my employer')).toBe(false);
  });

  it('asks a visitor to sign in', async () => {
    mockApp.member = null;
    const tree = await render(<MatchingScreen />);
    expect(has(tree, 'Sign in to see whether your employer matches your gifts.')).toBe(true);
    expect(mockLoad).not.toHaveBeenCalled();
  });

  it('shows the not-linked sentence with a retry when the card cannot be read, never a blank screen', async () => {
    mockLoad.mockRejectedValue(new AppError('Could not load your employer match — Your sign-in is not linked to a person in this community.', 'not linked', '42501'));
    const tree = await open(null);
    expect(has(tree, 'Could not load your employer match — Your sign-in is not linked to a person in this community.')).toBe(true);
    expect(hasButton(tree, 'Try again')).toBe(true);
    mockLoad.mockResolvedValue(card(NO_EMPLOYER));
    await press(tree, 'Try again');
    expect(hasButton(tree, 'Add my employer')).toBe(true);
  });
});

describe('the card on the Give tab', () => {
  async function entry(raw: Record<string, unknown> | null, opts: { adult?: boolean; fail?: boolean } = {}): Promise<ReactTestRenderer> {
    // A raw failure, as a lost connection can throw: useLoad turns it into words and logs the detail.
    if (opts.fail) mockLoad.mockRejectedValue(new TypeError('Network request failed'));
    else if (raw) mockLoad.mockResolvedValue(card(raw));
    mockApp.member = { isAdult: opts.adult ?? true, household: { id: 'h1' }, today: '2026-10-17' };
    return render(<MatchEntryCard />);
  }

  it('shows for an adult where it is on, with the next step, and opens /matching', async () => {
    const tree = await entry(NO_EMPLOYER);
    expect(has(tree, 'Does your employer match?')).toBe(true);
    expect(has(tree, 'Many employers match donations. Add yours to see how to ask.')).toBe(true);
    await press(tree, 'Does your employer match?. Many employers match donations. Add yours to see how to ask.');
    expect(mockPush).toHaveBeenCalledWith('/matching');
  });

  it('tells how many gifts can still be claimed once the steps are known', async () => {
    const tree = await entry(FULL);
    expect(has(tree, '2 gifts can still be claimed. See how to ask.')).toBe(true);
  });

  it('shows nothing where it is off, for a child, and for a person the database says is not an adult', async () => {
    expect(texts(await entry({ ...FULL, matching_on: false }))).toEqual([]);
    expect(texts(await entry({ ...FULL, is_adult: false }))).toEqual([]);
    mockLoad.mockReset();
    expect(texts(await entry(null, { adult: false }))).toEqual([]);
    expect(mockLoad).not.toHaveBeenCalled();
  });

  it('shows nothing, and does not break, when the read fails', async () => {
    const tree = await entry(null, { fail: true });
    expect(texts(tree)).toEqual([]);
    expect(console.error).toHaveBeenCalled();
  });
});

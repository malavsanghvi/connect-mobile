import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { ReactElement } from 'react';
import { Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import renderer, { act, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';

import { DEMO_LIMITED, parseChoices, type DemoChoices } from '@/lib/demo';
import { DemoContext, type DemoContextValue } from '@/providers/demo';
import { SettingsProvider } from '@/providers/settings';

import { DemoBanner, DemoBannerView } from '../demo/banner';
import { DemoChooserScreen, DemoCommunityStepView, DemoPersonStepView, type ChooserLoad, type DemoPending } from '../demo/chooser';
import { DemoEntry } from '../demo/entry';
import { DemoNote, HiddenInDemo } from '../demo/limits';

// The portal's list, which the chooser screen asks for, and the app state it reads (only whether a real person is signed in).
const mockLoadChoices = jest.fn<() => Promise<DemoChoices>>();
const mockApp: { session: unknown } = { session: null };
jest.mock('@/lib/api/demo', () => ({ loadDemoChoices: () => mockLoadChoices() }));
jest.mock('@/providers/app', () => ({ useApp: () => mockApp }));

// The device storage is not under test; the text size is read from it, so a test can ask for the largest.
const mockPrefs: Record<string, unknown> = {};
jest.mock('@/lib/storage', () => ({
  readPref: async (key: string, fallback: unknown) => (key in mockPrefs ? mockPrefs[key] : fallback),
  writePref: async () => undefined,
}));

const choicesBody = {
  ok: true,
  enabled: true,
  communities: [
    {
      kind: 'faith',
      id: 'c-faith',
      slug: 'demo-worship',
      name: 'Sunrise Worship Center',
      people: [
        { id: 'f-teacher', role: 'Teacher', name: 'Anita Bhandari', story: 'Teaches a class and takes attendance.', area: 'operations' },
        { id: 'f-adult', role: 'Community member · Adult', name: 'Tarun Patni', story: 'The main adult of a family.', area: 'community' },
        { id: 'f-treasurer', role: 'Treasurer', name: 'Meera Doshiwal', story: 'Keeps the books.', area: 'operations' },
      ],
    },
    {
      kind: 'neutral',
      id: 'c-club',
      slug: 'demo-club',
      name: 'Lakeside Neighbors Club',
      people: [
        { id: 'n-adult', role: 'Community member · Adult', name: 'Kwame Osei', story: 'The main adult of a family.', area: 'community' },
        { id: 'n-lead', role: 'Event lead', name: 'Irina Petrov', story: 'Runs one event.', area: 'operations' },
      ],
    },
  ],
};
const choices = (body: unknown = choicesBody): DemoChoices => {
  const parsed = parseChoices(body);
  if (!parsed) throw new Error('bad fixture');
  return parsed;
};
const ready = (body?: unknown): ChooserLoad => ({ status: 'ready', choices: choices(body) });

const insets = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };

function inert(over: Partial<DemoContextValue> = {}): DemoContextValue {
  return {
    available: true,
    ready: true,
    mode: 'off',
    guest: false,
    active: false,
    info: null,
    guestCommunity: null,
    secondsLeft: 0,
    slug: null,
    starting: false,
    choosing: false,
    chooser: null,
    notice: null,
    startError: null,
    canRetry: false,
    peopleOf: null,
    openChooser: jest.fn(),
    closeChooser: jest.fn(),
    openPeople: jest.fn(),
    enterGuest: jest.fn(async () => undefined),
    start: jest.fn(async () => ({ ok: true as const, session: { access_token: 'a', refresh_token: 'r' }, demo: { endsAt: '', role: '', name: '', community: '' } })),
    retryStart: jest.fn(),
    toGuest: jest.fn(async () => undefined),
    leave: jest.fn(async () => undefined),
    ...over,
  };
}

async function render(el: ReactElement, demo?: DemoContextValue): Promise<ReactTestRenderer> {
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(
      <SafeAreaProvider initialMetrics={insets}>
        <SettingsProvider>{demo ? <DemoContext.Provider value={demo}>{el}</DemoContext.Provider> : el}</SettingsProvider>
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

/** Every piece of visible text, in the order it is drawn. */
const texts = (tree: ReactTestRenderer): string[] => tree.root.findAllByType(Text).map(flat).filter(Boolean);
const hasText = (tree: ReactTestRenderer, s: string): boolean => texts(tree).some((t) => t === s);

/** The pressables with this spoken name (the composite that owns onPress). */
/** A control the user can press: it has a handler and says what kind of control it is (Button, text links and cards all do). */
const isPressable = (n: ReactTestInstance): boolean => typeof n.props.onPress === 'function' && typeof n.props.accessibilityRole === 'string';

const pressables = (tree: ReactTestRenderer, label: string): ReactTestInstance[] =>
  tree.root.findAll(
    (n) =>
      isPressable(n) &&
      // A button is named by its accessibilityLabel; a text link, by the words on it.
      (n.props.accessibilityLabel === label || (n.props.accessibilityLabel === undefined && n.findAllByType(Text).some((x) => flat(x) === label))),
  );

/** Nothing is drawn (the safe-area wrapper the tests add around everything does not count). */
const drawsNothing = (tree: ReactTestRenderer): boolean => tree.root.findAll((n) => typeof n.type === 'string' && String(n.type) !== 'RNCSafeAreaProvider').length === 0;
const press = async (tree: ReactTestRenderer, label: string): Promise<void> => {
  const hit = pressables(tree, label)[0];
  if (!hit) throw new Error(`nothing to press called "${label}". Pressables: ${tree.root.findAll(isPressable).map((n) => n.props.accessibilityLabel).join(' | ')}`);
  await act(async () => {
    hit.props.onPress();
  });
};
const styleOf = (n: ReactTestInstance): Record<string, unknown> => {
  const s = n.props.style;
  const resolved = typeof s === 'function' ? s({ pressed: false }) : s;
  return Object.assign({}, ...[resolved].flat(Infinity).filter(Boolean)) as Record<string, unknown>;
};

beforeEach(() => {
  for (const k of Object.keys(mockPrefs)) delete mockPrefs[k];
});
afterEach(() => {
  jest.restoreAllMocks();
});

describe('the "Try the demo" button on Find your community', () => {
  it('shows the short copy and the button when the build has a demo', async () => {
    const demo = inert({ available: true });
    const tree = await render(<DemoEntry />, demo);
    expect(hasText(tree, 'Just looking?')).toBe(true);
    expect(hasText(tree, 'See the app as a family, a volunteer or a teacher. Nothing real is sent.')).toBe(true);
    await press(tree, 'Try the demo');
    expect(demo.openChooser).toHaveBeenCalledTimes(1);
  });

  it('is not there at all when the build has no demo address configured', async () => {
    const tree = await render(<DemoEntry />, inert({ available: false }));
    expect(drawsNothing(tree)).toBe(true);
  });

  it('is not there outside any provider either (the inert default offers nothing)', async () => {
    const tree = await render(<DemoEntry />);
    expect(drawsNothing(tree)).toBe(true);
  });

  it('is a button at least 48 px tall that a screen reader can name', async () => {
    const tree = await render(<DemoEntry />, inert());
    const [button] = pressables(tree, 'Try the demo');
    expect(Number(styleOf(button).minHeight)).toBeGreaterThanOrEqual(48);
    expect(button.props.accessibilityRole).toBe('button');
    expect(button.props.accessibilityHint).toBeTruthy();
  });
});

describe('step 1: which demo community (one tap to the family Home)', () => {
  const props = { pending: null as DemoPending, onFamily: jest.fn(), onGuest: jest.fn(), onPeople: jest.fn(), onRetryLoad: jest.fn(), onBack: jest.fn() };

  it('says it is loading', async () => {
    const tree = await render(<DemoCommunityStepView {...props} load={{ status: 'loading' }} />);
    expect(hasText(tree, 'Loading the demo…')).toBe(true);
  });

  it('says it could not load, in plain words, with Try again', async () => {
    const onRetryLoad = jest.fn();
    const tree = await render(<DemoCommunityStepView {...props} onRetryLoad={onRetryLoad} load={{ status: 'error', message: "We couldn't load the demo. Check your internet connection and try again." }} />);
    expect(hasText(tree, "We couldn't load the demo. Check your internet connection and try again.")).toBe(true);
    await press(tree, 'Try again');
    expect(onRetryLoad).toHaveBeenCalledTimes(1);
  });

  it('says the demo is switched off, with Try again', async () => {
    const tree = await render(<DemoCommunityStepView {...props} load={ready({ ok: true, enabled: false, communities: [] })} />);
    expect(hasText(tree, 'The demo is switched off right now. Please try again later.')).toBe(true);
    expect(pressables(tree, 'Try again')).toHaveLength(1);
  });

  it('shows the portal’s own message when it sent one (switched off, or nothing set up yet)', async () => {
    const off = await render(
      <DemoCommunityStepView {...props} load={ready({ ok: true, enabled: false, communities: [], message: 'The demo is switched off for maintenance. Back soon.' })} />,
    );
    expect(hasText(off, 'The demo is switched off for maintenance. Back soon.')).toBe(true);
    const empty = await render(
      <DemoCommunityStepView {...props} load={ready({ ok: true, enabled: true, communities: [], message: 'The demo is not ready yet. Please try again later.' })} />,
    );
    expect(hasText(empty, 'The demo is not ready yet. Please try again later.')).toBe(true);
  });

  it('says nothing is ready yet when there are no communities', async () => {
    const tree = await render(<DemoCommunityStepView {...props} load={ready({ ok: true, enabled: true, communities: [] })} />);
    expect(hasText(tree, 'No demo communities are ready yet. Please try again later.')).toBe(true);
  });

  it('says the communities are not open yet when the portal names neither a web name nor a family for any of them', async () => {
    const bare = { ...choicesBody, communities: choicesBody.communities.map((c) => ({ ...c, slug: undefined, people: c.people.filter((p) => p.area !== 'community') })) };
    const tree = await render(<DemoCommunityStepView {...props} load={ready(bare)} />);
    expect(hasText(tree, 'The demo communities are not open to guests yet. Please try again later.')).toBe(true);
    expect(pressables(tree, 'Try again')).toHaveLength(1);
  });

  it('still offers the one-tap button for a community the portal names no web name for (only the guest ways need it)', async () => {
    const noSlugs = { ...choicesBody, communities: choicesBody.communities.map((c) => ({ ...c, slug: undefined })) };
    const tree = await render(<DemoCommunityStepView {...props} load={ready(noSlugs)} />);
    expect(pressables(tree, 'Start as a community member')).toHaveLength(2);
    expect(pressables(tree, 'Look around as a guest')).toHaveLength(0);
    expect(pressables(tree, 'Choose someone else')).toHaveLength(0);
  });

  it('lists the communities, faith-based first, each with ONE main button: Start as a community member', async () => {
    const tree = await render(<DemoCommunityStepView {...props} load={ready()} />);
    const all = texts(tree);
    expect(all.indexOf('Sunrise Worship Center')).toBeGreaterThan(-1);
    expect(all.indexOf('Sunrise Worship Center')).toBeLessThan(all.indexOf('Lakeside Neighbors Club'));
    expect(all).toEqual(expect.arrayContaining(['Faith-based', 'Not faith-based', 'A place of worship with classes, pledges, events and a store.']));
    const starts = pressables(tree, 'Start as a community member');
    expect(starts).toHaveLength(2);
    expect(Number(styleOf(starts[0]).minHeight)).toBeGreaterThanOrEqual(48);
    expect(starts[0].props.accessibilityRole).toBe('button');
    expect(starts[0].props.accessibilityHint).toBe('Signs in as Tarun Patni and opens the Home of Sunrise Worship Center');
    // The portal's sentence about who that is stays on the card, so the person is not a surprise.
    expect(hasText(tree, 'The main adult of a family.')).toBe(true);
  });

  it('starts as the family person in ONE tap: the person the portal lists in the community area, and the card it came from', async () => {
    const onFamily = jest.fn();
    const tree = await render(<DemoCommunityStepView {...props} onFamily={onFamily} load={ready()} />);
    await press(tree, 'Start as a community member');
    expect(onFamily).toHaveBeenCalledTimes(1);
    expect(onFamily).toHaveBeenCalledWith('f-adult', 'demo-worship');
    await act(async () => {
      pressables(tree, 'Start as a community member')[1].props.onPress();
    });
    expect(onFamily).toHaveBeenLastCalledWith('n-adult', 'demo-club');
    // Neither of the quiet ways was involved.
    expect(props.onGuest).not.toHaveBeenCalled();
    expect(props.onPeople).not.toHaveBeenCalled();
  });

  it('keeps Look around as a guest and Choose someone else as quiet actions on the same card, and they still work', async () => {
    const onGuest = jest.fn();
    const onPeople = jest.fn();
    const onFamily = jest.fn();
    const tree = await render(<DemoCommunityStepView {...props} onFamily={onFamily} onGuest={onGuest} onPeople={onPeople} load={ready()} />);
    const guests = pressables(tree, 'Look around as a guest');
    const others = pressables(tree, 'Choose someone else');
    expect(guests).toHaveLength(2);
    expect(others).toHaveLength(2);
    for (const quiet of [...guests, ...others]) expect(Number(styleOf(quiet).minHeight)).toBeGreaterThanOrEqual(44);
    expect(guests[0].props.accessibilityHint).toBe('Opens Sunrise Worship Center without signing in');
    expect(others[0].props.accessibilityHint).toBe('Shows the people of Sunrise Worship Center to start as');
    await act(async () => {
      guests[1].props.onPress();
    });
    expect(onGuest).toHaveBeenCalledWith({ slug: 'demo-club', name: 'Lakeside Neighbors Club' }, 'demo-club');
    await act(async () => {
      others[0].props.onPress();
    });
    expect(onPeople).toHaveBeenCalledWith('demo-worship');
    expect(onFamily).not.toHaveBeenCalled();
  });

  it('keeps Look around as a guest as the main button of a community with no family to start as', async () => {
    const noFamily = { ...choicesBody, communities: choicesBody.communities.map((c) => ({ ...c, people: c.people.filter((p) => p.area !== 'community') })) };
    const onGuest = jest.fn();
    const tree = await render(<DemoCommunityStepView {...props} onGuest={onGuest} load={ready(noFamily)} />);
    expect(pressables(tree, 'Start as a community member')).toHaveLength(0);
    const guests = pressables(tree, 'Look around as a guest');
    expect(guests).toHaveLength(2);
    await act(async () => {
      guests[0].props.onPress();
    });
    expect(onGuest).toHaveBeenCalledWith({ slug: 'demo-worship', name: 'Sunrise Worship Center' }, 'demo-worship');
  });

  it('says Starting the demo… on the card that was tapped, and holds every card while it works', async () => {
    const tree = await render(<DemoCommunityStepView {...props} pending={{ key: 'demo-worship', action: 'family' }} load={ready()} />);
    const [busy] = pressables(tree, 'Starting the demo…');
    expect(busy.props.accessibilityState).toMatchObject({ busy: true });
    // The other community's button waits too, and so do the quiet ways.
    expect(pressables(tree, 'Start as a community member')[0].props.disabled).toBe(true);
    for (const quiet of [...pressables(tree, 'Look around as a guest'), ...pressables(tree, 'Choose someone else')]) expect(quiet.props.disabled).toBe(true);
  });

  it('says Opening the demo community… while a guest look around opens, and holds every card', async () => {
    const tree = await render(<DemoCommunityStepView {...props} pending={{ key: 'demo-club', action: 'guest' }} load={ready()} />);
    expect(hasText(tree, 'Opening the demo community…')).toBe(true);
    for (const start of pressables(tree, 'Start as a community member')) expect(start.props.disabled).toBe(true);
  });

  it('shows a start that started on its own (Try again, a link) as Starting the demo… with every card waiting', async () => {
    const tree = await render(<DemoCommunityStepView {...props} pending={{ key: '', action: 'family' }} load={ready()} />);
    expect(hasText(tree, 'Starting the demo…')).toBe(true);
    for (const start of pressables(tree, 'Start as a community member')) expect(start.props.disabled).toBe(true);
  });

  it('says a failed start in plain words above the list, with Try again that repeats it', async () => {
    const onRetryStart = jest.fn();
    const sentence = 'Could not start the demo — you have started a lot of demos in the last hour. Please wait a while, then try again.';
    const tree = await render(<DemoCommunityStepView {...props} startError={sentence} onRetryStart={onRetryStart} load={ready()} />);
    expect(hasText(tree, sentence)).toBe(true);
    const all = texts(tree);
    expect(all.indexOf(sentence)).toBeLessThan(all.indexOf('Sunrise Worship Center'));
    await press(tree, 'Try again');
    expect(onRetryStart).toHaveBeenCalledTimes(1);
  });

  it('says why without Try again when trying the same thing again cannot help (a person that is not on the list)', async () => {
    const sentence = "We couldn't start the demo — that person is not available. Choose someone else.";
    const tree = await render(<DemoCommunityStepView {...props} startError={sentence} load={ready()} />);
    expect(hasText(tree, sentence)).toBe(true);
    expect(pressables(tree, 'Try again')).toHaveLength(0);
    // The way on is still there: the cards.
    expect(pressables(tree, 'Start as a community member')).toHaveLength(2);
  });

  it('shows why it is back (the demo ended) above the list, and has a way back', async () => {
    const onBack = jest.fn();
    const tree = await render(<DemoCommunityStepView {...props} onBack={onBack} notice="The demo ended. Start again any time." load={ready()} />);
    expect(hasText(tree, 'The demo ended. Start again any time.')).toBe(true);
    await press(tree, 'Back');
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('warns that a sign-in on the device will be signed out', async () => {
    const tree = await render(<DemoCommunityStepView {...props} warning="You are signed in on this device. Opening the demo signs you out here; you can sign in again afterwards." load={ready()} />);
    expect(texts(tree).some((t) => t.startsWith('You are signed in on this device'))).toBe(true);
  });
});

describe('step 2: who to be (six people in two areas)', () => {
  const base = { communitySlug: 'demo-worship' as string | null, starting: false, startError: null as string | null, onStart: jest.fn(), onRetryLoad: jest.fn(), onBack: jest.fn() };

  it('shows Community roles first and Non-profit operational roles second, each person a large card', async () => {
    const tree = await render(<DemoPersonStepView {...base} load={ready()} />);
    const all = texts(tree);
    const community = all.indexOf('Community roles');
    const operations = all.indexOf('Non-profit operational roles');
    expect(community).toBeGreaterThan(-1);
    expect(operations).toBeGreaterThan(community);
    // Who sits under which heading.
    expect(all.indexOf('Tarun Patni')).toBeGreaterThan(community);
    expect(all.indexOf('Tarun Patni')).toBeLessThan(operations);
    expect(all.indexOf('Anita Bhandari')).toBeGreaterThan(operations);
    expect(all.indexOf('Meera Doshiwal')).toBeGreaterThan(operations);
    // Role and story are on the card too, and there is no "More roles" any more.
    expect(all).toEqual(expect.arrayContaining(['Community member · Adult', 'The main adult of a family.', 'Teacher', 'Teaches a class and takes attendance.']));
    expect(all.some((t) => /more roles/i.test(t))).toBe(false);
    const [card] = pressables(tree, 'Teacher: Anita Bhandari. Teaches a class and takes attendance.');
    expect(Number(styleOf(card).minHeight)).toBeGreaterThanOrEqual(48);
    expect(styleOf(card).height).toBeUndefined();
    expect(card.props.accessibilityRole).toBe('radio');
  });

  it("shows only the community being looked at: the other community's people are not offered", async () => {
    const tree = await render(<DemoPersonStepView {...base} communitySlug="demo-club" load={ready()} />);
    const all = texts(tree);
    expect(all).toContain('Lakeside Neighbors Club');
    expect(all).toContain('Kwame Osei');
    expect(all).not.toContain('Tarun Patni');
  });

  it('falls back to a switch between the kinds when it cannot tell which community', async () => {
    const tree = await render(<DemoPersonStepView {...base} communitySlug={null} load={ready()} />);
    expect(tree.root.findAll((n) => n.props.accessibilityRole === 'tablist').length).toBeGreaterThan(0);
    expect(texts(tree)).toContain('Tarun Patni');
    await press(tree, 'Not faith-based');
    expect(texts(tree)).toContain('Kwame Osei');
    expect(texts(tree)).not.toContain('Tarun Patni');
  });

  it('shows one plain list, with no headings, from a portal that sends no areas', async () => {
    const older = { ...choicesBody, communities: [{ ...choicesBody.communities[0], people: choicesBody.communities[0].people.map(({ area: _area, ...p }) => p) }] };
    const tree = await render(<DemoPersonStepView {...base} load={ready(older)} />);
    const all = texts(tree);
    expect(all).toEqual(expect.arrayContaining(['Anita Bhandari', 'Tarun Patni', 'Meera Doshiwal']));
    expect(all).not.toContain('Community roles');
    expect(all).not.toContain('Non-profit operational roles');
  });

  it('cannot start until a person is chosen, then says who it starts as and starts that person', async () => {
    const onStart = jest.fn();
    const tree = await render(<DemoPersonStepView {...base} onStart={onStart} load={ready()} />);
    const [disabled] = pressables(tree, 'Choose a person to start');
    expect(disabled.props.disabled).toBe(true);
    await press(tree, 'Teacher: Anita Bhandari. Teaches a class and takes attendance.');
    const [start] = pressables(tree, 'Start as Anita Bhandari');
    expect(start.props.disabled).toBe(false);
    expect(start.props.accessibilityState).toMatchObject({ disabled: false });
    await press(tree, 'Start as Anita Bhandari');
    expect(onStart).toHaveBeenCalledWith('f-teacher');
  });

  it('marks the chosen card for a screen reader', async () => {
    const tree = await render(<DemoPersonStepView {...base} load={ready()} />);
    const label = 'Treasurer: Meera Doshiwal. Keeps the books.';
    expect(pressables(tree, label)[0].props.accessibilityState).toMatchObject({ checked: false });
    await press(tree, label);
    expect(pressables(tree, label)[0].props.accessibilityState).toMatchObject({ checked: true });
  });

  it('shows a failed start in plain words with Try again, which starts the same person again', async () => {
    const onStart = jest.fn();
    const message = "We couldn't start the demo — you have started a lot of demos in the last hour. Please wait a while, then try again.";
    const tree = await render(<DemoPersonStepView {...base} onStart={onStart} startError={message} load={ready()} />);
    expect(hasText(tree, message)).toBe(true);
    // No retry is offered until a person has been chosen.
    expect(pressables(tree, 'Try again')).toHaveLength(0);
    await press(tree, 'Treasurer: Meera Doshiwal. Keeps the books.');
    await press(tree, 'Try again');
    expect(onStart).toHaveBeenCalledWith('f-treasurer');
  });

  it('shows the failure at the top, above the people, where a failed link is seen; Try again repeats the failed start when nobody is chosen', async () => {
    const onRetryStart = jest.fn();
    const sentence = 'Could not start the demo — you have started a lot of demos in the last hour. Please wait a while, then try again.';
    const tree = await render(<DemoPersonStepView {...base} startError={sentence} onRetryStart={onRetryStart} load={ready()} />);
    const all = texts(tree);
    expect(all.indexOf(sentence)).toBeGreaterThan(-1);
    expect(all.indexOf(sentence)).toBeLessThan(all.indexOf('Community roles'));
    await press(tree, 'Try again');
    expect(onRetryStart).toHaveBeenCalledTimes(1);
    expect(base.onStart).not.toHaveBeenCalled();
  });

  it('shows Starting… and waits while the demo starts', async () => {
    const tree = await render(<DemoPersonStepView {...base} starting load={ready()} />);
    const [busy] = pressables(tree, 'Choose a person to start').concat(pressables(tree, 'Starting the demo…'));
    expect(busy.props.accessibilityState).toMatchObject({ busy: true });
    for (const card of tree.root.findAll((n) => isPressable(n) && n.props.accessibilityRole === 'radio')) expect(card.props.disabled).toBe(true);
  });

  it('says the loading, off, empty and could-not-load states in plain words', async () => {
    expect(hasText(await render(<DemoPersonStepView {...base} load={{ status: 'loading' }} />), 'Loading the demo…')).toBe(true);
    expect(hasText(await render(<DemoPersonStepView {...base} load={ready({ ok: true, enabled: false, communities: [] })} />), 'The demo is switched off right now. Please try again later.')).toBe(true);
    expect(hasText(await render(<DemoPersonStepView {...base} communitySlug="elsewhere" load={ready({ ok: true, enabled: true, communities: [] })} />), 'No demo communities are ready yet. Please try again later.')).toBe(true);
    const onRetryLoad = jest.fn();
    const failed = await render(<DemoPersonStepView {...base} onRetryLoad={onRetryLoad} load={{ status: 'error', message: "We couldn't load the demo. Check your internet connection and try again." }} />);
    await press(failed, 'Try again');
    expect(onRetryLoad).toHaveBeenCalledTimes(1);
  });

  it('keeps the cards free of fixed heights in the largest text size', async () => {
    mockPrefs.textSize = 'largest';
    const tree = await render(<DemoPersonStepView {...base} load={ready()} />);
    const sizes = tree.root.findAllByType(Text).map((n) => (Array.isArray(n.props.style) ? Object.assign({}, ...n.props.style.filter(Boolean)) : n.props.style)).filter((s) => s && typeof s.fontSize === 'number');
    // eyebrow caption is 12 px: at the largest setting (1.3) it is drawn larger, and no card has a fixed height to clip it.
    expect(sizes.some((s) => s.fontSize > 15)).toBe(true);
    for (const card of tree.root.findAll((n) => isPressable(n) && n.props.accessibilityRole === 'radio')) expect(styleOf(card).height).toBeUndefined();
  });
});

describe('the chooser as the app shows it (the screen between the buttons and the demo provider)', () => {
  const sentence = 'Could not start the demo — you have started a lot of demos in the last hour. Please wait a while, then try again.';
  const settle = async () => {
    await act(async () => {
      await Promise.resolve();
    });
  };
  async function screen(demo: DemoContextValue): Promise<ReactTestRenderer> {
    const tree = await render(<DemoChooserScreen />, demo);
    await settle();
    return tree;
  }

  beforeEach(() => {
    mockLoadChoices.mockReset();
    mockLoadChoices.mockResolvedValue(choices());
    mockApp.session = null;
  });

  it('loads the portal’s list and shows the communities with the main button', async () => {
    const tree = await screen(inert({ chooser: 'community', choosing: true }));
    expect(mockLoadChoices).toHaveBeenCalledTimes(1);
    expect(pressables(tree, 'Start as a community member')).toHaveLength(2);
  });

  it('one tap on Start as a community member starts the family person at once: no guest step, no list, no second question', async () => {
    const demo = inert({ chooser: 'community', choosing: true });
    const tree = await screen(demo);
    await press(tree, 'Start as a community member');
    expect(demo.start).toHaveBeenCalledTimes(1);
    expect(demo.start).toHaveBeenCalledWith('f-adult');
    expect(demo.enterGuest).not.toHaveBeenCalled();
    expect(demo.openPeople).not.toHaveBeenCalled();
  });

  it('says Starting the demo… while it starts, then lets go when it is done', async () => {
    let finish!: () => void;
    const demo = inert({
      chooser: 'community',
      choosing: true,
      start: jest.fn(
        () =>
          new Promise<never>((_resolve, reject) => {
            finish = () => reject(new Error('stopped'));
          }),
      ),
    });
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const tree = await screen(demo);
    await press(tree, 'Start as a community member');
    expect(hasText(tree, 'Starting the demo…')).toBe(true);
    expect(pressables(tree, 'Look around as a guest')[0].props.disabled).toBe(true);
    await act(async () => {
      finish();
    });
    expect(hasText(tree, 'Starting the demo…')).toBe(false);
    expect(pressables(tree, 'Start as a community member')).toHaveLength(2);
  });

  it('Look around as a guest opens the community as a guest (the existing path)', async () => {
    const demo = inert({ chooser: 'community', choosing: true });
    const tree = await screen(demo);
    await press(tree, 'Look around as a guest');
    expect(demo.enterGuest).toHaveBeenCalledWith({ slug: 'demo-worship', name: 'Sunrise Worship Center' });
    expect(demo.start).not.toHaveBeenCalled();
  });

  it('Choose someone else opens the people of that community (the existing list)', async () => {
    const demo = inert({ chooser: 'community', choosing: true });
    const tree = await screen(demo);
    await press(tree, 'Choose someone else');
    expect(demo.openPeople).toHaveBeenCalledWith('demo-worship');
  });

  it('shows why a start failed, from the provider (a failed link too), with Try again when it can help', async () => {
    const demo = inert({ chooser: 'community', choosing: true, startError: sentence, canRetry: true });
    const tree = await screen(demo);
    expect(hasText(tree, sentence)).toBe(true);
    await press(tree, 'Try again');
    expect(demo.retryStart).toHaveBeenCalledTimes(1);
  });

  it('shows the failure without Try again when it cannot help', async () => {
    const tree = await screen(inert({ chooser: 'community', choosing: true, startError: "We couldn't start the demo — that person is not available. Choose someone else.", canRetry: false }));
    expect(texts(tree).some((t) => t.includes('that person is not available'))).toBe(true);
    expect(pressables(tree, 'Try again')).toHaveLength(0);
  });

  it('shows Starting the demo… for a start that began on its own (a link, Try again)', async () => {
    const tree = await screen(inert({ chooser: 'community', choosing: true, starting: true }));
    expect(hasText(tree, 'Starting the demo…')).toBe(true);
    expect(pressables(tree, 'Start as a community member')[0].props.disabled).toBe(true);
  });

  it('warns about a real sign-in on the device before anything is tapped', async () => {
    mockApp.session = { user: { email: 'member@example.org' } };
    const tree = await screen(inert({ chooser: 'community', choosing: true }));
    expect(texts(tree).some((t) => t.startsWith('You are signed in on this device'))).toBe(true);
  });

  it('says it could not load the demo, in plain words, with Try again that loads again', async () => {
    mockLoadChoices.mockRejectedValue(Object.assign(new Error('offline'), { userMessage: "We couldn't load the demo. Check your internet connection and try again." }));
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const tree = await screen(inert({ chooser: 'community', choosing: true }));
    expect(pressables(tree, 'Start as a community member')).toHaveLength(0);
    expect(pressables(tree, 'Try again')).toHaveLength(1);
  });

  it('the people of a community reached from Choose someone else: only that community, Start starts the person, Back goes back', async () => {
    const demo = inert({ chooser: 'person', choosing: true, peopleOf: 'demo-club', slug: null });
    const tree = await screen(demo);
    expect(texts(tree)).toContain('Kwame Osei');
    expect(texts(tree)).not.toContain('Tarun Patni');
    await press(tree, 'Event lead: Irina Petrov. Runs one event.');
    await press(tree, 'Start as Irina Petrov');
    expect(demo.start).toHaveBeenCalledWith('n-lead');
    await press(tree, 'Back');
    expect(demo.closeChooser).toHaveBeenCalledTimes(1);
  });

  it('the people of a running demo community are still the running community’s (Be someone, Switch person)', async () => {
    const demo = inert({ chooser: 'person', choosing: true, mode: 'guest', guest: true, slug: 'demo-worship', peopleOf: null, startError: sentence });
    const tree = await screen(demo);
    expect(texts(tree)).toContain('Tarun Patni');
    expect(texts(tree)).not.toContain('Kwame Osei');
    expect(hasText(tree, sentence)).toBe(true);
  });
});

describe('the banner over every screen', () => {
  const noop = jest.fn();

  it('says it is a demo community and a guest look around, with the two actions', async () => {
    const tree = await render(
      <DemoBannerView
        text="Demo community · Looking around as a guest"
        accessibilityLabel="You are looking around the demo community Sunrise Worship Center as a guest."
        actions={[
          { id: 'bePerson', label: 'Be someone in the demo', hint: 'h', onPress: noop },
          { id: 'leave', label: 'Leave the demo', hint: 'h', onPress: noop },
        ]}
      />,
    );
    expect(hasText(tree, 'Demo community · Looking around as a guest')).toBe(true);
    for (const label of ['Be someone in the demo', 'Leave the demo']) expect(Number(styleOf(pressables(tree, label)[0]).minHeight)).toBeGreaterThanOrEqual(44);
  });

  it('guest mode: Be someone in the demo opens the people, Leave the demo leaves', async () => {
    const demo = inert({ mode: 'guest', guest: true, slug: 'demo-worship', guestCommunity: { slug: 'demo-worship', name: 'Sunrise Worship Center' } });
    const tree = await render(<DemoBanner />, demo);
    expect(hasText(tree, 'Demo community · Looking around as a guest')).toBe(true);
    expect(tree.root.findAll((n) => n.props.accessibilityLabel === 'You are looking around the demo community Sunrise Worship Center as a guest.').length).toBeGreaterThan(0);
    expect(pressables(tree, 'Switch person')).toHaveLength(0);
    await press(tree, 'Be someone in the demo');
    expect(demo.openChooser).toHaveBeenCalledTimes(1);
    await press(tree, 'Leave the demo');
    expect(demo.leave).toHaveBeenCalledTimes(1);
  });

  it('person mode: shows the role and the time left, with Switch person, Look around as a guest and Leave the demo', async () => {
    const demo = inert({
      mode: 'person',
      active: true,
      info: { role: 'Teacher', name: 'Anita Bhandari', community: 'Sunrise Worship Center', slug: 'demo-worship', deadline: 1 },
      secondsLeft: 6120,
      slug: 'demo-worship',
    });
    const tree = await render(<DemoBanner />, demo);
    expect(hasText(tree, 'Demo · Teacher · 1 h 42 min left')).toBe(true);
    expect(tree.root.findAll((n) => n.props.accessibilityLabel === 'You are exploring a demo community as Teacher. 1 h 42 min left.').length).toBeGreaterThan(0);
    expect(pressables(tree, 'Be someone in the demo')).toHaveLength(0);
    await press(tree, 'Switch person');
    expect(demo.openChooser).toHaveBeenCalledTimes(1);
    await press(tree, 'Look around as a guest');
    expect(demo.toGuest).toHaveBeenCalledTimes(1);
    await press(tree, 'Leave the demo');
    expect(demo.leave).toHaveBeenCalledTimes(1);
  });

  it('counts down: the words follow the seconds the provider keeps', async () => {
    const info = { role: 'Treasurer', name: 'Meera', community: 'Sunrise', slug: 'demo-worship', deadline: 1 };
    const at = async (secondsLeft: number) => hasText(await render(<DemoBanner />, inert({ mode: 'person', active: true, info, secondsLeft })), `Demo · Treasurer · ${secondsLeft === 59 ? 'less than a minute' : '35 min'} left`);
    expect(await at(2100)).toBe(true);
    expect(await at(59)).toBe(true);
  });

  it('shows nothing when no demo is running', async () => {
    const tree = await render(<DemoBanner />, inert({ mode: 'off' }));
    expect(drawsNothing(tree)).toBe(true);
  });

  it('shows Leaving… and waits while the demo is being left, then says nothing more', async () => {
    let finish!: () => void;
    const leave = jest.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    const demo = inert({ mode: 'guest', guest: true, guestCommunity: { slug: 'demo-worship', name: 'S' }, leave });
    const tree = await render(<DemoBanner />, demo);
    await press(tree, 'Leave the demo');
    expect(hasText(tree, 'Leaving…')).toBe(true);
    expect(pressables(tree, 'Be someone in the demo')[0].props.disabled).toBe(true);
    await act(async () => {
      finish();
    });
    expect(hasText(tree, 'Leave the demo')).toBe(true);
  });

  it('says it could not do it when switching to a guest fails', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const toGuest = jest.fn(async () => Promise.reject(new Error('boom')));
    const demo = inert({ mode: 'person', active: true, info: { role: 'Teacher', name: 'A', community: 'S', slug: 'demo-worship', deadline: 1 }, secondsLeft: 600, toGuest });
    const tree = await render(<DemoBanner />, demo);
    await press(tree, 'Look around as a guest');
    expect(hasText(tree, "We couldn't do that. Please try again.")).toBe(true);
  });
});

describe('what a demo person must not do', () => {
  it.each(DEMO_LIMITED)('does not offer %s in a demo, and offers it outside one', async (action) => {
    const inDemo = await render(
      <HiddenInDemo action={action}>
        <Text>offered</Text>
      </HiddenInDemo>,
      inert({ mode: 'person', active: true }),
    );
    expect(hasText(inDemo, 'offered')).toBe(false);
    const outside = await render(
      <HiddenInDemo action={action}>
        <Text>offered</Text>
      </HiddenInDemo>,
      inert({ mode: 'off' }),
    );
    expect(hasText(outside, 'offered')).toBe(true);
  });

  it('says why in a demo, and says nothing outside one', async () => {
    const inDemo = await render(<DemoNote messageKey="demo.limitNote" />, inert({ mode: 'person', active: true }));
    expect(texts(inDemo).some((t) => t.startsWith('This is a demo, so changing the email, phone or password'))).toBe(true);
    const outside = await render(<DemoNote messageKey="demo.limitNote" />, inert({ mode: 'off' }));
    expect(drawsNothing(outside)).toBe(true);
  });
});

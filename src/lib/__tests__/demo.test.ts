import { describe, expect, it } from '@jest/globals';

import {
  DEMO_LIMITED,
  canOpenAsGuest,
  demoAllows,
  endFor,
  infoFromState,
  isDemoGuest,
  isDemoInfo,
  isDemoLogin,
  isDemoPath,
  isSlug,
  parseChoices,
  parseDemoState,
  portalCode,
  portalSentence,
  secondsUntil,
  sectionsByArea,
  startFailureMessage,
  timeLeftText,
  type DemoPerson,
} from '../demo';

const person = (id: string, role: string, area: DemoPerson['area'] = null): DemoPerson => ({ id, role, name: `Name ${id}`, story: `Story ${id}.`, area });

// The shape connect-crm GET /api/demo/choices returns (docs/MEMBER_APP_DEMO.md): each community names its id and web name, each person an area.
const payload = {
  ok: true,
  enabled: true,
  communities: [
    {
      kind: 'neutral',
      id: '5b0e9c52-2d39-4f6a-8d3a-9a1d7e2c0001',
      slug: 'demo-club',
      name: 'Lakeside Neighbors Club',
      people: [
        { id: 'n1', role: 'Community member · Adult', name: 'Kwame Osei', story: 'The main adult of a family.', area: 'community' },
        { id: 'n2', role: 'Treasurer', name: 'Emeka Okonkwo', story: 'Keeps the books.', area: 'operations' },
      ],
    },
    {
      kind: 'faith',
      id: '5b0e9c52-2d39-4f6a-8d3a-9a1d7e2c0002',
      slug: 'demo-worship',
      name: 'Sunrise Worship Center',
      people: [
        { id: 'f1', role: 'Teacher', name: 'Anita Bhandari', story: 'Teaches a class.', area: 'operations' },
        { id: 'f2', role: 'Community member · Adult', name: 'Tarun Patni', story: 'The main adult of a family.', area: 'community' },
        { id: 'f3', role: 'Treasurer', name: 'Meera Doshiwal', story: 'Keeps the books.', area: 'operations' },
      ],
    },
  ],
};

describe('parseChoices (GET /api/demo/choices)', () => {
  it('reads the communities, faith-based first, with their id, web name and people', () => {
    const c = parseChoices(payload);
    expect(c?.enabled).toBe(true);
    expect(c?.communities.map((x) => x.kind)).toEqual(['faith', 'neutral']);
    expect(c?.communities[0]).toMatchObject({ kind: 'faith', name: 'Sunrise Worship Center', slug: 'demo-worship', id: '5b0e9c52-2d39-4f6a-8d3a-9a1d7e2c0002' });
    expect(c?.communities[0].people[0]).toEqual({ id: 'f1', role: 'Teacher', name: 'Anita Bhandari', story: 'Teaches a class.', area: 'operations' });
  });
  it("reads a switched-off demo as enabled: false, with the portal's own sentence", () => {
    expect(parseChoices({ ok: true, enabled: false, communities: [], message: 'The demo is switched off right now. Please try again later.' })).toEqual({
      enabled: false,
      communities: [],
      message: 'The demo is switched off right now. Please try again later.',
    });
    expect(parseChoices({ ok: true, enabled: false, communities: [] })).toEqual({ enabled: false, communities: [], message: null });
  });
  it('reads "enabled but nothing set up" with its sentence', () => {
    expect(parseChoices({ ok: true, enabled: true, communities: [], message: 'The demo is not ready yet. Please try again later.' })).toMatchObject({
      enabled: true,
      communities: [],
      message: 'The demo is not ready yet. Please try again later.',
    });
  });
  it('tolerates a portal that sends no area, no id and no web name yet', () => {
    const older = parseChoices({ ok: true, enabled: true, communities: [{ kind: 'faith', name: 'X', people: [{ id: 'p', role: 'Teacher', name: 'A', story: '' }] }] });
    expect(older?.communities[0]).toMatchObject({ id: null, slug: null });
    expect(older?.communities[0].people[0].area).toBeNull();
  });
  it('leaves out what it cannot use: unknown kinds, people without a name or role, a web name that is not one', () => {
    const c = parseChoices({
      ok: true,
      enabled: true,
      communities: [
        { kind: 'club', name: 'Odd', slug: 'odd', people: [{ id: 'a', role: 'Treasurer', name: 'A', story: '' }] },
        { kind: 'faith', name: 'F', slug: 'Not A Slug', people: [{ id: 'b', role: '', name: 'B' }, { id: 'c', role: 'Teacher', name: 'C', area: 'elsewhere' }, null, 7] },
      ],
    });
    expect(c?.communities).toHaveLength(1);
    expect(c?.communities[0].slug).toBeNull();
    expect(c?.communities[0].people).toEqual([{ id: 'c', role: 'Teacher', name: 'C', story: '', area: null }]);
  });
  it('keeps a community with no people yet when it can be opened as a guest', () => {
    const c = parseChoices({ ok: true, enabled: true, communities: [{ kind: 'faith', name: 'F', slug: 'demo-worship', people: [] }, { kind: 'neutral', name: 'N', people: [] }] });
    expect(c?.communities.map((x) => x.slug)).toEqual(['demo-worship']);
  });
  it('is null for anything that is not an answer: a refusal, a missing enabled flag, junk', () => {
    expect(parseChoices({ ok: false, error: 'x' })).toBeNull();
    expect(parseChoices({ ok: true, communities: [] })).toBeNull();
    expect(parseChoices(null)).toBeNull();
    expect(parseChoices([])).toBeNull();
    expect(parseChoices('nope')).toBeNull();
  });
});

describe('the demo people in two areas', () => {
  it('puts Community roles first and Non-profit operational roles second, keeping the portal order inside each', () => {
    const faith = parseChoices(payload)?.communities[0];
    const sections = sectionsByArea(faith?.people ?? []);
    expect(sections.map((s) => s.area)).toEqual(['community', 'operations']);
    expect(sections[0].people.map((p) => p.name)).toEqual(['Tarun Patni']);
    expect(sections[1].people.map((p) => p.name)).toEqual(['Anita Bhandari', 'Meera Doshiwal']);
  });
  it('shows one plain list (a section with no heading) when the portal sends no areas', () => {
    const sections = sectionsByArea([person('a', 'Teacher'), person('b', 'Treasurer')]);
    expect(sections).toHaveLength(1);
    expect(sections[0].area).toBeNull();
    expect(sections[0].people.map((p) => p.id)).toEqual(['a', 'b']);
  });
  it('puts a person with no area after the two areas when only some have one', () => {
    const sections = sectionsByArea([person('a', 'X'), person('b', 'Y', 'operations'), person('c', 'Z', 'community')]);
    expect(sections.map((s) => s.area)).toEqual(['community', 'operations', null]);
  });
  it('has no sections for no people', () => {
    expect(sectionsByArea([])).toEqual([]);
  });
});

describe('opening a demo community as a guest', () => {
  it('needs the web name the portal sends', () => {
    const [faith, neutral] = parseChoices({ ...payload, communities: [{ ...payload.communities[1], slug: undefined }, payload.communities[0]] })?.communities ?? [];
    expect(faith.kind).toBe('faith');
    expect(canOpenAsGuest(faith)).toBe(false);
    expect(canOpenAsGuest(neutral)).toBe(true);
  });
  it('knows a web name from a display name', () => {
    expect(isSlug('demo-worship')).toBe(true);
    expect(isSlug('Sunrise Worship Center')).toBe(false);
    expect(isSlug('')).toBe(false);
    expect(isSlug(7)).toBe(false);
  });
  it('recognises a saved guest choice, and refuses a damaged one', () => {
    expect(isDemoGuest({ slug: 'demo-worship', name: 'Sunrise Worship Center' })).toBe(true);
    expect(isDemoGuest({ slug: 'Bad Slug', name: 'x' })).toBe(false);
    expect(isDemoGuest({ slug: 'demo-worship' })).toBe(false);
    expect(isDemoGuest(null)).toBe(false);
  });
});

describe('start failures, in plain words', () => {
  it("says what went wrong for each of the portal's codes when it sent no sentence of its own", () => {
    expect(startFailureMessage('limit')).toBe("We couldn't start the demo — you have started a lot of demos in the last hour. Please wait a while, then try again.");
    expect(startFailureMessage('off')).toContain('switched off');
    expect(startFailureMessage('unknown_person')).toContain('Choose someone else');
    expect(startFailureMessage('failed')).toBe("We couldn't start the demo — something went wrong. Please try again.");
  });
  it('says the app-side failures too', () => {
    expect(startFailureMessage('network')).toContain('Check your internet connection');
    expect(startFailureMessage('unreadable')).toContain('not what we expected');
  });
  it("reads the portal's codes, and the names of an earlier draft of the contract", () => {
    expect(portalCode('off')).toBe('off');
    expect(portalCode('limit')).toBe('limit');
    expect(portalCode('unknown_person')).toBe('unknown_person');
    expect(portalCode('failed')).toBe('failed');
    expect(portalCode('ip_limit')).toBe('limit');
    expect(portalCode('busy')).toBe('limit');
    expect(portalCode('not_ready')).toBe('off');
    expect(portalCode('unknown_persona')).toBe('unknown_person');
    expect(portalCode('surprise')).toBeNull();
    expect(portalCode(undefined)).toBeNull();
  });
  it("keeps the portal's own sentence as it is, and never a code, an empty text or a wall of text", () => {
    expect(portalSentence('  Could not start the demo — the demo sign-in did not work. Please try again in a minute.  ')).toBe(
      'Could not start the demo — the demo sign-in did not work. Please try again in a minute.',
    );
    expect(portalSentence('')).toBeNull();
    expect(portalSentence('   ')).toBeNull();
    expect(portalSentence('x'.repeat(500))).toBeNull();
    expect(portalSentence(undefined)).toBeNull();
    expect(portalSentence(42)).toBeNull();
  });
});

describe('the check of a running demo person (app.demo_session_state)', () => {
  const ok = { state: 'ok', expires_at: '2026-10-14T12:00:00Z', seconds_left: 6120, role: 'Teacher', name: 'Anita Bhandari', center_name: 'Sunrise Worship Center', center_slug: 'demo-worship' };
  it('reads an ok answer', () => {
    expect(parseDemoState(ok)).toEqual({
      state: 'ok',
      secondsLeft: 6120,
      endsAt: '2026-10-14T12:00:00Z',
      role: 'Teacher',
      name: 'Anita Bhandari',
      centerName: 'Sunrise Worship Center',
      centerSlug: 'demo-worship',
    });
  });
  it('reads every way a demo is over', () => {
    for (const state of ['expired', 'off', 'unknown', 'not_demo', 'ended']) expect(parseDemoState({ state })).toEqual({ state });
  });
  it('is null (try again later, no verdict) for an answer it cannot read', () => {
    expect(parseDemoState({ state: 'ok', seconds_left: 'soon', center_slug: 'demo-worship' })).toBeNull();
    expect(parseDemoState({ state: 'ok', seconds_left: 10, center_slug: 'Not A Slug' })).toBeNull();
    expect(parseDemoState({ state: 'maybe' })).toBeNull();
    expect(parseDemoState(null)).toBeNull();
    expect(parseDemoState('ok')).toBeNull();
  });
  it('counts seconds from a number sent as text, and never below zero', () => {
    expect(parseDemoState({ ...ok, seconds_left: '90' })).toMatchObject({ secondsLeft: 90 });
    expect(parseDemoState({ ...ok, seconds_left: -5 })).toMatchObject({ secondsLeft: 0 });
  });
  it('words the two ends', () => {
    expect(endFor('off')).toBe('off');
    for (const state of ['expired', 'unknown', 'not_demo', 'ended'] as const) expect(endFor(state)).toBe('ended');
  });
});

describe('the time left', () => {
  it('anchors the server seconds to the device clock, so the countdown does not depend on the two clocks agreeing', () => {
    const state = parseDemoState({ state: 'ok', seconds_left: 3600, role: 'Teacher', name: 'A', center_name: 'S', center_slug: 'demo-worship' });
    if (!state || state.state !== 'ok') throw new Error('not ok');
    const info = infoFromState(state, 1_000_000);
    expect(info).toEqual({ role: 'Teacher', name: 'A', community: 'S', slug: 'demo-worship', deadline: 1_000_000 + 3_600_000 });
    expect(secondsUntil(info.deadline, 1_000_000 + 60_000)).toBe(3540);
    expect(secondsUntil(info.deadline, info.deadline + 5_000)).toBe(0);
  });
  it('words it as the portal does', () => {
    expect(timeLeftText(6120)).toBe('1 h 42 min left');
    expect(timeLeftText(2100)).toBe('35 min left');
    expect(timeLeftText(59)).toBe('less than a minute left');
    expect(timeLeftText(0)).toBe('less than a minute left');
    expect(timeLeftText(-3)).toBe('less than a minute left');
  });
  it('recognises the saved demo and refuses a damaged one', () => {
    expect(isDemoInfo({ role: 'Teacher', name: 'A', community: 'S', slug: 'demo-worship', deadline: 5 })).toBe(true);
    expect(isDemoInfo({ role: 'Teacher', name: 'A', community: 'S', slug: 'Bad Slug', deadline: 5 })).toBe(false);
    expect(isDemoInfo({ role: 'Teacher', name: 'A', community: 'S', slug: 'demo-worship', deadline: 'x' })).toBe(false);
    expect(isDemoInfo(null)).toBe(false);
  });
});

describe('who is a demo login', () => {
  it('is an address exactly on the demo domain', () => {
    expect(isDemoLogin({ email: 'asha.varma@demo.weaverams.org' })).toBe(true);
    expect(isDemoLogin({ email: 'ASHA@Demo.Weaverams.org' })).toBe(true);
  });
  it('is a login the database marked app_metadata.demo', () => {
    expect(isDemoLogin({ email: 'someone@example.org', app_metadata: { demo: true } })).toBe(true);
  });
  it('is not a look-alike, a real person or nobody', () => {
    expect(isDemoLogin({ email: 'x@demo.weaverams.org.example.com' })).toBe(false);
    expect(isDemoLogin({ email: 'x@notdemo.weaverams.org' })).toBe(false);
    expect(isDemoLogin({ email: 'someone@example.org', app_metadata: { demo: 'yes' } })).toBe(false);
    expect(isDemoLogin({ email: null })).toBe(false);
    expect(isDemoLogin(null)).toBe(false);
    expect(isDemoLogin(undefined)).toBe(false);
  });
});

describe('the address of the demo', () => {
  it('is /demo on the web and connect://demo in the app', () => {
    expect(isDemoPath('/demo')).toBe(true);
    expect(isDemoPath('/demo/')).toBe(true);
    expect(isDemoPath('/demo?from=site')).toBe(true);
    expect(isDemoPath('/')).toBe(false);
    expect(isDemoPath('/demonstration')).toBe(false);
    expect(isDemoPath('/events/demo')).toBe(false);
    expect(isDemoPath(null)).toBe(false);
  });
});

describe('what a demo person must not do', () => {
  it('turns every account-changing action off in a demo and leaves them all on outside it', () => {
    expect(DEMO_LIMITED).toEqual(expect.arrayContaining(['changeContact', 'deleteAccount', 'deactivateAccount', 'push', 'sendMessage', 'dataRequest', 'switchCommunity']));
    for (const action of DEMO_LIMITED) {
      expect(demoAllows(true, action)).toBe(false);
      expect(demoAllows(false, action)).toBe(true);
    }
  });
});

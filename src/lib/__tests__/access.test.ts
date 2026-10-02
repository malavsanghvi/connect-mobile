import { describe, expect, it } from '@jest/globals';

import { translate } from '../../i18n';
import {
  accessReadDue,
  accessScope,
  AREA_LABEL,
  currentSlot,
  decideFeature,
  doorCheckFor,
  fallbackSnapshot,
  FEATURE_KEYS,
  FEATURE_MODULE,
  featureMessage,
  GUEST_DOORS,
  guestAreas,
  guestDoorsToShow,
  isFeatureKey,
  OPEN_BEFORE_LEVELS,
  parseAccess,
  settleSlot,
  type AccessSnapshot,
  type DoorCheck,
} from '../access';
import { AppError } from '../errors';
import { ALL_ON, isModuleKey, type ModuleMap } from '../modules';

const t = (key: Parameters<typeof translate>[1], vars?: Parameters<typeof translate>[2]) => translate('en', key, vars);

const PUBLIC = { key: 'public', label: 'Public', rank: 0 };
const COMMUNITY = { key: 'community', label: 'Community member', rank: 10 };
const MEMBER = { key: 'member', label: 'Member', rank: 20 };
const LIFE = { key: 'life', label: 'Life member', rank: 30 };

/** One area of the `app.feature_access_for_me` answer. */
const area = (allowed: boolean, min: { key: string; label: string; rank: number }, reason: string | null = null) => ({ allowed, reason, min_level: min });

/** The answer for a visitor in a community with the default settings: Live darshan and Virtual puja open to the public, the rest for the community. */
const visitorAnswer = () => ({
  level: PUBLIC,
  signed_in: false,
  features: {
    darshan: area(true, PUBLIC),
    puja: area(true, PUBLIC),
    timings: area(true, PUBLIC),
    guide: area(true, PUBLIC),
    listen: area(false, COMMUNITY, 'sign_in'),
    look: area(false, COMMUNITY, 'sign_in'),
    learn: area(false, COMMUNITY, 'sign_in'),
    niva: area(false, COMMUNITY, 'sign_in'),
  },
});

/** The same community, for a member whose household has no paid membership: Ask Niva is set to Member. */
const communityAnswer = () => ({
  level: COMMUNITY,
  signed_in: true,
  features: {
    darshan: area(true, PUBLIC),
    puja: area(true, PUBLIC),
    timings: area(true, PUBLIC),
    guide: area(true, PUBLIC),
    listen: area(true, COMMUNITY),
    look: area(true, COMMUNITY),
    learn: area(true, COMMUNITY),
    niva: area(false, MEMBER, 'level'),
  },
});

const snapshot = (raw: unknown): AccessSnapshot => {
  const s = parseAccess(raw);
  if (!s) throw new Error('not an answer');
  return s;
};

const off = (...keys: string[]): ModuleMap => Object.fromEntries(keys.map((k) => [k, false]));

describe('the areas', () => {
  it('match the portal catalog (v1) exactly', () => {
    expect([...FEATURE_KEYS].sort()).toEqual(['darshan', 'guide', 'learn', 'listen', 'look', 'niva', 'puja', 'timings']);
  });
  it('know their module, and the module is a real one', () => {
    for (const key of FEATURE_KEYS) {
      const module = FEATURE_MODULE[key];
      expect(module === null || isModuleKey(module)).toBe(true);
    }
    expect(FEATURE_MODULE.darshan).toBe('content');
    expect(FEATURE_MODULE.puja).toBe('gyan_path');
    expect(FEATURE_MODULE.niva).toBe('niva');
  });
  it('are named for the member', () => {
    for (const key of FEATURE_KEYS) expect(t(AREA_LABEL[key])).not.toBe(AREA_LABEL[key]);
  });
  it('recognise their own keys only', () => {
    expect(isFeatureKey('darshan')).toBe(true);
    expect(isFeatureKey('telepathy')).toBe(false);
    expect(isFeatureKey('constructor')).toBe(false);
    expect(isFeatureKey(null)).toBe(false);
  });
  it('keeps the guide and the timings open to everyone before the answer is in', () => {
    expect([...OPEN_BEFORE_LEVELS].sort()).toEqual(['guide', 'timings']);
  });
});

describe('reading the answer', () => {
  it("reads the portal's answer for a visitor", () => {
    const s = snapshot(visitorAnswer());
    expect(s.source).toBe('database');
    expect(s.signedIn).toBe(false);
    expect(s.level).toEqual(PUBLIC);
    expect(s.features.darshan).toEqual({ allowed: true, reason: null, minLevel: PUBLIC });
    expect(s.features.niva).toEqual({ allowed: false, reason: 'sign_in', minLevel: COMMUNITY });
  });
  it('reads a member below the level an area asks for', () => {
    const s = snapshot(communityAnswer());
    expect(s.signedIn).toBe(true);
    expect(s.level).toEqual(COMMUNITY);
    expect(s.features.niva).toEqual({ allowed: false, reason: 'level', minLevel: MEMBER });
  });
  it('is not an answer unless it has the areas', () => {
    for (const junk of [null, undefined, 'x', 7, [], {}, { level: PUBLIC }, { features: [] }, { features: 'x' }]) expect(parseAccess(junk)).toBeNull();
  });
  it('leaves out areas it does not know, and entries it cannot use', () => {
    const answer = visitorAnswer();
    const s = snapshot({
      ...answer,
      features: {
        ...answer.features,
        telepathy: area(true, PUBLIC),
        constructor: area(true, PUBLIC),
        niva: { allowed: 'yes', reason: null, min_level: COMMUNITY },
        listen: 'nope',
        look: null,
      },
    });
    expect(Object.keys(s.features).sort()).toEqual(['darshan', 'guide', 'learn', 'puja', 'timings']);
  });
  it('gives a "no" without a reason the one that fits the reader', () => {
    const visitor = snapshot({ level: PUBLIC, signed_in: false, features: { niva: { allowed: false } } });
    expect(visitor.features.niva).toEqual({ allowed: false, reason: 'sign_in', minLevel: null });
    const member = snapshot({ level: COMMUNITY, signed_in: true, features: { niva: { allowed: false, reason: 'whatever', min_level: MEMBER } } });
    expect(member.features.niva).toEqual({ allowed: false, reason: 'level', minLevel: MEMBER });
  });
  it('has no reason for a "yes"', () => {
    const s = snapshot({ level: LIFE, signed_in: true, features: { niva: { allowed: true, reason: 'level', min_level: MEMBER } } });
    expect(s.features.niva).toEqual({ allowed: true, reason: null, minLevel: MEMBER });
  });
  it('reads the module-off reason', () => {
    const s = snapshot({ level: COMMUNITY, signed_in: true, features: { puja: { allowed: false, reason: 'module_off', min_level: PUBLIC } } });
    expect(s.features.puja).toEqual({ allowed: false, reason: 'module_off', minLevel: PUBLIC });
  });
  it("copes with a level it can't read", () => {
    const s = snapshot({ level: { key: 'x' }, signed_in: true, features: { niva: { allowed: true, min_level: { key: 'member', rank: 'high' } } } });
    expect(s.level).toEqual(COMMUNITY);
    expect(s.features.niva).toEqual({ allowed: true, reason: null, minLevel: null });
    const unnamed = snapshot({ level: { key: 'life', rank: 30 }, signed_in: true, features: { niva: { allowed: false, reason: 'level', min_level: { key: 'life', label: '  ', rank: 30 } } } });
    expect(unnamed.level).toEqual({ key: 'life', label: 'life', rank: 30 });
    expect(unnamed.features.niva?.minLevel).toEqual({ key: 'life', label: 'life', rank: 30 });
  });
  it('works out who is signed in when the answer does not say', () => {
    expect(snapshot({ level: PUBLIC, features: {} }).signedIn).toBe(false);
    expect(snapshot({ level: MEMBER, features: {} }).signedIn).toBe(true);
    expect(snapshot({ features: {} })).toMatchObject({ signedIn: false, level: PUBLIC });
  });
});

describe('who may use what', () => {
  it('lets a visitor use the areas open to the public and asks them to sign in for the rest', () => {
    const s = snapshot(visitorAnswer());
    expect(decideFeature(s, 'darshan', ALL_ON)).toEqual({ allowed: true, reason: null, minLevel: PUBLIC });
    expect(decideFeature(s, 'puja', ALL_ON).allowed).toBe(true);
    for (const key of ['listen', 'look', 'learn', 'niva'] as const) {
      expect(decideFeature(s, key, ALL_ON)).toEqual({ allowed: false, reason: 'sign_in', minLevel: COMMUNITY });
    }
  });
  it('lets a member use their community areas and tells them which level the rest take', () => {
    const s = snapshot(communityAnswer());
    for (const key of ['darshan', 'puja', 'listen', 'look', 'learn'] as const) expect(decideFeature(s, key, ALL_ON).allowed).toBe(true);
    expect(decideFeature(s, 'niva', ALL_ON)).toEqual({ allowed: false, reason: 'level', minLevel: MEMBER });
  });
  it('is the organization that decides: a Life member passes where a Member does not', () => {
    const life = snapshot({ ...communityAnswer(), level: LIFE, features: { ...communityAnswer().features, niva: area(true, MEMBER) } });
    expect(decideFeature(life, 'niva', ALL_ON).allowed).toBe(true);
  });
  it('lets nobody use an area whose module is switched off', () => {
    const s = snapshot(communityAnswer());
    expect(decideFeature(s, 'darshan', off('content'))).toEqual({ allowed: false, reason: 'module_off', minLevel: null });
    expect(decideFeature(s, 'look', off('content')).reason).toBe('module_off');
    expect(decideFeature(s, 'listen', off('content')).reason).toBe('module_off');
    expect(decideFeature(s, 'puja', off('gyan_path')).reason).toBe('module_off');
    expect(decideFeature(s, 'learn', off('gyan_path')).reason).toBe('module_off');
    expect(decideFeature(s, 'puja', off('content')).allowed).toBe(true);
    // Niva needs Content too (module dependency).
    expect(decideFeature(snapshot({ ...communityAnswer(), features: { niva: area(true, COMMUNITY) } }), 'niva', off('content')).reason).toBe('module_off');
    expect(decideFeature(snapshot({ ...communityAnswer(), features: { niva: area(true, COMMUNITY) } }), 'niva', off('niva')).reason).toBe('module_off');
  });
  it('never closes the guide or the timings because of a module', () => {
    const s = snapshot(visitorAnswer());
    const everything = off('content', 'gyan_path', 'niva', 'jain_way', 'comms', 'membership');
    expect(decideFeature(s, 'guide', everything).allowed).toBe(true);
    expect(decideFeature(s, 'timings', everything).allowed).toBe(true);
  });
  it('honours an organization that raises the guide above the public', () => {
    const s = snapshot({ ...visitorAnswer(), features: { ...visitorAnswer().features, guide: area(false, COMMUNITY, 'sign_in') } });
    expect(decideFeature(s, 'guide', ALL_ON)).toEqual({ allowed: false, reason: 'sign_in', minLevel: COMMUNITY });
  });
  it('decides an area the answer does not mention as before access levels', () => {
    const visitor = snapshot({ level: PUBLIC, signed_in: false, features: {} });
    expect(decideFeature(visitor, 'guide', ALL_ON).allowed).toBe(true);
    expect(decideFeature(visitor, 'timings', ALL_ON).allowed).toBe(true);
    expect(decideFeature(visitor, 'niva', ALL_ON)).toMatchObject({ allowed: false, reason: 'sign_in' });
    expect(decideFeature(visitor, 'darshan', ALL_ON)).toMatchObject({ allowed: false, reason: 'sign_in' });
    const member = snapshot({ level: COMMUNITY, signed_in: true, features: {} });
    for (const key of FEATURE_KEYS) expect(decideFeature(member, key, ALL_ON).allowed).toBe(true);
  });
  it('opens only the guide and the timings until the answer is in', () => {
    for (const key of FEATURE_KEYS) {
      const d = decideFeature(null, key, ALL_ON);
      expect(d.allowed).toBe(OPEN_BEFORE_LEVELS.includes(key));
      expect(d.reason).toBeNull();
    }
  });
});

describe('a portal that does not have the answer yet', () => {
  it('lets a member use everything, as before', () => {
    const s = fallbackSnapshot(true);
    expect(s).toMatchObject({ source: 'fallback', signedIn: true });
    for (const key of FEATURE_KEYS) expect(decideFeature(s, key, ALL_ON).allowed).toBe(true);
  });
  it('lets a visitor use only the guide and the timings, as before', () => {
    const s = fallbackSnapshot(false);
    expect(s).toMatchObject({ source: 'fallback', signedIn: false });
    for (const key of FEATURE_KEYS) {
      const d = decideFeature(s, key, ALL_ON);
      expect(d.allowed).toBe(key === 'guide' || key === 'timings');
      if (!d.allowed) expect(d.reason).toBe('sign_in');
    }
  });
  it('still follows the modules', () => {
    expect(decideFeature(fallbackSnapshot(true), 'niva', off('niva')).reason).toBe('module_off');
  });
  it('offers a visitor nothing on the Welcome screen', () => {
    expect(guestAreas(fallbackSnapshot(false), ALL_ON)).toEqual([]);
  });
});

describe('what the person is told', () => {
  it('asks a visitor to sign in', () => {
    expect(featureMessage(t, 'niva', 'sign_in', 'Community member')).toEqual({ title: 'Sign in to use Ask Niva', body: null, signIn: true });
    expect(featureMessage(t, 'darshan', 'sign_in', null).title).toBe('Sign in to use Live darshan');
  });
  it('tells a member below the level which level it takes', () => {
    expect(featureMessage(t, 'niva', 'level', 'Life member')).toEqual({
      title: 'Ask Niva is available to Life member and above.',
      body: 'Ask the office about membership.',
      signIn: false,
    });
    expect(featureMessage(t, 'listen', 'level', null).title).toBe('Listen (stavans, podcasts and playlist) is available to Member and above.');
  });
  it("says a module that is off isn't offered", () => {
    expect(featureMessage(t, 'darshan', 'module_off', null, 'JSH')).toEqual({
      title: "Live darshan isn't offered by JSH right now",
      body: 'Your community has switched this part of the app off. If you expected to see it, please contact the office.',
      signIn: false,
    });
  });
  it('still says something when the reason is not known', () => {
    expect(featureMessage(t, 'look', null, null)).toEqual({ title: "Look (videos and recipes) isn't available to you right now.", body: null, signIn: false });
  });
});

describe('Welcome: without signing in', () => {
  it('offers Live darshan and Virtual puja when they are open to the public', () => {
    expect(guestAreas(snapshot(visitorAnswer()), ALL_ON)).toEqual(['darshan', 'puja']);
  });
  it('leaves out an area the organization keeps for its community', () => {
    const a = visitorAnswer();
    expect(guestAreas(snapshot({ ...a, features: { ...a.features, darshan: area(false, COMMUNITY, 'sign_in') } }), ALL_ON)).toEqual(['puja']);
    expect(guestAreas(snapshot({ ...a, features: { ...a.features, darshan: area(false, MEMBER, 'sign_in'), puja: area(false, COMMUNITY, 'sign_in') } }), ALL_ON)).toEqual([]);
  });
  it('leaves out an area whose module is off', () => {
    expect(guestAreas(snapshot(visitorAnswer()), off('content'))).toEqual(['puja']);
    expect(guestAreas(snapshot(visitorAnswer()), off('gyan_path'))).toEqual(['darshan']);
  });
  it('offers nothing until the answer is in', () => {
    expect(guestAreas(null, ALL_ON)).toEqual([]);
  });
  it("works out what is open to everyone from a member's answer too", () => {
    const a = communityAnswer();
    expect(guestAreas(snapshot(a), ALL_ON)).toEqual(['darshan', 'puja']);
    // Live darshan is allowed to this member by their level, not open to the public.
    expect(guestAreas(snapshot({ ...a, level: MEMBER, features: { ...a.features, darshan: area(true, MEMBER), puja: area(true, PUBLIC) } }), ALL_ON)).toEqual(['puja']);
    // An area the answer does not mention is not assumed open to everyone.
    expect(guestAreas(snapshot({ level: COMMUNITY, signed_in: true, features: {} }), ALL_ON)).toEqual([]);
  });
  it('opens the screens the Home doors open, with the words Home uses', () => {
    expect(GUEST_DOORS.darshan).toEqual({ route: '/darshan', label: 'home.watchDarshan' });
    expect(GUEST_DOORS.puja).toEqual({ route: '/puja', label: 'puja.entry' });
    expect(t(GUEST_DOORS.darshan.label)).toBe('Watch live darshan');
    expect(t(GUEST_DOORS.puja.label)).toBe('Do puja');
  });
});

describe('Welcome: only the doors that lead somewhere', () => {
  const checks = (darshan: DoorCheck, puja: DoorCheck) => ({ darshan, puja });

  it('shows a door when the community has something behind it', () => {
    expect(guestDoorsToShow(['darshan', 'puja'], checks('leads', 'leads'))).toEqual(['darshan', 'puja']);
  });
  it('leaves out a door with nothing behind it, so a visitor is never taken to "Live darshan is offline"', () => {
    expect(guestDoorsToShow(['darshan', 'puja'], checks('nothing', 'leads'))).toEqual(['puja']);
    expect(guestDoorsToShow(['darshan', 'puja'], checks('leads', 'nothing'))).toEqual(['darshan']);
    expect(guestDoorsToShow(['darshan', 'puja'], checks('nothing', 'nothing'))).toEqual([]);
  });
  it('shows nothing until every check has settled, so the section does not grow door by door', () => {
    expect(guestDoorsToShow(['darshan', 'puja'], checks('leads', 'checking'))).toEqual([]);
    expect(guestDoorsToShow(['darshan', 'puja'], checks('checking', 'checking'))).toEqual([]);
  });
  it('keeps a door whose check failed: the screen it opens says what went wrong, with Try again', () => {
    expect(guestDoorsToShow(['darshan', 'puja'], checks('failed', 'nothing'))).toEqual(['darshan']);
  });
  it('does not wait for, or show, a door that is not open to the public', () => {
    expect(guestDoorsToShow(['puja'], checks('checking', 'leads'))).toEqual(['puja']);
    expect(guestDoorsToShow([], checks('leads', 'leads'))).toEqual([]);
  });
  it('works out one door from its load: wanted, being read, failed, or answered', () => {
    expect(doorCheckFor(false, { loading: false, error: null, data: true })).toBe('nothing');
    expect(doorCheckFor(true, { loading: true, error: null, data: undefined })).toBe('checking');
    // The load keeps the answer for the earlier inputs while the new ones are read: still checking.
    expect(doorCheckFor(true, { loading: true, error: null, data: false })).toBe('checking');
    expect(doorCheckFor(true, { loading: false, error: new Error('network'), data: undefined })).toBe('failed');
    expect(doorCheckFor(true, { loading: false, error: new Error('network'), data: true })).toBe('failed');
    expect(doorCheckFor(true, { loading: false, error: null, data: true })).toBe('leads');
    expect(doorCheckFor(true, { loading: false, error: null, data: false })).toBe('nothing');
    expect(doorCheckFor(true, { loading: false, error: null, data: undefined })).toBe('nothing');
  });
});

describe('holding the answer for the right person', () => {
  const guest = snapshot(visitorAnswer());
  const member = snapshot(communityAnswer());
  const failure = new AppError("We couldn't check what you can use here.", 'network');

  it('keeps one answer per person and community', () => {
    expect(accessScope('c1', 'u1', 'p1')).toBe('c1#u1#p1');
    expect(accessScope('c1', 'u1', null)).toBe('c1#u1#');
    expect(accessScope('c1', null, null)).toBe('c1##');
    expect(accessScope(null, null, null)).toBe('##');
    expect(accessScope('c1', 'u1', 'p1')).not.toBe(accessScope('c1', null, null));
    expect(accessScope('c1', 'u1', 'p1')).not.toBe(accessScope('c2', 'u1', 'p1'));
    expect(accessScope('c1', 'u1', 'p1')).not.toBe(accessScope('c1', 'u1', 'p2'));
  });
  it('is another answer once the login is linked to the community (the end of onboarding)', () => {
    // Before the link the database counts the login as public here; after it, as a member of the community.
    const unlinked = accessScope('c1', 'u1', null);
    const linked = accessScope('c1', 'u1', 'p1');
    expect(unlinked).not.toBe(linked);
    const held = settleSlot(null, unlinked, { snapshot: guest });
    expect(currentSlot(held, unlinked)).toBe(held);
    expect(currentSlot(held, linked)).toBeNull(); // the new member is not shown the answer for a visitor
  });
  it('replaces what was held with a new answer', () => {
    const first = settleSlot(null, 'c1#', { snapshot: guest });
    expect(first).toEqual({ scope: 'c1#', snapshot: guest, error: null });
    expect(settleSlot(first, 'c1#', { snapshot: member })).toEqual({ scope: 'c1#', snapshot: member, error: null });
  });
  it('clears an earlier failure when an answer comes', () => {
    const failed = settleSlot(null, 'c1#', { error: failure });
    expect(failed).toEqual({ scope: 'c1#', snapshot: null, error: failure });
    expect(settleSlot(failed, 'c1#', { snapshot: guest }).error).toBeNull();
  });
  it('keeps the answer for the same person when a refresh fails', () => {
    const held = settleSlot(null, 'c1#u1', { snapshot: member });
    expect(settleSlot(held, 'c1#u1', { error: failure })).toEqual({ scope: 'c1#u1', snapshot: member, error: failure });
  });
  it("never keeps another person's answer when a read fails", () => {
    const held = settleSlot(null, 'c1#u1', { snapshot: member });
    expect(settleSlot(held, 'c1#', { error: failure })).toEqual({ scope: 'c1#', snapshot: null, error: failure });
    expect(settleSlot(held, 'c2#u1', { error: failure }).snapshot).toBeNull();
  });
  it("never uses another person's answer", () => {
    const held = settleSlot(null, 'c1#u1', { snapshot: member });
    expect(currentSlot(held, 'c1#u1')).toBe(held);
    expect(currentSlot(held, 'c1#')).toBeNull(); // signed out
    expect(currentSlot(held, 'c1#u2')).toBeNull(); // someone else signed in
    expect(currentSlot(held, 'c2#u1')).toBeNull(); // another community
    expect(currentSlot(null, 'c1#')).toBeNull();
  });
});

describe('when to read the answer', () => {
  const visitor = { signedIn: false, memberLoading: false, scope: accessScope('c1', null, null), missingFor: null };
  const unlinked = { signedIn: true, memberLoading: false, scope: accessScope('c1', 'u1', null), missingFor: null };
  const linked = { signedIn: true, memberLoading: false, scope: accessScope('c1', 'u1', 'p1'), missingFor: null };

  it('reads for a visitor at once, whatever the member load is doing', () => {
    expect(accessReadDue(visitor)).toBe(true);
    expect(accessReadDue({ ...visitor, memberLoading: true })).toBe(true);
  });
  it("waits while a signed-in person's link to the community is being looked up", () => {
    // A returning member then gets one read, after their link is known, not one now and another after it.
    expect(accessReadDue({ ...linked, memberLoading: true, scope: accessScope('c1', 'u1', null) })).toBe(false);
  });
  it('reads once the link is known: for a new login that is not linked yet, and again when it is linked', () => {
    expect(accessReadDue(unlinked)).toBe(true);
    expect(accessReadDue(linked)).toBe(true);
  });
  it('does not ask a portal without the function again for the same person and community', () => {
    expect(accessReadDue({ ...visitor, missingFor: visitor.scope })).toBe(false);
    expect(accessReadDue({ ...linked, missingFor: linked.scope })).toBe(false);
  });
  it('asks again for another person or community, and when the last read did not find the function missing', () => {
    // An old portal for the visitor, then the portal is deployed: the member's read works (missingFor goes back to null).
    expect(accessReadDue({ ...linked, missingFor: visitor.scope })).toBe(true);
    expect(accessReadDue({ ...visitor, missingFor: linked.scope })).toBe(true);
    expect(accessReadDue({ ...visitor, scope: accessScope('c2', null, null), missingFor: visitor.scope })).toBe(true);
    expect(accessReadDue(visitor)).toBe(true);
  });
});

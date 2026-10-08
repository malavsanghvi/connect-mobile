import { describe, expect, it } from '@jest/globals';

import { CATEGORY_WORDS, GENERIC_WORDS, wordsFor } from '../../i18n/categories';
import { en } from '../../i18n/en';
import { applySwaps, translateWith, type StringKey } from '../../i18n';
import {
  BUILTIN_PROFILES,
  CHAMBER_PROFILE,
  COMMUNITY_PROFILE,
  FAITH_OTHER_PROFILE,
  categoryModuleLabels,
  categoryModuleMap,
  chooseProfile,
  genericProfile,
  interestLabel,
  interestsToOffer,
  JAIN_LAYOUT,
  JAIN_PROFILE,
  layoutFor,
  mergeModuleMap,
  parseCategoryProfile,
  termSwaps,
  type CategoryProfile,
} from '../categories';
import { canPlanLabh, occasionsFor } from '../../features/special-days';
import { homeRows, learnListenTiles, lifeTiles } from '../home-rails';
import { ALL_ON, MODULE_KEYS, isGiveSectionVisible, isModuleOn, blockingModule } from '../modules';
import { barItems } from '../nav-bar';
import { newExperiencePayload } from './categories-fixtures';

const KINDS: [string, CategoryProfile][] = [
  ['Chamber of commerce', CHAMBER_PROFILE],
  ['Community organization', COMMUNITY_PROFILE],
  ['Faith-based (other)', FAITH_OTHER_PROFILE],
];

const say = (profile: CategoryProfile) => (key: StringKey, vars?: Record<string, string | number>) => translateWith('en', key, vars, wordsFor(profile));

const member = { isAdult: true, hasHousehold: true };
const everything = { guide: true, learn: true, listen: true, look: true };

describe('the experiences the app has built in', () => {
  it('are exactly the kinds the database seeds, each with its own profile', () => {
    expect(Object.keys(BUILTIN_PROFILES).sort()).toEqual(['chamber_of_commerce', 'faith_other', 'jain_center', 'nonprofit_secular']);
    for (const [, p] of KINDS) expect(BUILTIN_PROFILES[p.key]).toBe(p);
    expect(Object.keys(CATEGORY_WORDS).sort()).toEqual(Object.keys(BUILTIN_PROFILES).sort());
  });

  it('never have Bolis, Labh or My Jain Way, and start Store and Niva off', () => {
    for (const [, p] of KINDS) {
      const map = categoryModuleMap(p);
      for (const m of ['bolis', 'labh', 'jain_way'] as const) expect([p.key, m, isModuleOn(map, m)]).toEqual([p.key, m, false]);
      for (const m of ['store', 'niva'] as const) expect([p.key, m, isModuleOn(map, m)]).toEqual([p.key, m, false]);
      for (const m of ['events', 'giving', 'content', 'calendar', 'comms', 'volunteers', 'membership'] as const) expect([p.key, m, isModuleOn(map, m)]).toEqual([p.key, m, true]);
    }
  });

  it('give a chamber and a community organization no Pathshala or Gyan Path, and a faith community its own, off until switched on', () => {
    for (const p of [CHAMBER_PROFILE, COMMUNITY_PROFILE]) {
      expect(isModuleOn(categoryModuleMap(p), 'pathshala')).toBe(false);
      expect(isModuleOn(categoryModuleMap(p), 'gyan_path')).toBe(false);
    }
    expect(isModuleOn(categoryModuleMap(FAITH_OTHER_PROFILE), 'pathshala')).toBe(false);
    expect(isModuleOn(mergeModuleMap(categoryModuleMap(FAITH_OTHER_PROFILE), { pathshala: true, gyan_path: true }), 'gyan_path')).toBe(true);
    expect(categoryModuleLabels(FAITH_OTHER_PROFILE)).toMatchObject({ pathshala: 'Religious school', gyan_path: 'Learning path' });
    expect(categoryModuleLabels(CHAMBER_PROFILE)).toMatchObject({ giving: 'Dues & payments' });
  });
});

describe('the bottom bar of each experience', () => {
  const bar = (p: CategoryProfile, extra = {}) => barItems(mergeModuleMap(categoryModuleMap(p), extra), true, layoutFor(p).practiceTab);

  it('is Home, Events, Pay, My business for a chamber of commerce', () => {
    expect(bar(CHAMBER_PROFILE)).toEqual(['index', 'events', 'give', 'family', 'niva']);
    expect(say(CHAMBER_PROFILE)('tab.give')).toBe('Pay');
    expect(say(CHAMBER_PROFILE)('tab.family')).toBe('My business');
    expect(barItems(categoryModuleMap(CHAMBER_PROFILE), false, false)).toEqual(['index', 'events', 'give', 'family']);
  });

  it('is Home, Events, Give, Family for a community organization', () => {
    expect(barItems(categoryModuleMap(COMMUNITY_PROFILE), false, layoutFor(COMMUNITY_PROFILE).practiceTab)).toEqual(['index', 'events', 'give', 'family']);
    expect(say(COMMUNITY_PROFILE)('tab.give')).toBe('Give');
    expect(say(COMMUNITY_PROFILE)('tab.family')).toBe('Family');
  });

  it('is Home, Events, Give, Learn, Family for another faith, Learn while Learning path, Religious school or the library is on', () => {
    expect(barItems(categoryModuleMap(FAITH_OTHER_PROFILE), false, layoutFor(FAITH_OTHER_PROFILE).practiceTab)).toEqual(['index', 'events', 'give', 'jain-way', 'family']);
    expect(say(FAITH_OTHER_PROFILE)('tab.jainWay')).toBe('Learn');
    const noLibrary = mergeModuleMap(categoryModuleMap(FAITH_OTHER_PROFILE), { content: false });
    expect(barItems(noLibrary, false, true)).not.toContain('jain-way'); // nothing left in it
    expect(barItems(mergeModuleMap(noLibrary, { gyan_path: true }), false, true)).toContain('jain-way');
  });

  it('is the five tabs of today, and Jain Way, for a Jain Center', () => {
    expect(barItems(categoryModuleMap(JAIN_PROFILE), false, layoutFor(JAIN_PROFILE).practiceTab)).toEqual(['index', 'events', 'give', 'jain-way', 'family']);
    expect(say(JAIN_PROFILE)('tab.jainWay')).toBe('Jain Way');
  });

  it('follows an administrator: a chamber that switches its store on gets nothing extra in the bar, one that turns Events off loses the tab', () => {
    expect(bar(CHAMBER_PROFILE, { store: true })).toEqual(bar(CHAMBER_PROFILE));
    expect(bar(CHAMBER_PROFILE, { events: false, calendar: false, content: false })).toEqual(['index', 'give', 'family', 'niva']);
  });

  it('sends a link to the fourth tab of a chamber nowhere it can open (its module gate still knows the tab)', () => {
    expect(layoutFor(CHAMBER_PROFILE).practiceTab).toBe(false);
    expect(blockingModule(ALL_ON, 'jain-way')).toBeNull();
  });
});

describe('Home for each experience', () => {
  const rows = (p: CategoryProfile, who: typeof member | null = member) =>
    homeRows({ rules: {}, modules: categoryModuleMap(p), member: who, access: everything, layout: layoutFor(p) });

  it('shows the greeting and the date only, never the panchang, for every experience but a Jain Center', () => {
    for (const [, p] of KINDS) expect([p.key, layoutFor(p).todayCard]).toEqual([p.key, 'basic']);
    expect(layoutFor(JAIN_PROFILE).todayCard).toBe('full');
  });

  it('is Today, Events, Give, Life (and a photos row) for a chamber and a community organization', () => {
    for (const p of [CHAMBER_PROFILE, COMMUNITY_PROFILE]) expect(rows(p)).toEqual(['today', 'events', 'give', 'life', 'learnListen']);
  });

  it('adds the family’s special days for another faith', () => {
    expect(rows(FAITH_OTHER_PROFILE)).toEqual(['today', 'specialDays', 'events', 'give', 'life', 'learnListen']);
    expect(lifeTiles({ modules: categoryModuleMap(FAITH_OTHER_PROFILE), guideAllowed: true, member, specialDays: layoutFor(FAITH_OTHER_PROFILE).specialDays })).toContain('specialDays');
    expect(lifeTiles({ modules: categoryModuleMap(CHAMBER_PROFILE), guideAllowed: true, member, specialDays: layoutFor(CHAMBER_PROFILE).specialDays })).not.toContain('specialDays');
  });

  it('starts with the shortcuts of its kind, and keeps the administrator’s own choice over them', () => {
    const tiles = (p: CategoryProfile, rules: unknown = {}) =>
      learnListenTiles({ rules, modules: categoryModuleMap(p), signedIn: true, access: everything, defaultShortcuts: layoutFor(p).shortcuts });
    expect(layoutFor(CHAMBER_PROFILE).shortcuts).toEqual(['photos', 'guide']);
    expect(tiles(CHAMBER_PROFILE)).toEqual(['photos']);
    expect(tiles(COMMUNITY_PROFILE)).toEqual(['photos']);
    expect(layoutFor(FAITH_OTHER_PROFILE).shortcuts).toEqual(['learn', 'photos', 'podcast', 'guide']);
    expect(tiles(FAITH_OTHER_PROFILE)).toEqual(['podcasts', 'photos']); // Learn needs Gyan Path (off until switched on)
    expect(tiles(FAITH_OTHER_PROFILE, { home: { shortcuts: ['playlist'] } })).toEqual(['playlist']);
    expect(tiles(JAIN_PROFILE)).toEqual(learnListenTiles({ rules: {}, modules: ALL_ON, signedIn: true, access: everything }));
  });

  it('shows the Jain Center a Home that is exactly today’s', () => {
    expect(rows(JAIN_PROFILE)).toEqual(['today', 'specialDays', 'events', 'give', 'life', 'learnListen']);
    expect(rows(JAIN_PROFILE, null)).toEqual(homeRows({ rules: {}, modules: ALL_ON, member: null, access: everything }));
  });
});

describe('sign-up and the profile for each experience', () => {
  it('asks the topics of its kind', () => {
    expect(interestsToOffer(layoutFor(CHAMBER_PROFILE))).toEqual(['events', 'networking', 'volunteering', 'committees']);
    expect(interestsToOffer(layoutFor(COMMUNITY_PROFILE))).toEqual(['events', 'volunteering', 'youth', 'seniors', 'giving']);
    expect(interestsToOffer(layoutFor(FAITH_OTHER_PROFILE))).toEqual(['events', 'pathshala', 'volunteering', 'youth', 'seniors', 'giving']);
    expect(interestsToOffer(JAIN_LAYOUT)).toEqual(['events', 'pathshala', 'volunteering', 'youth', 'seniors', 'giving']);
  });

  it('labels each topic in the kind’s words (the faith community’s religious school is not "Pathshala")', () => {
    const t = say(FAITH_OTHER_PROFILE);
    expect(interestLabel(t, 'pathshala')).toBe('Religious school');
    expect(interestLabel(say(JAIN_PROFILE), 'pathshala')).toBe('Pathshala');
    expect(interestLabel(say(CHAMBER_PROFILE), 'networking')).toBe('Networking');
    expect(interestLabel(say(CHAMBER_PROFILE), 'committees')).toBe('Committees');
  });

  it('plans special days only where the kind has them, and by tithi only where it has a panchang', () => {
    expect(layoutFor(CHAMBER_PROFILE).specialDays).toBe(false);
    expect(layoutFor(COMMUNITY_PROFILE).specialDays).toBe(false);
    expect(layoutFor(FAITH_OTHER_PROFILE).specialDays).toBe(true);
    expect(layoutFor(FAITH_OTHER_PROFILE).tithiDates).toBe(false);
    expect(occasionsFor(false)).toEqual(['birthday', 'anniversary', 'other']);
    expect(occasionsFor(true)).toEqual(['birthday', 'anniversary', 'birth_tithi', 'punyatithi', 'other']);
    expect(layoutFor(JAIN_PROFILE).tithiDates).toBe(true);
  });
});

describe('Labh follows its own module', () => {
  it('is on for a Jain Center whatever an older database says, and never for the other experiences', () => {
    expect(isModuleOn(ALL_ON, 'labh')).toBe(true);
    expect(isGiveSectionVisible(ALL_ON, 'labh')).toBe(true);
    for (const [, p] of KINDS) expect(isGiveSectionVisible(categoryModuleMap(p), 'labh')).toBe(false);
  });

  it('needs Pledges & donations on (labh depends on giving)', () => {
    expect(isModuleOn({ giving: false }, 'labh')).toBe(false);
    expect(isModuleOn({ labh: false }, 'giving')).toBe(true);
  });

  it('is offered for a special day only while the module is on', () => {
    const day = { isAdult: true, occasion: 'birthday' as const, labhPromptEnabled: true };
    expect(canPlanLabh({ ...day, labhOn: isModuleOn(ALL_ON, 'labh') })).toBe(true);
    expect(canPlanLabh({ ...day, labhOn: isModuleOn(categoryModuleMap(FAITH_OTHER_PROFILE), 'labh') })).toBe(false);
    expect(canPlanLabh({ ...day, labhOn: isModuleOn({ labh: false }, 'labh') })).toBe(false);
  });

  it('is never on for a chamber even when an older database does not know the Labh module', () => {
    // The database before the Labh module: its answer for a chamber has no "labh" row.
    const old = parseCategoryProfile({
      category: { key: 'chamber_of_commerce', label: 'Chamber of commerce', faith_based: false, uses_tradition: false, terms: CHAMBER_PROFILE.terms },
      modules: Object.fromEntries(MODULE_KEYS.filter((k) => k !== 'labh').map((k) => [k, { availability: k === 'bolis' ? 'not_available' : 'default_on', label: null }])),
    });
    if (!old) throw new Error('profile');
    expect(isModuleOn(categoryModuleMap(old), 'labh')).toBe(true);
    const chosen = chooseProfile({ hint: 'chamber_of_commerce', live: old, cached: null, settled: true });
    expect(chosen.source).toBe('live');
    expect(isModuleOn(categoryModuleMap(chosen.profile), 'labh')).toBe(false);
    // and what the database does say wins over the app's own
    expect(isModuleOn(categoryModuleMap(chosen.profile), 'bolis')).toBe(false);
    expect(isModuleOn(categoryModuleMap(chosen.profile), 'events')).toBe(true);
  });
});

describe('the words of each experience', () => {
  it('speak the greeting and the tab names of the kind', () => {
    expect(say(CHAMBER_PROFILE)('home.greetingFamily', { family: 'Patel' })).toBe('Welcome, Patel');
    expect(say(FAITH_OTHER_PROFILE)('home.greetingLead')).toBe('Welcome,');
    expect(say(JAIN_PROFILE)('home.greetingFamily', { family: 'Shah' })).toBe('Jai Jinendra, Shah');
  });

  it('call the household of a chamber a business, wherever the dictionary says family', () => {
    const t = say(CHAMBER_PROFILE);
    expect(t('match.title')).toBe('Is this your business?');
    expect(t('familyStep.title')).toBe('Your business');
    expect(t('pledges.none')).toBe('Your business has no pledges yet.');
    expect(t('family.members')).toBe('Contacts');
    expect(t('events.membersOnlyBody')).toBe('Sign in with your business account to see it and RSVP.');
    expect(t('sync.resultPledge', { pledge: 'P1', amount: '$100' })).toBe('Pledge P1 for $100 is open on your account. Pay anytime from Pay → Business pledges.');
    expect(t('sync.stepFind', { family: 'Acme Ltd', center: 'Chamber' })).toBe('Finding the Acme Ltd in Chamber records');
    expect(t('paid.title')).toBe('Thank you!');
    expect(t('paid.body', { amount: '$500' })).toBe('Your $500 payment is received.\nA receipt is on its way to your email.');
  });

  it('name the religious school and the learning path of a faith community on every screen that says Pathshala or Gyan Path', () => {
    const t = say(FAITH_OTHER_PROFILE);
    expect(t('drawer.pathshala')).toBe('Religious school');
    expect(t('threeL.guestPathshala')).toBe('Sign in to see your religious school classes.');
    expect(t('modules.label.pathshala')).toBe('Religious school');
    expect(t('modules.label.gyan_path')).toBe('Learning path');
    expect(t('niva.q4')).toBe('How do I sign my child up for religious school?');
    expect(t('drawer.store')).toBe('Store');
    expect(t('store.heroTitle', { center: 'Grace Church' })).toBe('Grace Church Store');
  });

  it('point at the tabs by the names the kind gives them', () => {
    expect(say(CHAMBER_PROFILE)('paid.back')).toBe('Back to Pay');
    expect(say(CHAMBER_PROFILE)('about.subtitle')).toBe('This updates your membership record. You can change it later from the My business tab.');
    expect(say(COMMUNITY_PROFILE)('paid.back')).toBe('Back to Give');
  });

  it('are never the Jain words for a kind the app has no words for', () => {
    const t = say(genericProfile('swaminarayan_temple'));
    expect(t('paid.title')).toBe('Thank you!');
    expect(t('guide.heroEyebrow')).toBe('Welcome');
    expect(GENERIC_WORDS.en?.['niva.q4']).toBe('How can I volunteer?');
  });

  it('can be set by the database for a kind the app has never heard of, over the neutral words', () => {
    const profile = parseCategoryProfile(newExperiencePayload());
    if (!profile) throw new Error('profile');
    const t = say(profile);
    expect(t('tab.give')).toBe('Offerings');
    expect(t('home.todayAt', { center: 'Mandir' })).toBe('Today here');
    expect(t('guide.heroEyebrow')).toBe('Welcome');
    expect(t('drawer.store')).toBe('Prasad shop');
  });
});

describe('swapping a word wherever the dictionary says it', () => {
  it('keeps a capital at the start of a label or sentence and uses a small letter in the middle of one', () => {
    const swaps = [{ from: 'Pathshala', to: 'Religious school', fit: true }];
    expect(applySwaps('Pathshala fee', swaps)).toBe('Religious school fee');
    expect(applySwaps('Pay the Pathshala fee', swaps)).toBe('Pay the religious school fee');
    expect(applySwaps('Classes. Pathshala starts', swaps)).toBe('Classes. Religious school starts');
    expect(applySwaps('{center} Pathshala', swaps)).toBe('{center} Religious school');
  });

  it('leaves the text alone when the word is not there, and when a swap is not for a common noun', () => {
    expect(applySwaps('Nothing here', [{ from: 'Give ›', to: 'Pay ›' }])).toBe('Nothing here');
    expect(applySwaps('from Give › Family pledges', [{ from: 'Give ›', to: 'Pay ›' }])).toBe('from Pay › Family pledges');
  });

  it('makes no swaps for a Jain Center', () => {
    expect(termSwaps(JAIN_PROFILE.terms)).toEqual([]);
  });
});

describe('no Jain word on a screen another experience can open', () => {
  // Features that only a Jain Center has: their screens never open elsewhere (their modules are "never"), or are before sign-in.
  const NOT_FOR_OTHERS = ['gyan', 'learn', 'hw', 'saathi', 'jw', 'puja', 'labh', 'bolis', 'reg', 'teach', 'enrollReq', 'attend', 'attendStatus', 'darshan', 'library', 'welcome', 'community', 'signin', 'legal', 'setup', 'lock', 'boot', 'notFound', 'onboarding', 'player'];
  // Wording that is Jain on purpose and is reached by a Jain feature only (a filter on recipes, the dietary choice a Jain Center seeds, a Jain panchang layer, home cards that need Jain modules).
  const ALLOWED = new Set<string>([
    'details.dietary.jain',
    'calendar.parva',
    'calendar.virSamvat',
    'home.myWay',
    'home.myWayHint',
    'home.navkarsi',
    'home.chauvihar',
    'home.aartiAt',
    'home.watchDarshan',
    'home.watchDarshanAarti',
    'home.special.labhHint',
    'home.planLabh',
    'media.fullyJainOnly',
    'media.fullyJain',
    'media.fullyJainLong',
    'media.notFullyJain',
    'media.noFullyJain',
    'threeL.noFullyJainBody',
    'source.boli',
    'source.pujan',
    'source.labh',
    'source.pathshala_fee',
    'days.kindBirthTithi',
    'days.kindPunyatithi',
    'days.kindDiksha',
    'days.tithiUnknown',
    'days.byTithi',
    'days.tithiField',
    'days.tithiRequired',
    'days.planLabh',
    'days.planLabhLabel',
    'days.labhTitle',
    'days.labhBody',
    'days.labhFailed',
    'days.skipLabh',
    'days.savedPledgeOne',
    'days.savedPledgeMany',
    'give.bolis',
    'give.bolisSub',
    'home.allDone',
    'modules.label.bolis',
    'modules.label.jain_way',
    'access.area.puja',
    'tab.jainWay',
  ]);
  const JAIN_WORD = /\b(jain|jai jinendra|tithis?|pujas?|pujans?|labh|bolis?|pathshala|gyan|derasar|darshan|stavans?|satvik|navkar\w*|aarti|anumodana|seva|panchang|punyatithis?|diksha|parva|samvat|pachchakhan|sutra|tapasya|guruji|mithai|namkeen|chauvihar)\b/i;

  // The names of the Pathshala and Gyan Path, on the screens of those modules: a kind with neither module never opens them. A faith community that names its religious school has them swapped.
  const NEEDS_A_SCHOOL = new Set<string>(['drawer.pathshala', 'profile.interest.pathshala', 'modules.label.pathshala', 'modules.label.gyan_path', 'threeL.guestPathshala']);
  const shared = (Object.keys(en) as StringKey[]).filter((k) => !NOT_FOR_OTHERS.includes(k.split('.')[0]) && !ALLOWED.has(k));
  const sharedWithoutSchool = shared.filter((k) => !NEEDS_A_SCHOOL.has(k));

  it('is checked over a real number of screens', () => {
    expect(shared.length).toBeGreaterThan(1500);
  });

  for (const [name, p] of [['a chamber of commerce', CHAMBER_PROFILE], ['a community organization', COMMUNITY_PROFILE], ['an unknown experience', genericProfile('anything')]] as [string, CategoryProfile][]) {
    it(`holds for ${name}`, () => {
      const t = say(p);
      const offenders = sharedWithoutSchool.filter((k) => JAIN_WORD.test(t(k, { center: 'Org', family: 'Acme', name: 'Asha', event: 'Mixer', zone: 'North', n: 2, amount: '$5', people: '2 people', pledge: 'P1', year: 2026, time: '8:00' })));
      expect(offenders).toEqual([]);
    });
  }

  it('holds for another faith, whose religious school and learning path take the place of the Jain names', () => {
    const t = say(FAITH_OTHER_PROFILE);
    const offenders = shared.filter((k) => JAIN_WORD.test(t(k, { center: 'Org', family: 'Acme', name: 'Asha', event: 'Mixer', zone: 'North', n: 2, amount: '$5', people: '2 people', pledge: 'P1', year: 2026, time: '8:00' })));
    expect(offenders).toEqual([]);
  });

  it('is not a way round the rule: the allowed keys are all real keys', () => {
    for (const k of ALLOWED) expect([k, k in en]).toEqual([k, true]);
  });
});

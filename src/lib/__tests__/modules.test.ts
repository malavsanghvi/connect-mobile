import { describe, expect, it } from '@jest/globals';

import { FEATURE_KEYS, FEATURE_MODULE, isFeatureKey } from '../access';
import { MEDIA_KINDS } from '../media-library';
import {
  ALL_ON,
  anyModuleOn,
  blockingModule,
  DRAWER_MODULE,
  eventsPanes,
  GUIDE_SECTION_MODULE,
  HOME_CARD_MODULE,
  isDrawerEntryVisible,
  isGuideSectionVisible,
  isHomeCardVisible,
  isMissingRpcError,
  isModuleKey,
  isModuleOn,
  isTabVisible,
  jainWayPanes,
  MEDIA_KIND_FEATURE,
  MODULE_DEPENDS_ON,
  MODULE_KEYS,
  parseModuleRows,
  pickPane,
  resolveJainWayLink,
  ROUTE_FEATURE,
  ROUTE_MODULE,
  routeFeature,
  TAB_MODULES,
  threeLSections,
  type ModuleMap,
} from '../modules';

const off = (...keys: (typeof MODULE_KEYS)[number][]): ModuleMap => Object.fromEntries(keys.map((k) => [k, false]));

describe('module keys', () => {
  it('matches the contract list exactly', () => {
    expect([...MODULE_KEYS].sort()).toEqual(
      ['people', 'membership', 'events', 'giving', 'bolis', 'store', 'pathshala', 'gyan_path', 'jain_way', 'content', 'calendar', 'comms', 'surveys', 'volunteers', 'accounting', 'reports', 'niva', 'governance'].sort(),
    );
  });
  it('only refers to known keys in every map', () => {
    const refs: unknown[] = [
      ...Object.values(TAB_MODULES).flatMap((v) => v ?? []),
      ...Object.values(HOME_CARD_MODULE),
      ...Object.values(DRAWER_MODULE),
      ...Object.values(GUIDE_SECTION_MODULE),
      ...Object.values(ROUTE_MODULE),
      ...Object.entries(MODULE_DEPENDS_ON).flatMap(([k, v]) => [k, ...(v ?? [])]),
    ].filter((v) => v !== null);
    expect(refs.filter((r) => !isModuleKey(r))).toEqual([]);
  });
});

describe('parseModuleRows', () => {
  it('reads my_modules rows; unknown keys are ignored and core stays on', () => {
    const { map, labels } = parseModuleRows([
      { key: 'giving', label: 'Pledges & donations', enabled: false, core: false },
      { key: 'events', label: 'Events & RSVP', enabled: true, core: false },
      { key: 'people', label: 'Members & families', enabled: false, core: true },
      { key: 'telepathy', label: 'Future module', enabled: false, core: false },
      { key: 'store', label: null, enabled: null, core: null },
      null,
      'junk',
    ]);
    expect(map).toEqual({ giving: false, events: true, people: true, store: true });
    expect(labels.giving).toBe('Pledges & donations');
    expect(labels.store).toBeUndefined();
  });
  it('treats anything that is not an array as "all on"', () => {
    expect(parseModuleRows(null).map).toEqual({});
    expect(parseModuleRows({ key: 'giving' }).map).toEqual({});
  });
});

describe('isModuleOn', () => {
  it('is on when the database did not mention the module', () => {
    for (const k of MODULE_KEYS) expect(isModuleOn(ALL_ON, k)).toBe(true);
  });
  it('never switches a core module off', () => {
    expect(isModuleOn({ people: false }, 'people')).toBe(true);
  });
  it('switches a module off with its dependency', () => {
    expect(isModuleOn(off('giving'), 'bolis')).toBe(false);
    expect(isModuleOn(off('giving'), 'accounting')).toBe(false);
    expect(isModuleOn(off('content'), 'niva')).toBe(false);
    expect(isModuleOn(off('bolis'), 'giving')).toBe(true);
  });
  it('anyModuleOn: null / empty means always', () => {
    expect(anyModuleOn(off('giving'), null)).toBe(true);
    expect(anyModuleOn(off('giving'), [])).toBe(true);
    expect(anyModuleOn(off('giving'), 'giving')).toBe(false);
    expect(anyModuleOn(off('giving'), ['giving', 'bolis'])).toBe(false);
    expect(anyModuleOn(off('bolis'), ['giving', 'bolis'])).toBe(true);
  });
});

describe('tabs', () => {
  it('shows every tab by default', () => {
    for (const tab of Object.keys(TAB_MODULES) as (keyof typeof TAB_MODULES)[]) expect(isTabVisible(ALL_ON, tab)).toBe(true);
  });
  it('hides Give only when giving and bolis are both off', () => {
    expect(isTabVisible(off('bolis'), 'give')).toBe(true);
    expect(isTabVisible(off('giving'), 'give')).toBe(false); // bolis depends on giving
    expect(isTabVisible(off('giving', 'bolis'), 'give')).toBe(false);
  });
  it('hides Jain Way only when all of its segments are off', () => {
    expect(isTabVisible(off('jain_way', 'gyan_path', 'pathshala'), 'jain-way')).toBe(true); // 3L still on (content)
    expect(isTabVisible(off('jain_way', 'gyan_path', 'pathshala', 'content'), 'jain-way')).toBe(false);
  });
  it('keeps Home and Family always', () => {
    const everything = off(...MODULE_KEYS);
    expect(isTabVisible(everything, 'index')).toBe(true);
    expect(isTabVisible(everything, 'family')).toBe(true);
    expect(isTabVisible(everything, 'events')).toBe(false);
  });
});

describe('Home, drawer and guide', () => {
  it('maps Home cards to their modules', () => {
    const m = off('events', 'store', 'jain_way', 'surveys', 'comms', 'giving', 'content');
    expect(isHomeCardVisible(m, 'today')).toBe(true);
    expect(isHomeCardVisible(m, 'guide')).toBe(true);
    for (const card of ['lunch', 'confirm', 'nextEvent', 'jainWay', 'feedback', 'alerts', 'giving', 'todayDarshan'] as const) {
      expect(isHomeCardVisible(m, card)).toBe(false);
    }
  });
  it('keeps special days on Home with giving off (they offer "See special days" instead of a labh)', () => {
    expect(isHomeCardVisible(off('giving'), 'specialDay')).toBe(true);
    expect(isHomeCardVisible(off('giving'), 'giving')).toBe(false);
  });
  it('maps the Home rails to their modules', () => {
    const rails = ['railLearning', 'railEvents', 'railListen', 'giving', 'railPhotos', 'railRecipes'] as const;
    for (const rail of rails) expect(isHomeCardVisible(ALL_ON, rail)).toBe(true);
    expect(rails.filter((r) => !isHomeCardVisible(off('gyan_path'), r))).toEqual(['railLearning']);
    expect(rails.filter((r) => !isHomeCardVisible(off('events'), r))).toEqual(['railEvents']);
    expect(rails.filter((r) => !isHomeCardVisible(off('content'), r))).toEqual(['railListen', 'railPhotos', 'railRecipes']);
    expect(rails.filter((r) => !isHomeCardVisible(off('giving'), r))).toEqual(['giving']);
    // Every module switched off (only the core one stays on) hides every rail.
    expect(rails.filter((r) => isHomeCardVisible(off(...MODULE_KEYS), r))).toEqual([]);
  });
  it('maps drawer entries to their modules', () => {
    const m = off('calendar', 'pathshala', 'giving', 'store', 'events', 'reports');
    for (const e of ['calendar', 'pathshala', 'donations', 'store', 'rsvp', 'dashboard', 'volunteer'] as const) expect(isDrawerEntryVisible(m, e)).toBe(false);
    expect(isDrawerEntryVisible(m, 'guide')).toBe(true);
    expect(isDrawerEntryVisible(m, 'settings')).toBe(true);
    expect(isDrawerEntryVisible(m, 'niva')).toBe(true);
  });
  it('shows Ask Niva in the drawer and the guide only while Niva (and Content, which it needs) is on', () => {
    expect(isDrawerEntryVisible(ALL_ON, 'niva')).toBe(true);
    expect(isGuideSectionVisible(ALL_ON, 'niva')).toBe(true);
    for (const m of [off('niva'), off('content')]) {
      expect(isDrawerEntryVisible(m, 'niva')).toBe(false);
      expect(isGuideSectionVisible(m, 'niva')).toBe(false);
    }
    // Ask a question is comms: switching it off leaves Ask Niva, and the other way round.
    expect(isGuideSectionVisible(off('comms'), 'niva')).toBe(true);
    expect(isGuideSectionVisible(off('niva'), 'ask')).toBe(true);
  });
  it('maps guide sections (WhatsApp is comms)', () => {
    expect(isGuideSectionVisible(off('comms'), 'whatsapp')).toBe(false);
    expect(isGuideSectionVisible(off('comms'), 'ask')).toBe(false);
    expect(isGuideSectionVisible(off('volunteers'), 'volunteer')).toBe(false);
    expect(isGuideSectionVisible(off('membership'), 'membership')).toBe(false);
    expect(isGuideSectionVisible(off(...MODULE_KEYS), 'zones')).toBe(true);
  });
});

describe('segments', () => {
  it('Events: only the segments whose module is on', () => {
    expect(eventsPanes(ALL_ON)).toEqual(['upcoming', 'calendar', 'photos']);
    expect(eventsPanes(off('calendar'))).toEqual(['upcoming', 'photos']);
    expect(eventsPanes(off('events', 'content'))).toEqual(['calendar']);
  });
  it('Jain Way: Today/Saathi = jain_way, 3L = content, gyan_path or pathshala', () => {
    expect(jainWayPanes(ALL_ON, true)).toEqual(['today', 'three_l', 'saathi']);
    expect(jainWayPanes(off('jain_way'), true)).toEqual(['three_l']);
    expect(jainWayPanes(off('content'), true)).toEqual(['today', 'three_l', 'saathi']);
    expect(jainWayPanes(off('content', 'gyan_path'), true)).toEqual(['today', 'three_l', 'saathi']); // Pathshala still on
    expect(jainWayPanes(off('content', 'gyan_path', 'pathshala'), true)).toEqual(['today', 'saathi']);
    expect(jainWayPanes(ALL_ON, false)).toEqual(['three_l']);
    expect(jainWayPanes(off('content'), false)).toEqual(['three_l']);
    expect(jainWayPanes(off('content', 'gyan_path', 'pathshala'), false)).toEqual([]);
  });
  it('3L sections: Look and Listen = content, Learn always', () => {
    expect(threeLSections(ALL_ON)).toEqual(['look', 'listen', 'learn']);
    expect(threeLSections(off('content'))).toEqual(['learn']);
    expect(threeLSections(off('gyan_path', 'pathshala'))).toEqual(['look', 'listen', 'learn']);
  });
  it('old Jain Way links still land in the right place', () => {
    expect(resolveJainWayLink('learn', undefined)).toEqual({ tab: 'three_l', section: 'learn' });
    expect(resolveJainWayLink('library', undefined)).toEqual({ tab: 'three_l', section: 'look' });
    expect(resolveJainWayLink('Library', 'listen')).toEqual({ tab: 'three_l', section: 'look' });
    expect(resolveJainWayLink('listen', undefined)).toEqual({ tab: 'three_l', section: 'listen' });
    expect(resolveJainWayLink('3L', 'learn')).toEqual({ tab: 'three_l', section: 'learn' });
    expect(resolveJainWayLink('three_l', 'look')).toEqual({ tab: 'three_l', section: 'look' });
    expect(resolveJainWayLink('saathi', undefined)).toEqual({ tab: 'saathi', section: undefined });
    expect(resolveJainWayLink(undefined, undefined)).toEqual({ tab: undefined, section: undefined });
    expect(resolveJainWayLink('constructor', undefined)).toEqual({ tab: 'constructor', section: undefined });
  });
  it('pickPane falls back to a visible pane', () => {
    expect(pickPane('three_l', ['today', 'three_l'] as const)).toBe('three_l');
    expect(pickPane('calendar', ['upcoming', 'photos'] as const, 'upcoming')).toBe('upcoming');
    expect(pickPane(undefined, ['three_l', 'saathi'] as const, 'today')).toBe('three_l');
    expect(pickPane('x', [] as string[])).toBeNull();
  });
});

describe('blockingModule (deep links)', () => {
  it('lets everything open by default', () => {
    for (const name of [...Object.keys(ROUTE_MODULE), ...Object.keys(TAB_MODULES), 'settings', 'member-card', 'guide/zones']) {
      expect(blockingModule(ALL_ON, name)).toBeNull();
    }
  });
  it('blocks pushed screens of a switched-off module', () => {
    expect(blockingModule(off('store'), 'store')).toBe('store');
    expect(blockingModule(off('store'), 'cart')).toBe('store');
    expect(blockingModule(off('events'), 'event/[id]/tickets')).toBe('events');
    expect(blockingModule(off('gyan_path'), 'gyan/[goalId]/level/[levelId]')).toBe('gyan_path');
    expect(blockingModule(off('gyan_path'), 'gyan')).toBe('gyan_path');
    expect(blockingModule(off('comms'), 'guide/whatsapp')).toBe('comms');
    expect(blockingModule(off('niva'), '/niva')).toBe('niva');
    for (const name of ['media/[kind]', 'media/[kind]/[id]', 'recipe/[id]', 'recipe/random', 'listen/playlist', 'listen/podcast-random']) {
      expect(blockingModule(off('content'), name)).toBe('content');
    }
  });
  it('blocks a module whose dependency is off', () => {
    expect(blockingModule(off('giving'), 'boli/[id]')).toBe('bolis');
  });
  it('blocks a tab only when all its modules are off', () => {
    expect(blockingModule(off('giving'), 'give')).toBe('giving');
    expect(blockingModule(off('bolis'), 'give')).toBeNull();
    expect(blockingModule(off(...MODULE_KEYS), 'family')).toBeNull();
  });
  it('never treats Object prototype names as routes', () => {
    expect(blockingModule(off(...MODULE_KEYS), 'constructor')).toBeNull();
    expect(blockingModule(off(...MODULE_KEYS), 'toString')).toBeNull();
  });
});

describe('routeFeature (the access area of a pushed screen)', () => {
  it('maps the screens of each area', () => {
    expect(routeFeature('darshan')).toBe('darshan');
    expect(routeFeature('puja')).toBe('puja');
    expect(routeFeature('niva')).toBe('niva');
    expect(routeFeature('/niva')).toBe('niva');
    for (const name of ['gyan', 'gyan/index', 'gyan/[goalId]', 'gyan/[goalId]/index', 'gyan/[goalId]/level/[levelId]']) expect(routeFeature(name)).toBe('learn');
    expect(routeFeature('recipe/[id]')).toBe('look');
    expect(routeFeature('recipe/random')).toBe('look');
    expect(routeFeature('listen/playlist')).toBe('listen');
    expect(routeFeature('listen/podcast-random')).toBe('listen');
  });
  it('tells Listen from Look by what the library screen opens', () => {
    for (const name of ['media/[kind]', 'media/[kind]/index', 'media/[kind]/[id]']) {
      expect(routeFeature(name, { kind: 'stavan' })).toBe('listen');
      expect(routeFeature(name, { kind: 'podcast' })).toBe('listen');
      expect(routeFeature(name, { kind: 'video' })).toBe('look');
      expect(routeFeature(name, { kind: 'recipe', id: 'r1' })).toBe('look');
      expect(routeFeature(name, { kind: 'telepathy' })).toBeNull();
      expect(routeFeature(name, { kind: ['stavan'] })).toBeNull();
      expect(routeFeature(name, {})).toBeNull();
      expect(routeFeature(name, undefined)).toBeNull();
      expect(routeFeature(name, null)).toBeNull();
    }
    expect(Object.keys(MEDIA_KIND_FEATURE).sort()).toEqual(['podcast', 'recipe', 'stavan', 'video']);
  });
  it('puts every kind of library item in an area, so an item opened by a hand-made link is gated by what it is', () => {
    // MediaItemView gates on the item's own kind, not the kind in the address: a video opened as /media/stavan/<id> is Look.
    expect([...MEDIA_KINDS].sort()).toEqual(Object.keys(MEDIA_KIND_FEATURE).sort());
    for (const kind of MEDIA_KINDS) expect(isFeatureKey(MEDIA_KIND_FEATURE[kind])).toBe(true);
    expect(MEDIA_KIND_FEATURE.stavan).toBe('listen');
    expect(MEDIA_KIND_FEATURE.podcast).toBe('listen');
    expect(MEDIA_KIND_FEATURE.video).toBe('look');
    expect(MEDIA_KIND_FEATURE.recipe).toBe('look');
  });
  it('maps the guide, but not its timings', () => {
    for (const name of ['guide', 'guide/index', 'guide/[slug]', 'guide/zones', 'guide/membership', 'guide/apply', 'guide/ask', 'guide/links', 'guide/admin', 'guide/registrations', 'guide/volunteer', 'guide/whatsapp']) {
      expect(routeFeature(name)).toBe('guide');
    }
    expect(routeFeature('guide/timings')).toBeNull();
  });
  it('leaves money, events, family and Pathshala to their own checks', () => {
    for (const name of ['event/[id]/index', 'pledges', 'bolis', 'store', 'cart', 'settings', 'member-card', 'pathshala-enroll', 'person/[id]', 'pachchakhan/[id]', 'album/[id]', 'volunteer', 'give', 'family']) {
      expect(routeFeature(name)).toBeNull();
    }
  });
  it('never treats Object prototype names as routes', () => {
    for (const name of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) expect(routeFeature(name)).toBeNull();
    expect(routeFeature('media/[kind]', { kind: 'constructor' })).toBeNull();
    expect(routeFeature('media/[kind]', { kind: '__proto__' })).toBeNull();
  });
  it('only names areas of the catalog', () => {
    for (const feature of [...Object.values(ROUTE_FEATURE), ...Object.values(MEDIA_KIND_FEATURE)]) expect(isFeatureKey(feature)).toBe(true);
  });
  it("agrees with the module map: a screen's area and its module are the same module", () => {
    for (const [route, feature] of Object.entries(ROUTE_FEATURE)) {
      const areaModule = FEATURE_MODULE[feature];
      if (areaModule === null || !(route in ROUTE_MODULE)) continue;
      expect(ROUTE_MODULE[route]).toBe(areaModule);
    }
    // The library screens: both of their areas sit in Content.
    expect(ROUTE_MODULE['media/[kind]/index']).toBe(FEATURE_MODULE.listen);
    expect(ROUTE_MODULE['media/[kind]/index']).toBe(FEATURE_MODULE.look);
    expect(ROUTE_MODULE['media/[kind]/[id]']).toBe(FEATURE_MODULE.look);
  });
  it('gives every area at least one screen or section to gate (the timings are not gated)', () => {
    const used = new Set<string>([...Object.values(ROUTE_FEATURE), ...Object.values(MEDIA_KIND_FEATURE)]);
    // Live darshan and Virtual puja each have a screen; Listen, Look and Learn have screens and 3L sections; Ask Niva a screen and the button.
    expect([...FEATURE_KEYS].filter((k) => !used.has(k))).toEqual(['timings']);
  });
});

describe('isMissingRpcError', () => {
  it('recognises "function not deployed yet"', () => {
    expect(isMissingRpcError({ code: 'PGRST202', message: 'Could not find the function app.my_modules(p_center) in the schema cache' })).toBe(true);
    expect(isMissingRpcError({ code: '42883', message: 'function app.my_modules(uuid) does not exist' })).toBe(true);
  });
  it('does not hide other failures', () => {
    expect(isMissingRpcError({ code: '42501', message: 'permission denied for function my_modules' })).toBe(false);
    expect(isMissingRpcError(new TypeError('Network request failed'))).toBe(false);
    expect(isMissingRpcError(null)).toBe(false);
  });
});

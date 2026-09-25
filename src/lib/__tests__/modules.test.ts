import { describe, expect, it } from '@jest/globals';

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
  MODULE_DEPENDS_ON,
  MODULE_KEYS,
  parseModuleRows,
  pickPane,
  ROUTE_MODULE,
  TAB_MODULES,
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
    expect(isTabVisible(off('jain_way', 'gyan_path', 'pathshala'), 'jain-way')).toBe(true); // Library still on
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
    for (const card of ['lunch', 'confirm', 'nextEvent', 'jainWay', 'feedback', 'alerts', 'giving', 'specialDay', 'todayDarshan'] as const) {
      expect(isHomeCardVisible(m, card)).toBe(false);
    }
  });
  it('maps drawer entries to their modules', () => {
    const m = off('calendar', 'pathshala', 'giving', 'store', 'events', 'reports');
    for (const e of ['calendar', 'pathshala', 'donations', 'store', 'rsvp', 'dashboard', 'volunteer'] as const) expect(isDrawerEntryVisible(m, e)).toBe(false);
    expect(isDrawerEntryVisible(m, 'guide')).toBe(true);
    expect(isDrawerEntryVisible(m, 'settings')).toBe(true);
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
  it('Jain Way: Today/Saathi = jain_way, Learn = gyan_path or pathshala, Library = content', () => {
    expect(jainWayPanes(ALL_ON, true)).toEqual(['today', 'learn', 'saathi', 'library']);
    expect(jainWayPanes(off('jain_way'), true)).toEqual(['learn', 'library']);
    expect(jainWayPanes(off('gyan_path'), true)).toEqual(['today', 'learn', 'saathi', 'library']);
    expect(jainWayPanes(off('gyan_path', 'pathshala'), true)).toEqual(['today', 'saathi', 'library']);
    expect(jainWayPanes(ALL_ON, false)).toEqual(['library']);
    expect(jainWayPanes(off('content'), false)).toEqual([]);
  });
  it('pickPane falls back to a visible pane', () => {
    expect(pickPane('learn', ['today', 'learn'] as const)).toBe('learn');
    expect(pickPane('calendar', ['upcoming', 'photos'] as const, 'upcoming')).toBe('upcoming');
    expect(pickPane(undefined, ['learn', 'library'] as const, 'today')).toBe('learn');
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

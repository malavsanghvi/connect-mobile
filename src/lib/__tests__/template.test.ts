import { afterEach, describe, expect, it } from '@jest/globals';

import { applyPalette, applyTemplateTheme, colors, radii } from '../../theme';
import {
  genericProfile,
  JAIN_LAYOUT,
  JAIN_PROFILE,
  layoutFor,
  parseCategoryProfile,
  templateProblems,
} from '../categories';
import { brandPalette } from '../community';
import { HOME_ROWS, homeRows, type HomeAccess, type HomeRow } from '../home-rails';
import { ALL_ON, MODULE_KEYS, type ModuleMap } from '../modules';
import { barItems, TABS } from '../nav-bar';
import { serviceTimeRows, SERVICE_TIMES_SHOWN } from '../service-times';
import {
  BUILTIN_TABS,
  contrastWithWhite,
  CRISP_RADII,
  isMotif,
  MAX_TAB_LABEL,
  MOTIFS,
  NO_THEME,
  parseTemplate,
  resolveRows,
  resolveTabs,
  resolveTemplate,
  resolveTheme,
  SURFACE_PALETTES,
  TAB_ICONS,
  TEMPLATE_ROWS,
  todayCardFor,
} from '../template';
import { jainPayload, newExperiencePayload } from './categories-fixtures';

const LEGACY_ROWS: HomeRow[] = ['today', 'specialDays', 'events', 'give', 'life', 'learnListen'];
const LEGACY_BAR = ['index', 'events', 'give', 'jain-way', 'family', 'niva'];

const off = (...keys: (typeof MODULE_KEYS)[number][]): ModuleMap => Object.fromEntries(keys.map((k) => [k, false]));
const adult = { isAdult: true, hasHousehold: true };
const allowed: HomeAccess = { guide: true, learn: true, listen: true, look: true };

function rowsFor(over: { order?: readonly HomeRow[]; modules?: ModuleMap; member?: typeof adult | null } = {}): HomeRow[] {
  return homeRows({ rules: null, modules: over.modules ?? ALL_ON, member: over.member === undefined ? adult : over.member, access: allowed, order: over.order });
}

/** A template as the database would send it, with only the parts a test names. */
function tpl(parts: Record<string, unknown>): unknown {
  return { version: 1, ...parts };
}

function parsed(parts: Record<string, unknown>) {
  return parseTemplate(tpl(parts)).template;
}

const allTabs = (over: Record<string, Partial<{ label: string | null; icon: string | null; hidden: boolean }>> = {}) =>
  TABS.map((key) => ({ key, label: null, icon: null, hidden: false, ...(over[key] ?? {}) }));

describe('with no template the app is exactly what it was (golden)', () => {
  it('draws the legacy Home rows in the legacy order', () => {
    expect(HOME_ROWS).toEqual(LEGACY_ROWS);
    expect(resolveRows(null, HOME_ROWS)).toEqual(LEGACY_ROWS);
    expect(resolveTemplate(null, HOME_ROWS).rows).toEqual(LEGACY_ROWS);
    expect(rowsFor({ order: resolveTemplate(null, HOME_ROWS).rows })).toEqual(LEGACY_ROWS);
  });

  it('gives homeRows the same answer with and without an order, for any member and any module map', () => {
    const members = [adult, { isAdult: false, hasHousehold: true }, { isAdult: true, hasHousehold: false }, null];
    const maps = [ALL_ON, off('events'), off('giving'), off('content', 'gyan_path'), off(...MODULE_KEYS)];
    for (const member of members) {
      for (const modules of maps) {
        expect(rowsFor({ member, modules, order: HOME_ROWS })).toEqual(rowsFor({ member, modules }));
        expect(rowsFor({ member, modules, order: resolveTemplate(null, HOME_ROWS).rows })).toEqual(rowsFor({ member, modules }));
      }
    }
  });

  it('shows the legacy bar: Home, Events, Give, Jain Way, Family, then Niva', () => {
    expect([...TABS]).toEqual(['index', 'events', 'give', 'jain-way', 'family']);
    const tabs = resolveTabs(null);
    expect(tabs).toBe(BUILTIN_TABS);
    expect(barItems(ALL_ON, true, true, tabs)).toEqual(LEGACY_BAR);
    expect(barItems(ALL_ON, true, true, tabs)).toEqual(barItems(ALL_ON, true));
    expect(barItems(ALL_ON, false, true, tabs)).toEqual([...TABS]);
    expect(tabs.labels).toEqual({});
    expect(tabs.icons).toEqual({});
    expect(tabs.hidden.size).toBe(0);
    for (const modules of [off('giving', 'bolis'), off('events', 'calendar', 'content'), off('jain_way', 'gyan_path', 'pathshala', 'content')]) {
      expect(barItems(modules, true, true, tabs)).toEqual(barItems(modules, true));
    }
  });

  it('has the built-in look: no colours, no corners, no motif, no Today variant', () => {
    const resolved = resolveTemplate(null, HOME_ROWS);
    expect(resolved.theme).toBe(NO_THEME);
    expect(NO_THEME).toEqual({ palette: {}, radii: null, motif: null, key: '' });
    expect(resolved.today).toBeNull();
  });

  it('leaves the colours and corners exactly as built in when the empty look is applied', () => {
    const before = { colors: { ...colors }, radii: { ...radii } };
    applyTemplateTheme(NO_THEME);
    expect({ ...colors }).toEqual(before.colors);
    expect({ ...radii }).toEqual(before.radii);
  });

  it('lays out a Jain Center as it always was, with or without a template key in the answer', () => {
    expect(JAIN_PROFILE.template).toBeNull();
    expect(layoutFor(JAIN_PROFILE)).toEqual(JAIN_LAYOUT);
    const plain = parseCategoryProfile(jainPayload());
    expect(plain?.template).toBeNull();
    expect(layoutFor(plain!)).toEqual(JAIN_LAYOUT);
    // a template that says exactly what the app does today changes nothing
    const same = parseCategoryProfile({
      ...(jainPayload() as object),
      template: tpl({
        home: { rows: ['today', 'special_days', 'events', 'giving', 'life', 'learn'] },
        tabs: allTabs(),
        theme: { primary: null, accent: null, surface: 'warm', radius: 'soft', motif: 'none' },
        widgets: { today: { variant: 'full' } },
      }),
    });
    expect(layoutFor(same!)).toEqual(JAIN_LAYOUT);
    const resolved = resolveTemplate(same!.template, HOME_ROWS);
    expect(resolved.rows).toEqual(LEGACY_ROWS);
    expect(barItems(ALL_ON, true, true, resolved.tabs)).toEqual(LEGACY_BAR);
    expect(resolved.tabs.labels).toEqual({});
    expect(resolved.theme.palette).toEqual({});
    expect(resolved.theme.radii).toBeNull();
  });
});

describe('a template reorders and hides', () => {
  it('draws the rows it lists in the order it lists them, and hides a row it leaves out', () => {
    const t = parsed({ home: { rows: ['events', 'today', 'life'] } });
    expect(t?.rows).toEqual(['events', 'today', 'life']);
    expect(rowsFor({ order: resolveRows(t, HOME_ROWS) })).toEqual(['events', 'today', 'life']);
  });

  it('names every row of the registry by its template id', () => {
    expect(Object.keys(TEMPLATE_ROWS)).toEqual(['today', 'special_days', 'events', 'giving', 'life', 'learn']);
    expect(Object.values(TEMPLATE_ROWS)).toEqual(LEGACY_ROWS);
    const t = parsed({ home: { rows: ['learn', 'giving', 'special_days', 'life', 'events', 'today'] } });
    expect(t?.rows).toEqual(['learnListen', 'give', 'specialDays', 'life', 'events', 'today']);
  });

  it('counts a repeated row once', () => {
    expect(parsed({ home: { rows: ['events', 'today', 'events'] } })?.rows).toEqual(['events', 'today']);
  });

  it('orders the tabs, hides some, and keeps Niva last', () => {
    const t = parsed({ tabs: allTabs({ index: {}, family: {}, events: { hidden: true } }).reverse() });
    const tabs = resolveTabs(t);
    expect(tabs.order).toEqual(['family', 'jain-way', 'give', 'events', 'index']);
    expect(tabs.hidden.has('events')).toBe(true);
    expect(barItems(ALL_ON, true, true, tabs)).toEqual(['family', 'jain-way', 'give', 'index', 'niva']);
    expect(barItems(ALL_ON, false, true, tabs)).toEqual(['family', 'jain-way', 'give', 'index']);
  });

  it('keeps a tab it does not list in its built-in place after the listed ones (only hidden: true hides)', () => {
    const t = parsed({ tabs: [{ key: 'family' }, { key: 'give' }] });
    const tabs = resolveTabs(t);
    expect(tabs.order).toEqual(['family', 'give', 'index', 'events', 'jain-way']);
    expect(barItems(ALL_ON, true, true, tabs)).toEqual(['family', 'give', 'index', 'events', 'jain-way', 'niva']);
  });

  it('never hides Home', () => {
    const t = parsed({ tabs: [{ key: 'index', hidden: true }, { key: 'events' }] });
    expect(t?.tabs?.[0]).toEqual({ key: 'index', label: null, icon: null, hidden: false });
    expect(barItems(ALL_ON, false, true, resolveTabs(t))).toContain('index');
  });

  it('renames and re-icons a tab, and keeps the translated name when the new name is the built-in one', () => {
    const t = parsed({ tabs: [{ key: 'give', label: 'Donate', icon: 'sparkle' }, { key: 'family', label: 'Family', icon: 'people' }, { key: 'events', label: '  Programs  ' }] });
    const tabs = resolveTabs(t);
    expect(tabs.labels).toEqual({ give: 'Donate', events: 'Programs' });
    expect(tabs.icons).toEqual({ give: 'sparkle', family: 'people' });
  });

  it('turns the Today variant into the layout fact it overrides', () => {
    expect(todayCardFor(null)).toBeNull();
    expect(todayCardFor('full')).toBe('full');
    expect(todayCardFor('basic')).toBe('basic');
    expect(todayCardFor('service_times')).toBe('basic');
    const withVariant = (variant: unknown) => layoutFor(parseCategoryProfile({ ...(jainPayload() as object), template: tpl({ widgets: { today: { variant } } }) })!);
    expect(withVariant('service_times').todayCard).toBe('basic');
    expect(withVariant('basic').todayCard).toBe('basic');
    expect(withVariant('full').todayCard).toBe('full');
    expect(withVariant('mystery').todayCard).toBe('full'); // unknown variant: the profile's facts decide
    const neutral = parseCategoryProfile({ ...(newExperiencePayload() as object), template: tpl({ widgets: { today: { variant: 'full' } } }) })!;
    expect(layoutFor(neutral).todayCard).toBe('full');
    expect(layoutFor(genericProfile('x')).todayCard).toBe('basic');
  });

  it('lets the database layout hints win over the template (the most specific word)', () => {
    const p = parseCategoryProfile({ ...(jainPayload() as object), layout: { today_card: 'full' }, template: tpl({ widgets: { today: { variant: 'basic' } } }) })!;
    expect(layoutFor(p).todayCard).toBe('full');
  });
});

describe('ids this build does not know are ignored', () => {
  it('drops unknown rows and keeps the known ones in order', () => {
    expect(parsed({ home: { rows: ['today', 'mystery', 'events', 'panchang_v9', 7, null] } })?.rows).toEqual(['today', 'events']);
  });

  it('falls back to the built-in order when no listed row is known', () => {
    const r = parseTemplate(tpl({ home: { rows: ['mystery', 'other'] }, tabs: [{ key: 'family' }] }));
    expect(r.template?.rows).toBeNull();
    expect(r.template?.tabs).not.toBeNull();
    expect(resolveRows(r.template, HOME_ROWS)).toEqual(LEGACY_ROWS);
    expect(r.problems.join(' ')).toMatch(/home\.rows/);
  });

  it('drops unknown tab keys, and an icon it cannot draw becomes no icon', () => {
    const t = parsed({ tabs: [{ key: 'prayer', label: 'Prayer' }, { key: 'give', icon: 'rocket' }, { key: 'family', icon: 'menu' }] });
    expect(t?.tabs).toEqual([
      { key: 'give', label: null, icon: null, hidden: false },
      { key: 'family', label: null, icon: null, hidden: false },
    ]);
    expect(TAB_ICONS).not.toContain('menu');
  });

  it('keeps a motif name it cannot draw out of the header', () => {
    const t = parsed({ theme: { motif: 'peacock_feather' } });
    expect(t?.theme?.motif).toBe('peacock_feather');
    expect(resolveTheme(t).motif).toBeNull();
    expect(isMotif('peacock_feather')).toBe(false);
    for (const m of MOTIFS) expect(resolveTheme(parsed({ theme: { motif: m } })).motif).toBe(m);
    expect(parsed({ theme: { motif: 'none' } })).toBeNull();
  });

  it('ignores an unknown surface, radius or Today variant on its own', () => {
    expect(parsed({ theme: { surface: 'neon', radius: 'round' } })).toBeNull();
    expect(parsed({ theme: { surface: 'cool', radius: 'round' } })?.theme).toEqual({ primary: null, accent: null, surface: 'cool', radius: null, motif: null });
    expect(parsed({ widgets: { today: { variant: 'hologram' } } })).toBeNull();
    expect(parsed({ widgets: { somethingNew: { variant: 'full' } } })).toBeNull();
  });

  it('reads a template with extra keys it has never heard of', () => {
    const r = parseTemplate(tpl({ home: { rows: ['events'], columns: 3 }, futurePart: { a: 1 } }));
    expect(r.template?.rows).toEqual(['events']);
    expect(r.problems).toEqual([]);
  });
});

describe('a malformed template is ignored, never thrown on', () => {
  const garbage: unknown[] = ['text', 12, true, [], [1, 2], () => 1, { version: 'one' }, { version: 2, home: { rows: ['events'] } }, { version: 0 }];

  it('uses no template for something that is not one', () => {
    for (const raw of garbage) {
      expect(() => parseTemplate(raw)).not.toThrow();
      expect(parseTemplate(raw).template).toBeNull();
    }
    expect(parseTemplate(undefined)).toEqual({ template: null, problems: [] });
    expect(parseTemplate(null)).toEqual({ template: null, problems: [] });
    expect(parseTemplate({}).template).toBeNull();
    expect(parseTemplate({ version: 1 }).template).toBeNull();
  });

  it('refuses a version it does not read, and says so', () => {
    const r = parseTemplate({ version: 2, home: { rows: ['events'] } });
    expect(r.template).toBeNull();
    expect(r.problems[0]).toMatch(/version/);
  });

  it('drops a malformed part and keeps the good ones', () => {
    const t = parseTemplate(tpl({ home: 'events', tabs: { key: 'give' }, theme: [1], widgets: 5 }));
    expect(t.template).toBeNull();
    expect(t.problems).toHaveLength(4);
    const mixed = parseTemplate(tpl({ home: { rows: 'events' }, tabs: [{ key: 'give', label: 'Donate' }], theme: 'blue', widgets: { today: { variant: 'basic' } } }));
    expect(mixed.template).toEqual({ rows: null, tabs: [{ key: 'give', label: 'Donate', icon: null, hidden: false }], theme: null, todayVariant: 'basic' });
  });

  it('skips tab entries that are not entries, and a repeated tab', () => {
    const t = parsed({ tabs: ['give', null, 7, { key: 'family', label: 5, icon: 5, hidden: 'yes' }, { key: 'family', hidden: true }, { label: 'No key' }] });
    expect(t?.tabs).toEqual([{ key: 'family', label: null, icon: null, hidden: false }]);
  });

  it('treats an empty list of rows or tabs as no list', () => {
    expect(parsed({ home: { rows: [] } })).toBeNull();
    expect(parsed({ tabs: [] })).toBeNull();
  });

  it('ignores colours that are not #RRGGBB, and a name that is too long for the bar', () => {
    expect(parsed({ theme: { primary: 'blue', accent: '#12', surface: 'cool' } })?.theme).toEqual({ primary: null, accent: null, surface: 'cool', radius: null, motif: null });
    const long = 'x'.repeat(MAX_TAB_LABEL + 1);
    const r = parseTemplate(tpl({ tabs: [{ key: 'give', label: long }, { key: 'family', label: 'y'.repeat(MAX_TAB_LABEL) }] }));
    expect(r.template?.tabs?.[0].label).toBeNull();
    expect(r.template?.tabs?.[1].label).toHaveLength(MAX_TAB_LABEL);
    expect(r.problems.join(' ')).toMatch(/longer than/);
  });

  it('ignores a primary too light to read on white (and an accent too faint to see), and says so', () => {
    const r = parseTemplate(tpl({ theme: { primary: '#FFEE00', accent: '#F8F8F8', surface: 'plain' } }));
    expect(r.template?.theme).toEqual({ primary: null, accent: null, surface: 'plain', radius: null, motif: null });
    expect(r.problems).toHaveLength(2);
    expect(contrastWithWhite('#FFFFFF')).toBeCloseTo(1, 1);
    expect(contrastWithWhite('#000000')).toBeCloseTo(21, 0);
    expect(parsed({ theme: { primary: '#1b2c5c', accent: '#c9731c' } })?.theme).toMatchObject({ primary: '#1B2C5C', accent: '#C9731C' });
  });

  it('lets a profile through with a broken template, using the built-in layout', () => {
    for (const raw of garbage) {
      const p = parseCategoryProfile({ ...(jainPayload() as object), template: raw });
      expect(p).not.toBeNull();
      expect(p!.template).toBeNull();
      expect(layoutFor(p!)).toEqual(JAIN_LAYOUT);
    }
    expect(templateProblems({ template: 'x' })).toHaveLength(1);
    expect(templateProblems(jainPayload())).toEqual([]);
    expect(templateProblems(null)).toEqual([]);
  });

  it('survives the device cache: what is kept is the raw answer, and it parses back the same', () => {
    const raw = { ...(jainPayload() as object), template: tpl({ home: { rows: ['events', 'today'] }, tabs: allTabs({ give: { label: 'Donate' } }), theme: { surface: 'cool', radius: 'crisp', motif: 'leaf' }, widgets: { today: { variant: 'service_times' } } }) };
    const a = parseCategoryProfile(raw)!;
    const b = parseCategoryProfile(JSON.parse(JSON.stringify(raw)))!;
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.template?.rows).toEqual(['events', 'today']);
  });
});

describe('module gating always wins', () => {
  it('keeps a row hidden whose module is off, whatever the template lists', () => {
    const order = resolveRows(parsed({ home: { rows: ['giving', 'events', 'learn', 'special_days', 'life', 'today'] } }), HOME_ROWS);
    expect(rowsFor({ order })).toEqual(['give', 'events', 'learnListen', 'specialDays', 'life', 'today']);
    expect(rowsFor({ order, modules: off('giving') })).not.toContain('give');
    expect(rowsFor({ order, modules: off('events') })).not.toContain('events');
    expect(rowsFor({ order, modules: off('content', 'gyan_path') })).not.toContain('learnListen');
    expect(rowsFor({ order, modules: off('giving') })).toEqual(['events', 'learnListen', 'specialDays', 'life', 'today']);
  });

  it('keeps the people rules: no giving row for a child, no special days without a household, no personal row for a guest', () => {
    const order = resolveRows(parsed({ home: { rows: ['giving', 'special_days', 'events'] } }), HOME_ROWS);
    expect(rowsFor({ order, member: { isAdult: false, hasHousehold: true } })).toEqual(['specialDays', 'events']);
    expect(rowsFor({ order, member: { isAdult: true, hasHousehold: false } })).toEqual(['give', 'events']);
    expect(rowsFor({ order, member: null })).toEqual(['events']);
  });

  it('keeps special days hidden for a kind of organization without them', () => {
    const order = resolveRows(parsed({ home: { rows: ['special_days', 'today'] } }), HOME_ROWS);
    expect(homeRows({ rules: null, modules: ALL_ON, member: adult, access: allowed, layout: { specialDays: false, shortcuts: JAIN_LAYOUT.shortcuts }, order })).toEqual(['today']);
  });

  it('never adds a row the rules would not show (a template cannot turn a module on)', () => {
    const everything = resolveRows(parsed({ home: { rows: ['today', 'special_days', 'events', 'giving', 'life', 'learn'] } }), HOME_ROWS);
    for (const modules of [off('events'), off('giving'), off('content', 'gyan_path'), off(...MODULE_KEYS)]) {
      for (const member of [adult, null]) {
        const withTemplate = rowsFor({ order: everything, member, modules });
        const without = rowsFor({ member, modules });
        expect(withTemplate).toEqual(without);
      }
    }
  });

  it('keeps a tab out whose modules are off even when the template lists it as visible', () => {
    const tabs = resolveTabs(parsed({ tabs: allTabs() }));
    expect(barItems(off('giving', 'bolis'), true, true, tabs)).toEqual(['index', 'events', 'jain-way', 'family', 'niva']);
    expect(barItems(off('events', 'calendar', 'content'), false, true, tabs)).not.toContain('events');
  });

  it('keeps the practice tab out for a kind of organization that has none, even when the template lists it', () => {
    const tabs = resolveTabs(parsed({ tabs: [{ key: 'jain-way', label: 'Prayer', icon: 'book' }, ...allTabs().filter((t) => t.key !== 'jain-way')] }));
    expect(barItems(ALL_ON, true, false, tabs)).not.toContain('jain-way');
    expect(barItems(ALL_ON, true, true, tabs)[0]).toBe('jain-way');
  });

  it('keeps Niva last, and only for someone who may use it', () => {
    const tabs = resolveTabs(parsed({ tabs: allTabs().reverse() }));
    const items = barItems(ALL_ON, true, true, tabs);
    expect(items[items.length - 1]).toBe('niva');
    expect(items.filter((i) => i === 'niva')).toHaveLength(1);
    expect(barItems(ALL_ON, false, true, tabs)).not.toContain('niva');
  });
});

describe('colour precedence: brand kit > template theme > built-in', () => {
  const builtin = { ...colors };
  const builtinRadii = { ...radii };

  afterEach(() => {
    applyPalette({});
    applyTemplateTheme(NO_THEME);
  });

  const theme = (parts: Record<string, unknown>) => resolveTheme(parsed({ theme: parts }));

  it('starts from the built-in colours', () => {
    expect(colors.navy).toBe('#1B2C5C');
    expect(colors.saffron).toBe('#C9731C');
    expect(colors.ground).toBe('#FBF7F0');
  });

  it("uses the template's colours when the community has no brand kit", () => {
    applyTemplateTheme(theme({ primary: '#7A1F3D', accent: '#1F6F7A', surface: 'cool' }));
    expect(colors.navy).toBe('#7A1F3D');
    expect(colors.navyTint).toBe(brandPalette({ primary: '#7A1F3D' }).navyTint);
    expect(colors.saffron).toBe('#1F6F7A');
    expect(colors.ground).toBe(SURFACE_PALETTES.cool.ground);
    expect(colors.card).toBe(builtin.card);
  });

  it("lets the community's brand kit win, colour by colour", () => {
    applyPalette(brandPalette({ colors: { primary: '#0A3D2E' } }));
    applyTemplateTheme(theme({ primary: '#7A1F3D', accent: '#1F6F7A', surface: 'plain' }));
    expect(colors.navy).toBe('#0A3D2E'); // the brand kit's primary
    expect(colors.navyHover).toBe(brandPalette({ colors: { primary: '#0A3D2E' } }).navyHover);
    expect(colors.saffron).toBe('#1F6F7A'); // the brand kit sets no accent, the template's applies
    expect(colors.ground).toBe(SURFACE_PALETTES.plain.ground); // the brand kit sets no surface
  });

  it('keeps the brand kit on top whichever layer is applied last', () => {
    applyTemplateTheme(theme({ primary: '#7A1F3D', accent: '#1F6F7A' }));
    applyPalette(brandPalette({ colors: { primary: '#0A3D2E', accent: '#8A4608' } }));
    expect(colors.navy).toBe('#0A3D2E');
    expect(colors.saffron).toBe('#8A4608');
    applyPalette({}); // the brand kit is removed: the template shows through
    expect(colors.navy).toBe('#7A1F3D');
    expect(colors.saffron).toBe('#1F6F7A');
  });

  it('restores the built-in palette when both layers go', () => {
    applyPalette(brandPalette({ colors: { primary: '#0A3D2E' } }));
    applyTemplateTheme(theme({ primary: '#7A1F3D', surface: 'cool', radius: 'crisp' }));
    applyPalette({});
    applyTemplateTheme(NO_THEME);
    expect({ ...colors }).toEqual(builtin);
    expect({ ...radii }).toEqual(builtinRadii);
  });

  it('squares the corners for the crisp look and puts them back for soft', () => {
    applyTemplateTheme(theme({ radius: 'crisp' }));
    expect(radii.card).toBe(CRISP_RADII.card);
    expect(radii.xl).toBe(CRISP_RADII.xl);
    expect(radii.round).toBe(builtinRadii.round);
    applyTemplateTheme(theme({ radius: 'soft', surface: 'cool' }));
    expect({ ...radii }).toEqual(builtinRadii);
  });

  it('has a warm surface that is the built-in palette, and covers the same keys for cool and plain', () => {
    expect(SURFACE_PALETTES.warm).toEqual({});
    expect(Object.keys(SURFACE_PALETTES.cool).sort()).toEqual(Object.keys(SURFACE_PALETTES.plain).sort());
    for (const key of Object.keys(SURFACE_PALETTES.cool)) expect(Object.keys(builtin)).toContain(key);
    expect(Object.keys(CRISP_RADII).every((k) => k in builtinRadii)).toBe(true);
    expect(theme({ surface: 'warm', primary: '#7A1F3D' }).palette.ground).toBeUndefined();
  });

  it('gives the look a key that changes when the look does', () => {
    const a = theme({ surface: 'cool' }).key;
    expect(a).not.toBe('');
    expect(theme({ surface: 'cool' }).key).toBe(a);
    expect(theme({ surface: 'plain' }).key).not.toBe(a);
    expect(theme({ surface: 'cool', radius: 'crisp' }).key).not.toBe(a);
    expect(theme({ surface: 'cool', motif: 'leaf' }).key).not.toBe(a);
  });
});

describe('the times the service_times Today card lists', () => {
  it('lists the first few rows that have both a name and a time', () => {
    const rows = [
      { what: ' Weekday ', when: ' 9 am to 5 pm ' },
      { what: '', when: '10 am' },
      { what: 'Sunday', when: '' },
      { what: 'Weekday', when: '9 am to 5 pm' },
      { what: 'Saturday', when: '10 am to 2 pm' },
      { what: 'Sunday', when: '11 am' },
      { what: 'Holidays', when: 'Closed' },
    ];
    expect(SERVICE_TIMES_SHOWN).toBe(3);
    expect(serviceTimeRows(rows)).toEqual([
      { what: 'Weekday', when: '9 am to 5 pm' },
      { what: 'Saturday', when: '10 am to 2 pm' },
      { what: 'Sunday', when: '11 am' },
    ]);
    expect(serviceTimeRows(rows, 1)).toHaveLength(1);
    expect(serviceTimeRows([])).toEqual([]);
  });
});

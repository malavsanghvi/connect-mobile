/**
 * The member-app template (priority 3, backlog B89, docs/MASTER_PLAN_2026-10-10.md §3): which rows Home draws and in what order, the
 * tab bar's order, names and icons, the look (colours, surface, corners, a small motif) and the variant of Today's card. It is
 * DATA that the database delivers inside `app.category_profile` as the additive key `template`, so the app changes with the kind
 * of organization and its faith without an app update:
 *
 *   { "version": 1,
 *     "home":    { "rows": ["today", "special_days", "events", "giving", "life", "learn"] },
 *     "tabs":    [{ "key": "index", "label": null, "icon": null, "hidden": false }, ...],
 *     "theme":   { "primary": "#RRGGBB", "accent": "#RRGGBB", "surface": "warm|cool|plain", "radius": "soft|crisp", "motif": "none|<name>" },
 *     "widgets": { "today": { "variant": "full|basic|service_times" } } }
 *
 * The rules of this file:
 *
 *  - Forward compatible. The app holds the registry of what it can draw; ids and keys it does not know are ignored, so a newer
 *    template never breaks an older app. A part that is malformed is dropped on its own (never thrown on, never half-applied) and
 *    the app uses its built-in for that part. With no template at all the app is exactly what it was: Home's HOME_ROWS, the five
 *    tabs (src/lib/nav-bar.ts), the built-in palette, and the Today card the profile's facts choose. A Jain community must look
 *    identical (golden tests in src/lib/__tests__/template.test.ts).
 *  - Gating wins. A template only orders, hides, renames and re-icons what exists; a row, tab or card whose module is off, or that
 *    the kind of organization does not have (no practice tab), stays hidden whatever the template says. The helpers here decide the
 *    ORDER; src/lib/home-rails.ts homeRows and src/lib/nav-bar.ts barItems still decide what is allowed.
 *  - Precedence for colours: the community's own brand kit (centers.branding) > the template's theme > the built-in palette, per
 *    colour (src/theme.ts keeps the layers).
 *  - Home rows the template lists are shown in that order; a row left out is hidden. A tab the template does not list keeps its
 *    built-in place after the listed ones (a tab is hidden only by `hidden: true`), and Home (index) can never be hidden.
 *
 * Pure (no React, no Supabase). Parsed by src/lib/categories.ts, applied by src/providers/category.tsx.
 */
import { en } from '../i18n/en';
import type { StrokeIconName } from '../components/stroke-icon';

import { brandPalette } from './community';
import type { HomeRow } from './home-rails';
import { TABS, type TabName } from './nav-bar';

export const TEMPLATE_VERSION = 1;

// ---------------------------------------------------------------------------
// The registry of ids this build can draw
// ---------------------------------------------------------------------------

/** The template's row ids, and the Home row (src/lib/home-rails.ts HOME_ROWS) each one draws. */
export const TEMPLATE_ROWS = {
  today: 'today',
  special_days: 'specialDays',
  events: 'events',
  giving: 'give',
  life: 'life',
  learn: 'learnListen',
} as const satisfies Record<string, HomeRow>;

export type TemplateRowId = keyof typeof TEMPLATE_ROWS;

function isRowId(v: unknown): v is TemplateRowId {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(TEMPLATE_ROWS, v);
}

/** The icons a tab can be given (the bar's own outline icons; the navigation glyphs are not among them). */
export const TAB_ICONS = ['home', 'calendar', 'calendar-dots', 'calendar-check', 'heart', 'book', 'people', 'bag', 'chart', 'info', 'sparkle'] as const satisfies readonly StrokeIconName[];
export type TabIcon = (typeof TAB_ICONS)[number];

function isTabIcon(v: unknown): v is TabIcon {
  return typeof v === 'string' && (TAB_ICONS as readonly string[]).includes(v);
}

function isTabKey(v: unknown): v is TabName {
  return typeof v === 'string' && (TABS as readonly string[]).includes(v);
}

/** A tab's name is one short word or two; longer would not fit its sixth of the bar. */
export const MAX_TAB_LABEL = 24;

export const SURFACES = ['warm', 'cool', 'plain'] as const;
export type Surface = (typeof SURFACES)[number];
export const RADII = ['soft', 'crisp'] as const;
export type Radius = (typeof RADII)[number];
export const TODAY_VARIANTS = ['full', 'basic', 'service_times'] as const;
export type TodayVariant = (typeof TODAY_VARIANTS)[number];

/** The motifs this build can draw in Home's header. A name it does not know is ignored. */
export const MOTIFS = ['leaf', 'wave', 'sun', 'star', 'lotus'] as const;
export type Motif = (typeof MOTIFS)[number];

export function isMotif(v: unknown): v is Motif {
  return typeof v === 'string' && (MOTIFS as readonly string[]).includes(v);
}

// ---------------------------------------------------------------------------
// The template as the app holds it
// ---------------------------------------------------------------------------

export type TemplateTab = { key: TabName; label: string | null; icon: TabIcon | null; hidden: boolean };

export type TemplateTheme = {
  primary: string | null;
  accent: string | null;
  surface: Surface | null;
  radius: Radius | null;
  /** A motif name the database sent (any well-formed name; `isMotif` says whether this build can draw it). Null: none. */
  motif: string | null;
};

/** What was parsed from the database's `template`. A part that was absent or unusable is null (the built-in is used for it). */
export type MemberTemplate = {
  /** Home rows (the app's row ids) in display order; a row left out is hidden. */
  rows: HomeRow[] | null;
  tabs: TemplateTab[] | null;
  theme: TemplateTheme | null;
  todayVariant: TodayVariant | null;
};

export type ParsedTemplate = { template: MemberTemplate | null; problems: string[] };

// ---------------------------------------------------------------------------
// Parsing (defensive: nothing here throws)
// ---------------------------------------------------------------------------

function asObj(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

const HEX = /^#[0-9a-f]{6}$/i;

/** WCAG relative luminance of #RRGGBB. */
function luminance(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16);
  const c = [16, 8, 0].map((shift) => {
    const v = ((n >> shift) & 255) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

/** The contrast ratio of a #RRGGBB colour against white (1 to 21). */
export function contrastWithWhite(hex: string): number {
  return 1.05 / (luminance(hex) + 0.05);
}

/** The primary colour carries text and buttons on white (4.5:1); the accent is for fills and marks (3:1). */
const MIN_PRIMARY_CONTRAST = 4.5;
const MIN_ACCENT_CONTRAST = 3;

function parseRows(raw: unknown, problems: string[]): HomeRow[] | null {
  if (raw === undefined || raw === null) return null;
  if (!Array.isArray(raw)) {
    problems.push('home.rows is not a list');
    return null;
  }
  const out: HomeRow[] = [];
  for (const id of raw) {
    if (!isRowId(id)) continue; // a newer template may know more rows than this build
    const row = TEMPLATE_ROWS[id];
    if (!out.includes(row)) out.push(row);
  }
  if (out.length === 0) {
    problems.push('home.rows lists no row this build can draw, so Home keeps its built-in order');
    return null;
  }
  return out;
}

function parseTabs(raw: unknown, problems: string[]): TemplateTab[] | null {
  if (raw === undefined || raw === null) return null;
  if (!Array.isArray(raw)) {
    problems.push('tabs is not a list');
    return null;
  }
  const out: TemplateTab[] = [];
  for (const item of raw) {
    const o = asObj(item);
    if (!o || !isTabKey(o.key)) continue; // not an entry, or a route this build does not have
    if (out.some((t) => t.key === o.key)) continue;
    let label: string | null = null;
    if (typeof o.label === 'string' && o.label.trim()) {
      label = o.label.trim();
      if (label.length > MAX_TAB_LABEL) {
        problems.push(`the name of tab "${o.key}" is longer than ${MAX_TAB_LABEL} characters, so its built-in name is used`);
        label = null;
      }
    }
    out.push({ key: o.key, label, icon: isTabIcon(o.icon) ? o.icon : null, hidden: o.key === 'index' ? false : o.hidden === true });
  }
  return out.length ? out : null;
}

function parseColor(raw: unknown, what: string, min: number, problems: string[]): string | null {
  if (typeof raw !== 'string' || !HEX.test(raw.trim())) {
    if (raw !== undefined && raw !== null) problems.push(`theme.${what} is not a #RRGGBB colour`);
    return null;
  }
  const hex = raw.trim().toUpperCase();
  if (contrastWithWhite(hex) < min) {
    problems.push(`theme.${what} ${hex} is too light to read on white, so the built-in colour is used`);
    return null;
  }
  return hex;
}

function pick<T extends string>(raw: unknown, allowed: readonly T[]): T | null {
  return typeof raw === 'string' && (allowed as readonly string[]).includes(raw) ? (raw as T) : null;
}

function parseTheme(raw: unknown, problems: string[]): TemplateTheme | null {
  if (raw === undefined || raw === null) return null;
  const o = asObj(raw);
  if (!o) {
    problems.push('theme is not an object');
    return null;
  }
  const motifRaw = typeof o.motif === 'string' ? o.motif.trim().toLowerCase() : '';
  const theme: TemplateTheme = {
    primary: parseColor(o.primary, 'primary', MIN_PRIMARY_CONTRAST, problems),
    accent: parseColor(o.accent, 'accent', MIN_ACCENT_CONTRAST, problems),
    surface: pick(o.surface, SURFACES),
    radius: pick(o.radius, RADII),
    motif: motifRaw && motifRaw !== 'none' && /^[a-z][a-z0-9_-]{0,31}$/.test(motifRaw) ? motifRaw : null,
  };
  return Object.values(theme).every((v) => v === null) ? null : theme;
}

function parseTodayVariant(raw: unknown, problems: string[]): TodayVariant | null {
  if (raw === undefined || raw === null) return null;
  const widgets = asObj(raw);
  if (!widgets) {
    problems.push('widgets is not an object');
    return null;
  }
  const today = asObj(widgets.today);
  return today ? pick(today.variant, TODAY_VARIANTS) : null;
}

/**
 * The `template` of `app.category_profile`, or null when there is none or it cannot be used. `problems` says, in words for the
 * log, what was dropped (an id this build does not know is not a problem: that is how a newer template stays harmless).
 */
export function parseTemplate(raw: unknown): ParsedTemplate {
  if (raw === undefined || raw === null) return { template: null, problems: [] };
  const o = asObj(raw);
  if (!o) return { template: null, problems: ['the template is not an object'] };
  // A version this build does not read may mean different rules: use the built-in layout rather than guess.
  if (o.version !== undefined && o.version !== TEMPLATE_VERSION) {
    return { template: null, problems: [`the template is version ${JSON.stringify(o.version)?.slice(0, 20)}; this build reads version ${TEMPLATE_VERSION}`] };
  }
  const problems: string[] = [];
  const home = o.home === undefined || o.home === null ? null : asObj(o.home);
  if (o.home !== undefined && o.home !== null && !home) problems.push('home is not an object');
  const template: MemberTemplate = {
    rows: home ? parseRows(home.rows, problems) : null,
    tabs: parseTabs(o.tabs, problems),
    theme: parseTheme(o.theme, problems),
    todayVariant: parseTodayVariant(o.widgets, problems),
  };
  const empty = template.rows === null && template.tabs === null && template.theme === null && template.todayVariant === null;
  return { template: empty ? null : template, problems };
}

// ---------------------------------------------------------------------------
// Resolving: what the app does with it
// ---------------------------------------------------------------------------

/** The Home rows in display order: the template's, else `builtin` (HOME_ROWS). Gating (homeRows) still applies to each. */
export function resolveRows(template: MemberTemplate | null, builtin: readonly HomeRow[]): readonly HomeRow[] {
  return template?.rows ?? builtin;
}

export type ResolvedTabs = {
  /** Every tab, in display order (the template's first, then any it did not list in their built-in order). */
  order: readonly TabName[];
  /** Tabs the template hides (never Home). Module gating can hide more (barItems). */
  hidden: ReadonlySet<TabName>;
  /** Names that replace the dictionary's, only where a name was given and differs from the built-in one. */
  labels: Readonly<Partial<Record<TabName, string>>>;
  icons: Readonly<Partial<Record<TabName, TabIcon>>>;
};

const DEFAULT_TAB_LABEL: Record<TabName, string> = {
  index: en['tab.home'],
  events: en['tab.events'],
  give: en['tab.give'],
  'jain-way': en['tab.jainWay'],
  family: en['tab.family'],
};

export const BUILTIN_TABS: ResolvedTabs = { order: TABS, hidden: new Set<TabName>(), labels: {}, icons: {} };

export function resolveTabs(template: MemberTemplate | null): ResolvedTabs {
  const listed = template?.tabs;
  if (!listed) return BUILTIN_TABS;
  const order: TabName[] = [...listed.map((t) => t.key), ...TABS.filter((tab) => !listed.some((t) => t.key === tab))];
  const labels: Partial<Record<TabName, string>> = {};
  const icons: Partial<Record<TabName, TabIcon>> = {};
  for (const t of listed) {
    // A name equal to the built-in one is no change, and keeps the Gujarati and Hindi names.
    if (t.label && t.label !== DEFAULT_TAB_LABEL[t.key]) labels[t.key] = t.label;
    if (t.icon) icons[t.key] = t.icon;
  }
  return { order, hidden: new Set(listed.filter((t) => t.hidden).map((t) => t.key)), labels, icons };
}

/** The Today card the template asks for, as the layout fact it overrides (`todayCard`); 'service_times' is the basic card plus the community's times. */
export function todayCardFor(variant: TodayVariant | null): 'full' | 'basic' | null {
  if (!variant) return null;
  return variant === 'full' ? 'full' : 'basic';
}

// ---------------------------------------------------------------------------
// The look
// ---------------------------------------------------------------------------

/** Page and line colours for each surface. 'warm' is the built-in palette (nothing to change). */
export const SURFACE_PALETTES: Record<Surface, Record<string, string>> = {
  warm: {},
  cool: {
    ground: '#F4F7FB',
    frame: '#E4E9F1',
    panel: '#EAF0F7',
    divider: '#E6ECF4',
    dividerLight: '#EDF2F8',
    chip: '#E9EEF5',
    border: '#DAE2EC',
    borderInput: '#CFD9E6',
    track: '#DDE5F0',
    starEmpty: '#DDE3EC',
  },
  plain: {
    ground: '#F7F7F7',
    frame: '#EBEBEB',
    panel: '#F0F0F0',
    divider: '#EDEDED',
    dividerLight: '#F3F3F3',
    chip: '#EEEEEE',
    border: '#E2E2E2',
    borderInput: '#D9D9D9',
    track: '#E6E6E6',
    starEmpty: '#E0E0E0',
  },
};

/** Corner radii (src/theme.ts `radii`) for the crisp look; 'soft' is the built-in. The fully round ones stay round. */
export const CRISP_RADII: Record<string, number> = { xs: 2, check: 3, sm: 3, md: 4, lg: 5, card: 6, row: 6, xl: 8, xxl: 8, pill: 10, sheet: 12, cta: 12, cart: 12 };

export type ResolvedTheme = {
  /** Theme colours to lay UNDER the brand kit (src/theme.ts applyTemplateTheme): the surface, then the primary and accent. */
  palette: Record<string, string>;
  /** Corner radii by name, or null for the built-in. */
  radii: Record<string, number> | null;
  /** The motif Home's header draws, or null. */
  motif: Motif | null;
  /** Changes when anything in the look changes (what to depend on). */
  key: string;
};

export const NO_THEME: ResolvedTheme = { palette: {}, radii: null, motif: null, key: '' };

export function resolveTheme(template: MemberTemplate | null): ResolvedTheme {
  const theme = template?.theme;
  if (!theme) return NO_THEME;
  const palette = {
    ...SURFACE_PALETTES[theme.surface ?? 'warm'],
    // The same derivation the brand kit uses, so a template's primary looks like a brand kit's.
    ...brandPalette({ primary: theme.primary, accent: theme.accent }),
  };
  const radii = theme.radius === 'crisp' ? CRISP_RADII : null;
  const motif = isMotif(theme.motif) ? theme.motif : null;
  return { palette, radii, motif, key: JSON.stringify([palette, theme.radius, motif]) };
}

// ---------------------------------------------------------------------------
// Everything the app reads
// ---------------------------------------------------------------------------

export type ResolvedTemplate = {
  rows: readonly HomeRow[];
  tabs: ResolvedTabs;
  /** The Today variant the template asks for; null: the profile's facts decide (src/lib/categories.ts layoutFor). */
  today: TodayVariant | null;
  theme: ResolvedTheme;
};

export function resolveTemplate(template: MemberTemplate | null, builtinRows: readonly HomeRow[]): ResolvedTemplate {
  return { rows: resolveRows(template, builtinRows), tabs: resolveTabs(template), today: template?.todayVariant ?? null, theme: resolveTheme(template) };
}

/**
 * The kind of organization a community is (connect-crm 0594, docs/ORGANIZATION_CATEGORIES_PLAN.md; the owner calls it
 * the "experience"): Jain Center, Chamber of commerce, Community organization, Faith-based (other)… The database says
 * which one a community is (`centers.category_key`) and answers `app.category_profile(center)` with its named words,
 * the availability of every module and the person-level paths. This file turns that answer into what the app shows.
 *
 * The rule of this file: nothing in a component asks "is this a Jain Center?". The app reads FACTS from the profile and
 * decides from those:
 *
 *   uses_tradition  → Today's card is the full one (tithi, timings, the darshan and puja doors) or greeting and date only
 *   faith_based     → special days (birthdays, anniversaries): the sign-up step, Home's row and tile, the Family tab's card
 *   terms.practice_tab null → no fourth tab (the route keeps its name, "jain-way", so links and notifications still work)
 *   modules         → which modules exist (the module map before `my_modules` answers; the plan's "Never" and "Off" modules)
 *
 * so a new kind of organization is DATA: a row in the database and, for its words, one entry in src/i18n/categories. What
 * the database does not say (the interests asked, the default Home shortcuts) comes from LAYOUT_BY_CATEGORY below, and a
 * category with no entry gets the generic layout, never the Jain one. Jain Center's profile and layout here are today's
 * constants, so a Jain community sees exactly what it has always seen (src/lib/__tests__/categories.test.ts).
 *
 * Pure (no React, no Supabase) so every rule is unit-tested. The loader is src/lib/api/category.ts, the provider
 * src/providers/category.tsx.
 */
import { en, type StringKey } from '../i18n/en';

import { HOME_SHORTCUT_KEYS, isHomeShortcut, type HomeShortcut } from './home-shortcuts';
import { CORE_MODULES, isModuleKey, type ModuleKey, type ModuleMap } from './modules';

export const JAIN_CENTER = 'jain_center';

export type Availability = 'default_on' | 'default_off' | 'not_available';

/** The category's named words (0594 `organization_categories.terms`). `null` = the category has no such thing. */
export type CategoryTerms = {
  greeting: string;
  practice_tab: string | null;
  give_tab: string;
  family_tab: string;
  store: string;
  school: string | null;
  learning: string | null;
  place: string;
  assistant_context: string;
};

export type ModuleAvailability = { availability: Availability; label: string | null };

export type CategoryPath = { key: string; label: string; parent: string | null; sort: number };

/** Words a category (or the database) puts in place of the English dictionary's, English only: see src/i18n/categories. */
export type WordOverlay = Partial<Record<StringKey, string>>;

/** What the app lays out differently per category. The profile's facts decide most of it; see `layoutFor`. */
export type CategoryLayout = {
  /** The fourth tab (route "jain-way") is in the bar. */
  practiceTab: boolean;
  /** 'full': tithi, timings, the darshan and puja doors. 'basic': the greeting and the date. */
  todayCard: 'full' | 'basic';
  /** Special days (birthdays, anniversaries): the sign-up step "Plan special days", Home's row and tile, the Family tab's card. */
  specialDays: boolean;
  /** Which topics "Interested in" offers (keys of INTEREST_CATALOG). */
  interests: readonly string[];
  /** The Home shortcuts a community that has not chosen its own starts with. */
  shortcuts: readonly HomeShortcut[];
};

export type CategoryProfile = {
  key: string;
  label: string;
  faithBased: boolean;
  usesTradition: boolean;
  /** The sign-up question that asks a person's own path (null: the category asks none). */
  pathLabel: string | null;
  terms: CategoryTerms;
  modules: Partial<Record<ModuleKey, ModuleAvailability>>;
  paths: CategoryPath[];
  defaultPath: string | null;
  /** Optional, from the database: words that win over the app's own for this category (see parseWords). */
  words: WordOverlay | null;
  /** Optional, from the database: layout facts that win over the app's own (see parseLayoutHints). */
  layoutHints: Partial<CategoryLayout> | null;
};

// ---------------------------------------------------------------------------
// Jain Center = today
// ---------------------------------------------------------------------------

export const JAIN_TERMS: CategoryTerms = {
  greeting: 'Jai Jinendra',
  practice_tab: 'Jain Way',
  give_tab: 'Give',
  family_tab: 'Family',
  store: 'Satvik Store',
  school: 'Pathshala',
  learning: 'Gyan Path',
  place: 'derasar',
  assistant_context: 'a Jain community',
};

/** "Interested in" topics (people.interests holds the keys). The six of the original app first, in their original order. */
export const INTEREST_CATALOG: Record<string, { labelKey: StringKey }> = {
  events: { labelKey: 'profile.interest.events' },
  pathshala: { labelKey: 'profile.interest.pathshala' },
  volunteering: { labelKey: 'profile.interest.volunteering' },
  youth: { labelKey: 'profile.interest.youth' },
  seniors: { labelKey: 'profile.interest.seniors' },
  giving: { labelKey: 'profile.interest.giving' },
};

export const JAIN_INTERESTS: readonly string[] = ['events', 'pathshala', 'volunteering', 'youth', 'seniors', 'giving'];

/** Today's layout, every constant as it was before categories existed. */
export const JAIN_LAYOUT: CategoryLayout = {
  practiceTab: true,
  todayCard: 'full',
  specialDays: true,
  interests: JAIN_INTERESTS,
  shortcuts: HOME_SHORTCUT_KEYS,
};

export const JAIN_PROFILE: CategoryProfile = {
  key: JAIN_CENTER,
  label: 'Jain Center',
  faithBased: true,
  usesTradition: true,
  pathLabel: 'Which Jain tradition do you follow?',
  terms: JAIN_TERMS,
  // Every module default_on: exactly "no row means on".
  modules: {},
  paths: [],
  defaultPath: null,
  words: null,
  layoutHints: null,
};

// ---------------------------------------------------------------------------
// The generic experience (a category this build does not know)
// ---------------------------------------------------------------------------

export const GENERIC_TERMS: CategoryTerms = {
  greeting: 'Welcome',
  practice_tab: null,
  give_tab: 'Give',
  family_tab: 'Family',
  store: 'Store',
  school: null,
  learning: null,
  place: 'office',
  assistant_context: 'an organization',
};

/** Until the database says otherwise, an unknown category has none of the Jain-only modules. */
const GENERIC_MODULES: Partial<Record<ModuleKey, ModuleAvailability>> = {
  bolis: { availability: 'not_available', label: null },
  jain_way: { availability: 'not_available', label: null },
  pathshala: { availability: 'not_available', label: null },
  gyan_path: { availability: 'not_available', label: null },
};

export const GENERIC_INTERESTS: readonly string[] = ['events', 'volunteering', 'youth', 'seniors', 'giving'];

/** What the app shows for a category it has no layout entry for: complete, neutral, never the Jain one. */
export const GENERIC_LAYOUT_DATA: Pick<CategoryLayout, 'interests' | 'shortcuts'> = {
  interests: GENERIC_INTERESTS,
  shortcuts: ['photos', 'guide'],
};

/**
 * What the database does not say, per category: the topics "Interested in" offers and the Home shortcuts a community
 * starts with. An entry here is optional; a category without one uses GENERIC_LAYOUT_DATA.
 */
export const LAYOUT_BY_CATEGORY: Record<string, Pick<CategoryLayout, 'interests' | 'shortcuts'>> = {
  [JAIN_CENTER]: { interests: JAIN_INTERESTS, shortcuts: HOME_SHORTCUT_KEYS },
};

/** A profile for a category key this build has no built-in for (a newer database): neutral words, no Jain modules. */
export function genericProfile(key: string, label?: string | null): CategoryProfile {
  return {
    key,
    label: label?.trim() || key,
    faithBased: false,
    usesTradition: false,
    pathLabel: null,
    terms: GENERIC_TERMS,
    modules: GENERIC_MODULES,
    paths: [],
    defaultPath: null,
    words: null,
    layoutHints: null,
  };
}

/** Profiles built into the app, so the right layout is on the first frame (no wait for the network). Keyed by category. */
export const BUILTIN_PROFILES: Record<string, CategoryProfile> = {
  [JAIN_CENTER]: JAIN_PROFILE,
};

/** The profile to use before the database has answered: the app's own for a category it knows, else the generic one. */
export function fallbackProfile(key: string | null | undefined): CategoryProfile {
  const k = (key ?? '').trim();
  if (!k) return JAIN_PROFILE; // a database from before categories: every community is a Jain Center
  return BUILTIN_PROFILES[k] ?? genericProfile(k);
}

/** True when the app can lay a category out without waiting for the database (built in). */
export function isBuiltinCategory(key: string | null | undefined): boolean {
  const k = (key ?? '').trim();
  return !k || Object.prototype.hasOwnProperty.call(BUILTIN_PROFILES, k);
}

// ---------------------------------------------------------------------------
// Parsing what the database says (app.category_profile)
// ---------------------------------------------------------------------------

/** Postgres "undefined column" (42703): a database from before the column existed. */
export function isMissingColumnError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { code?: unknown; message?: unknown };
  const message = typeof e.message === 'string' ? e.message.toLowerCase() : '';
  return e.code === '42703' || (message.includes('column') && message.includes('does not exist'));
}

function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function isAvailability(v: unknown): v is Availability {
  return v === 'default_on' || v === 'default_off' || v === 'not_available';
}

function parseTerms(raw: unknown): CategoryTerms {
  const o = obj(raw);
  const word = (k: keyof CategoryTerms, fallback: string): string => str(o[k]) ?? fallback;
  // null means "this category has no such thing"; an absent key reads the same (a newer or older database).
  const optional = (k: keyof CategoryTerms): string | null => str(o[k]);
  return {
    greeting: word('greeting', GENERIC_TERMS.greeting),
    practice_tab: optional('practice_tab'),
    give_tab: word('give_tab', GENERIC_TERMS.give_tab),
    family_tab: word('family_tab', GENERIC_TERMS.family_tab),
    store: word('store', GENERIC_TERMS.store),
    school: optional('school'),
    learning: optional('learning'),
    place: word('place', GENERIC_TERMS.place),
    assistant_context: word('assistant_context', GENERIC_TERMS.assistant_context),
  };
}

function parseModules(raw: unknown): Partial<Record<ModuleKey, ModuleAvailability>> {
  const out: Partial<Record<ModuleKey, ModuleAvailability>> = {};
  for (const [key, value] of Object.entries(obj(raw))) {
    if (!isModuleKey(key)) continue; // a newer database may know more modules than this build
    const m = obj(value);
    if (!isAvailability(m.availability)) continue;
    out[key] = { availability: m.availability, label: str(m.label) };
  }
  return out;
}

function parsePaths(raw: unknown): CategoryPath[] {
  if (!Array.isArray(raw)) return [];
  const out: CategoryPath[] = [];
  for (const p of raw) {
    const o = obj(p);
    const key = str(o.key);
    const label = str(o.label);
    if (!key || !label) continue;
    out.push({ key, label, parent: str(o.parent), sort: typeof o.sort === 'number' ? o.sort : 0 });
  }
  return out;
}

/** True when the dictionary has this key: words for a key the app does not have are ignored (a newer database). */
export function isStringKey(k: string): k is StringKey {
  return Object.prototype.hasOwnProperty.call(en, k);
}

/**
 * Optional `words` from the database: `{ "<dictionary key>": "<English text>" }`. Only keys this build has, only
 * non-empty strings. It lets a new kind of organization speak its own words without an app update; the app's own
 * overlay (src/i18n/categories) is what a category has until the database says more.
 */
export function parseWords(raw: unknown): WordOverlay | null {
  const out: WordOverlay = {};
  for (const [k, v] of Object.entries(obj(raw))) {
    const text = typeof v === 'string' ? v : null;
    if (isStringKey(k) && text !== null && text.trim()) out[k] = text;
  }
  return Object.keys(out).length ? out : null;
}

/**
 * Optional `layout` from the database: `{ today_card: 'full'|'basic', special_days: bool, practice_tab: bool,
 * interests: [catalog key], shortcuts: [home shortcut] }`. Anything else is ignored. Each field wins over what the
 * profile's facts and the app's own layout say.
 */
export function parseLayoutHints(raw: unknown): Partial<CategoryLayout> | null {
  const o = obj(raw);
  const out: Partial<CategoryLayout> = {};
  if (o.today_card === 'full' || o.today_card === 'basic') out.todayCard = o.today_card;
  if (typeof o.special_days === 'boolean') out.specialDays = o.special_days;
  if (typeof o.practice_tab === 'boolean') out.practiceTab = o.practice_tab;
  if (Array.isArray(o.interests)) {
    const list = o.interests.filter((k): k is string => typeof k === 'string' && Object.prototype.hasOwnProperty.call(INTEREST_CATALOG, k));
    if (list.length) out.interests = list;
  }
  if (Array.isArray(o.shortcuts)) out.shortcuts = o.shortcuts.filter(isHomeShortcut);
  return Object.keys(out).length ? out : null;
}

/** The answer of `app.category_profile`, or null when it is not one (the caller then keeps the built-in profile). */
export function parseCategoryProfile(raw: unknown): CategoryProfile | null {
  const root = obj(raw);
  const c = obj(root.category);
  const key = str(c.key);
  if (!key) return null;
  return {
    key,
    label: str(c.label) ?? key,
    faithBased: c.faith_based === true,
    usesTradition: c.uses_tradition === true,
    pathLabel: str(c.path_label),
    terms: parseTerms(c.terms),
    modules: parseModules(root.modules),
    paths: parsePaths(root.paths),
    defaultPath: str(root.default_path),
    words: parseWords(root.words),
    layoutHints: parseLayoutHints(root.layout),
  };
}

// ---------------------------------------------------------------------------
// Which profile to lay the app out with
// ---------------------------------------------------------------------------

export type ProfileChoice = {
  profile: CategoryProfile;
  /** The database just now, this device's last answer for the community, or the app's own for that kind. */
  source: 'live' | 'cache' | 'builtin';
  /** The layout can be shown now (no wait for a kind the app knows). False only while a kind the app has no built-in for waits for its first answer. */
  ready: boolean;
};

/**
 * The profile to lay the app out with, from what is known:
 *  - `hint`: the kind `centers.category_key` names (read with the community; null when there is no community yet);
 *  - `live`: the database's last answer for this community; `cached`: the device's last answer;
 *  - `settled`: the first live read has finished, answered or not.
 * An answer for another kind than the hint's is out of date (the platform changed the kind) and is not used. With no usable
 * answer the app's own profile for the hint is used (generic for a kind it does not know), and a kind it does not know waits
 * (`ready` false) for the first answer or the end of the first read rather than showing a layout that may be wrong.
 */
export function chooseProfile(input: { hint: string | null; live: CategoryProfile | null; cached: CategoryProfile | null; settled: boolean }): ProfileChoice {
  const { hint, live, cached, settled } = input;
  const usable = (p: CategoryProfile | null): p is CategoryProfile => !!p && (!hint || p.key === hint);
  if (usable(live)) return { profile: live, source: 'live', ready: true };
  if (usable(cached)) return { profile: cached, source: 'cache', ready: true };
  return { profile: fallbackProfile(hint), source: 'builtin', ready: !hint || isBuiltinCategory(hint) || settled };
}

// ---------------------------------------------------------------------------
// Layout, modules and words from a profile
// ---------------------------------------------------------------------------

/**
 * How the app lays this category out. The profile's facts first (a tradition-based category has the full Today card; a
 * faith-based one plans special days; no practice term, no fourth tab), the app's own entry for what the database does not
 * say, then anything the database says in its optional `layout`.
 */
export function layoutFor(profile: CategoryProfile): CategoryLayout {
  const own = LAYOUT_BY_CATEGORY[profile.key] ?? GENERIC_LAYOUT_DATA;
  return {
    practiceTab: profile.terms.practice_tab !== null,
    todayCard: profile.usesTradition ? 'full' : 'basic',
    specialDays: profile.faithBased,
    interests: own.interests,
    shortcuts: own.shortcuts,
    ...(profile.layoutHints ?? {}),
  };
}

/**
 * The module map before `my_modules` answers, for guests, and when it cannot be read: a module the category does not have
 * ("Never") or has off until switched on is off, every other module is on. For Jain Center that is `{}`, "everything on",
 * exactly as before categories existed.
 */
export function categoryModuleMap(profile: Pick<CategoryProfile, 'modules'>): ModuleMap {
  const map: ModuleMap = {};
  for (const [key, m] of Object.entries(profile.modules) as [ModuleKey, ModuleAvailability][]) {
    if (m.availability !== 'default_on' && !CORE_MODULES.includes(key)) map[key] = false;
  }
  return map;
}

/** What `my_modules` says wins over the category's defaults (an organization may have switched a "default_off" module on). */
export function mergeModuleMap(defaults: ModuleMap, fromDatabase: ModuleMap | null): ModuleMap {
  return fromDatabase ? { ...defaults, ...fromDatabase } : defaults;
}

/** The category's own names for modules ("Religious school" for Pathshala), where it has one. */
export function categoryModuleLabels(profile: Pick<CategoryProfile, 'modules'>): Partial<Record<ModuleKey, string>> {
  const out: Partial<Record<ModuleKey, string>> = {};
  for (const [key, m] of Object.entries(profile.modules) as [ModuleKey, ModuleAvailability][]) {
    if (m.label) out[key] = m.label;
  }
  return out;
}

/**
 * The dictionary entries the category's named words fill, only where a term differs from Jain Center's, so Jain Center
 * adds none (and Gujarati and Hindi keep their reviewed tab labels wherever a term is the standard one).
 */
export function termWords(terms: CategoryTerms): WordOverlay {
  const out: WordOverlay = {};
  const differs = (k: keyof CategoryTerms): string | null => {
    const v = terms[k];
    return v !== null && v !== JAIN_TERMS[k] ? v : null;
  };
  const give = differs('give_tab');
  if (give) out['tab.give'] = give;
  const family = differs('family_tab');
  if (family) out['tab.family'] = family;
  const practice = differs('practice_tab');
  if (practice) out['tab.jainWay'] = practice;
  const store = differs('store');
  if (store) out['drawer.store'] = store;
  const school = differs('school');
  if (school) out['drawer.pathshala'] = school;
  const greeting = differs('greeting');
  if (greeting) {
    out['home.greetingFamily'] = `${greeting}, {family}`;
    out['home.greetingLead'] = `${greeting},`;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Interests
// ---------------------------------------------------------------------------

/** Every topic this build knows, in catalog order (what is kept of a person's saved interests). */
export const KNOWN_INTERESTS: readonly string[] = Object.keys(INTEREST_CATALOG);

export function isKnownInterest(k: string): boolean {
  return Object.prototype.hasOwnProperty.call(INTEREST_CATALOG, k);
}

/** The topics to offer: the layout's, in its order, those this build knows. */
export function interestsToOffer(layout: Pick<CategoryLayout, 'interests'>): string[] {
  return layout.interests.filter(isKnownInterest);
}


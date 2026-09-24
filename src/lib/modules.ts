/**
 * Modules an organization can switch on or off (WAVE2 contract). The keys are
 * the canonical strings shared with the database (`app.modules`) and the
 * portal. A module the database does not mention is ON: a missing
 * `app.center_modules` row means enabled, and before `app.my_modules` exists
 * everything is on.
 *
 * This file is pure (no React, no Supabase) so the whole map is unit-tested.
 * The loader and `useModule()` live in `src/providers/modules.tsx`.
 */

export const MODULE_KEYS = [
  'people',
  'membership',
  'events',
  'giving',
  'bolis',
  'store',
  'pathshala',
  'gyan_path',
  'jain_way',
  'content',
  'calendar',
  'comms',
  'surveys',
  'volunteers',
  'accounting',
  'reports',
  'niva',
  'governance',
] as const;

export type ModuleKey = (typeof MODULE_KEYS)[number];

/** Core modules can never be switched off. */
export const CORE_MODULES: readonly ModuleKey[] = ['people'];

/** depends_on from the contract: a module whose dependency is off is treated as off too. */
export const MODULE_DEPENDS_ON: Partial<Record<ModuleKey, readonly ModuleKey[]>> = {
  membership: ['people'],
  events: ['people'],
  giving: ['people'],
  bolis: ['giving'],
  store: ['people'],
  pathshala: ['people'],
  comms: ['people'],
  volunteers: ['people'],
  accounting: ['giving'],
  niva: ['content'],
  governance: ['people'],
};

export function isModuleKey(v: unknown): v is ModuleKey {
  return typeof v === 'string' && (MODULE_KEYS as readonly string[]).includes(v);
}

/** What the database said: `false` = switched off. Keys it did not mention are on. */
export type ModuleMap = Partial<Record<ModuleKey, boolean>>;

/** Everything on (no RPC yet, or it failed: we never hide features because of our own error). */
export const ALL_ON: ModuleMap = {};

/** Row shape of `app.my_modules(p_center uuid)` (hand-typed until the generated types include it). */
export type MyModuleRow = { key: string; label: string | null; enabled: boolean | null; core: boolean | null };

/**
 * Turn `my_modules` rows into a map. Unknown keys are ignored (a newer
 * database may know more modules than this build), a null `enabled` counts
 * as on, and a core module is always on.
 */
export function parseModuleRows(rows: unknown): { map: ModuleMap; labels: Partial<Record<ModuleKey, string>> } {
  const map: ModuleMap = {};
  const labels: Partial<Record<ModuleKey, string>> = {};
  if (!Array.isArray(rows)) return { map, labels };
  for (const raw of rows) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Partial<MyModuleRow>;
    if (!isModuleKey(r.key)) continue;
    const core = r.core === true || CORE_MODULES.includes(r.key);
    map[r.key] = core ? true : r.enabled !== false;
    if (typeof r.label === 'string' && r.label.trim()) labels[r.key] = r.label.trim();
  }
  return { map, labels };
}

/** Is this module on? Off when the database says so, or when a module it depends on is off. */
export function isModuleOn(map: ModuleMap, key: ModuleKey, seen: readonly ModuleKey[] = []): boolean {
  if (CORE_MODULES.includes(key)) return true;
  if (map[key] === false) return false;
  if (seen.includes(key)) return true; // defensive: a cycle in the table above must not recurse forever
  return (MODULE_DEPENDS_ON[key] ?? []).every((dep) => isModuleOn(map, dep, [...seen, key]));
}

/** On when ANY of the modules is on; `null` / empty means "always shown". */
export function anyModuleOn(map: ModuleMap, keys: readonly ModuleKey[] | ModuleKey | null | undefined): boolean {
  if (keys == null) return true;
  const list = typeof keys === 'string' ? [keys] : keys;
  if (list.length === 0) return true;
  return list.some((k) => isModuleOn(map, k));
}

/** Postgres "function does not exist" / PostgREST "not in the schema cache": the RPC has not been deployed yet. */
export function isMissingRpcError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { code?: unknown; message?: unknown };
  const code = typeof e.code === 'string' ? e.code : '';
  const message = typeof e.message === 'string' ? e.message.toLowerCase() : '';
  return code === 'PGRST202' || code === '42883' || message.includes('could not find the function') || (message.includes('function') && message.includes('does not exist'));
}

// ---------------------------------------------------------------------------
// Where each module shows up in the member app
// ---------------------------------------------------------------------------

/** Bottom tabs (route names in `(app)/(tabs)`). A tab shows when ANY of its modules is on; null = always. */
export const TAB_MODULES = {
  index: null,
  events: ['events', 'calendar', 'content'],
  give: ['giving', 'bolis'],
  'jain-way': ['jain_way', 'gyan_path', 'pathshala', 'content'],
  family: null,
} as const satisfies Record<string, readonly ModuleKey[] | null>;

export type TabRoute = keyof typeof TAB_MODULES;

export function isTabVisible(map: ModuleMap, tab: TabRoute): boolean {
  return anyModuleOn(map, TAB_MODULES[tab]);
}

/** Home cards (src/features/home.tsx). null = always shown. */
export const HOME_CARD_MODULE = {
  today: null,
  todayDarshan: 'content',
  alerts: 'comms',
  jainWay: 'jain_way',
  feedback: 'surveys',
  lunch: 'events',
  specialDay: 'giving',
  confirm: 'events',
  store: 'store',
  giving: 'giving',
  nextEvent: 'events',
  guide: null,
} as const satisfies Record<string, ModuleKey | null>;

export type HomeCard = keyof typeof HOME_CARD_MODULE;

export function isHomeCardVisible(map: ModuleMap, card: HomeCard): boolean {
  return anyModuleOn(map, HOME_CARD_MODULE[card]);
}

/** Drawer entries (src/components/drawer.tsx). null = always shown. */
export const DRAWER_MODULE = {
  calendar: 'calendar',
  pathshala: 'pathshala',
  donations: 'giving',
  store: 'store',
  rsvp: 'events',
  dashboard: 'reports',
  guide: null,
  volunteer: 'events',
  settings: null,
} as const satisfies Record<string, ModuleKey | null>;

export type DrawerEntry = keyof typeof DRAWER_MODULE;

export function isDrawerEntryVisible(map: ModuleMap, entry: DrawerEntry): boolean {
  return anyModuleOn(map, DRAWER_MODULE[entry]);
}

/** Sections of the Give tab. */
export const GIVE_SECTION_MODULE = {
  summary: 'giving',
  bolis: 'bolis',
  opportunities: 'giving',
  recurring: 'giving',
  pledges: 'giving',
  labh: 'giving',
} as const satisfies Record<string, ModuleKey>;

export type GiveSection = keyof typeof GIVE_SECTION_MODULE;

export function isGiveSectionVisible(map: ModuleMap, section: GiveSection): boolean {
  return isModuleOn(map, GIVE_SECTION_MODULE[section]);
}

/** Events tab segments. */
export const EVENTS_PANE_MODULE = { upcoming: 'events', calendar: 'calendar', photos: 'content' } as const satisfies Record<string, ModuleKey>;
export type EventsPane = keyof typeof EVENTS_PANE_MODULE;
const EVENTS_PANES: EventsPane[] = ['upcoming', 'calendar', 'photos'];

export function eventsPanes(map: ModuleMap): EventsPane[] {
  return EVENTS_PANES.filter((p) => isModuleOn(map, EVENTS_PANE_MODULE[p]));
}

/** My Jain Way segments. Learn holds Gyan Path + Pathshala (its audio lessons are Library content). */
export const JAIN_WAY_PANE_MODULES = {
  today: ['jain_way'],
  learn: ['gyan_path', 'pathshala'],
  saathi: ['jain_way'],
  library: ['content'],
} as const satisfies Record<string, readonly ModuleKey[]>;
export type JainWayPane = keyof typeof JAIN_WAY_PANE_MODULES;
const JAIN_WAY_PANES: JainWayPane[] = ['today', 'learn', 'saathi', 'library'];

/** Segments to show. Guests only ever see the Library. */
export function jainWayPanes(map: ModuleMap, signedIn: boolean): JainWayPane[] {
  return JAIN_WAY_PANES.filter((p) => (signedIn || p === 'library') && anyModuleOn(map, JAIN_WAY_PANE_MODULES[p]));
}

/** Parts of the Learn segment. */
export const LEARN_PART_MODULE = { gyan: 'gyan_path', pathshala: 'pathshala', lessons: 'content' } as const satisfies Record<string, ModuleKey>;

/** Pick the requested pane when it is shown, else the first one that is (null when none is). */
export function pickPane<P extends string>(requested: string | undefined, visible: readonly P[], preferred?: P): P | null {
  if (requested && (visible as readonly string[]).includes(requested)) return requested as P;
  if (preferred && visible.includes(preferred)) return preferred;
  return visible[0] ?? null;
}

/** "New to {center}" guide: first steps and Explore tiles. null = always shown. */
export const GUIDE_SECTION_MODULE = {
  whatsapp: 'comms',
  timings: null,
  zones: null,
  volunteer: 'volunteers',
  membership: 'membership',
  registrations: null,
  admin: null,
  links: null,
  ask: 'comms',
  pages: 'content',
} as const satisfies Record<string, ModuleKey | null>;

export type GuideSection = keyof typeof GUIDE_SECTION_MODULE;

export function isGuideSectionVisible(map: ModuleMap, section: GuideSection): boolean {
  return anyModuleOn(map, GUIDE_SECTION_MODULE[section]);
}

/**
 * Pushed screens in the `(app)` stack → the module they belong to. Keys are
 * the navigator's route names (the file path under `src/app/(app)` without
 * the extension). A route with no entry belongs to the core app.
 */
export const ROUTE_MODULE: Record<string, ModuleKey> = {
  // events
  'event/[id]/index': 'events',
  'event/[id]/tickets': 'events',
  'event/[id]/confirm': 'events',
  volunteer: 'events',
  // giving
  'opportunity/[id]': 'giving',
  pledges: 'giving',
  recurring: 'giving',
  'recurring-setup': 'giving',
  'labh/[dayId]': 'giving',
  // bolis
  bolis: 'bolis',
  'boli/[id]': 'bolis',
  // store
  store: 'store',
  cart: 'store',
  // learning
  'gyan/index': 'gyan_path',
  'gyan/[goalId]/index': 'gyan_path',
  'gyan/[goalId]/level/[levelId]': 'gyan_path',
  'pathshala-scan': 'pathshala',
  // library + photos
  'pachchakhan/[id]': 'content',
  'album/[id]': 'content',
  'guide/[slug]': 'content',
  // surveys, Niva
  'survey/[id]': 'surveys',
  niva: 'niva',
  // guide sections
  'guide/whatsapp': 'comms',
  'guide/ask': 'comms',
  'guide/volunteer': 'volunteers',
  'guide/membership': 'membership',
};

/**
 * The switched-off module that blocks this route, or null when the route may
 * open. Tab routes are blocked when every module of the tab is off.
 */
export function blockingModule(map: ModuleMap, routeName: string): ModuleKey | null {
  const name = routeName.replace(/^\/+|\/+$/g, '');
  if (Object.prototype.hasOwnProperty.call(TAB_MODULES, name)) {
    const keys = TAB_MODULES[name as TabRoute];
    if (keys === null || anyModuleOn(map, keys)) return null;
    return keys[0];
  }
  const own = (k: string): ModuleKey | undefined => (Object.prototype.hasOwnProperty.call(ROUTE_MODULE, k) ? ROUTE_MODULE[k] : undefined);
  const key = own(name) ?? own(`${name}/index`) ?? own(name.replace(/\/index$/, ''));
  if (!key || isModuleOn(map, key)) return null;
  return key;
}

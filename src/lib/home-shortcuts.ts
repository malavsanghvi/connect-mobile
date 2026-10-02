/**
 * Home shortcuts: the grid of round buttons under "Today at {center}".
 * The community picks them and their order in the portal (Settings › Member
 * app › Home shortcuts), stored in `centers.rules.home.shortcuts`:
 *
 * - key absent (or not a list) → all six, in the default order;
 * - an empty list → no shortcuts;
 * - unknown keys are ignored, a repeated key counts once.
 *
 * A shortcut whose module is switched off is hidden. Pure, unit-tested in
 * src/lib/__tests__/home-shortcuts.test.ts.
 */
import { anyModuleOn, type ModuleKey, type ModuleMap } from './modules';

export const HOME_SHORTCUT_KEYS = ['learn', 'playlist', 'photos', 'recipe', 'podcast', 'guide'] as const;
export type HomeShortcut = (typeof HOME_SHORTCUT_KEYS)[number];

/** learn → Gyan Path; the playlist, photos, a recipe and a podcast are Content; the welcome guide is always there (null). */
export const HOME_SHORTCUT_MODULE: Record<HomeShortcut, ModuleKey | null> = {
  learn: 'gyan_path',
  playlist: 'content',
  photos: 'content',
  recipe: 'content',
  podcast: 'content',
  guide: null,
};

export function isHomeShortcut(v: unknown): v is HomeShortcut {
  return typeof v === 'string' && (HOME_SHORTCUT_KEYS as readonly string[]).includes(v);
}

function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

/** The community's list from `centers.rules`, before module checks. */
export function configuredShortcuts(rules: unknown): HomeShortcut[] {
  const list = obj(obj(rules).home).shortcuts;
  if (!Array.isArray(list)) return [...HOME_SHORTCUT_KEYS];
  const out: HomeShortcut[] = [];
  for (const raw of list) {
    const key = typeof raw === 'string' ? raw.trim().toLowerCase() : raw;
    if (isHomeShortcut(key) && !out.includes(key)) out.push(key);
  }
  return out;
}

/** The shortcuts to show, in the community's order, without those of switched-off modules. */
export function homeShortcuts(rules: unknown, modules: ModuleMap): HomeShortcut[] {
  return configuredShortcuts(rules).filter((key) => anyModuleOn(modules, HOME_SHORTCUT_MODULE[key]));
}

/**
 * Widths (px, at the standard text size) from which the grid fits 4, 5 and 6
 * shortcuts on a row. Below the first it is 3: every phone, and the web,
 * which shows the app in a phone-width frame (layout.webAppWidth, 440 inside
 * the gutters). A tablet (600 wide inside the gutters) gets all six on one row.
 */
const COLUMN_STEPS: readonly (readonly [number, number])[] = [
  [580, 6],
  [540, 5],
  [460, 4],
];

/**
 * How many shortcuts sit on one row of the Home grid. `width` is the grid's
 * own width, which is the cards' width (the grid sits inside the same
 * gutters); a larger text size counts as a narrower screen, so the labels
 * keep their room. Never fewer than 3 a row or more than 6, and never more
 * columns than there are shortcuts (two shortcuts share the row instead of
 * leaving a gap). The grid never scrolls sideways: more shortcuts wrap onto
 * the next row.
 */
export function shortcutColumns(width: number, textScale = 1, count: number = HOME_SHORTCUT_KEYS.length): number {
  const scale = Number.isFinite(textScale) && textScale > 1 ? textScale : 1;
  const room = Number.isFinite(width) && width > 0 ? width / scale : 0;
  const cols = COLUMN_STEPS.find(([min]) => room >= min)?.[1] ?? 3;
  return Number.isFinite(count) && count >= 1 ? Math.min(cols, Math.floor(count)) : cols;
}

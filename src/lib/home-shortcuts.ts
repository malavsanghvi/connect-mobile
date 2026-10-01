/**
 * Home shortcuts: the row of round buttons under "Today at {center}".
 * The community picks them and their order in the portal (Settings › Member
 * app › Home shortcuts), stored in `centers.rules.home.shortcuts`:
 *
 * - key absent (or not a list) → all five, in the default order;
 * - an empty list → no shortcuts;
 * - unknown keys are ignored, a repeated key counts once.
 *
 * A shortcut whose module is switched off is hidden. Pure, unit-tested in
 * src/lib/__tests__/home-shortcuts.test.ts.
 */
import { isModuleOn, type ModuleKey, type ModuleMap } from './modules';

export const HOME_SHORTCUT_KEYS = ['learn', 'playlist', 'photos', 'recipe', 'podcast'] as const;
export type HomeShortcut = (typeof HOME_SHORTCUT_KEYS)[number];

/** learn → Gyan Path; the playlist, photos, a recipe and a podcast are Content. */
export const HOME_SHORTCUT_MODULE: Record<HomeShortcut, ModuleKey> = {
  learn: 'gyan_path',
  playlist: 'content',
  photos: 'content',
  recipe: 'content',
  podcast: 'content',
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
  return configuredShortcuts(rules).filter((key) => isModuleOn(modules, HOME_SHORTCUT_MODULE[key]));
}

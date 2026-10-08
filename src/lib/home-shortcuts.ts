/**
 * Home shortcuts: the community's choice of what Home offers, edited in the
 * portal (Settings › Member app › Home shortcuts) and stored in
 * `centers.rules.home.shortcuts`. Since the Netflix-style Home (2026-10-02)
 * each shortcut is a tile of the Learn & listen row instead of a round button
 * (src/lib/home-rails.ts LEARN_LISTEN_SHORTCUT; "New here" is the first tile of Life@JSH, which
 * does not depend on it):
 *
 * - key absent (or not a list) → the kind of organization's default (src/lib/categories.ts: all six, in the default order, for a Jain Center);
 * - an empty list → none;
 * - unknown keys are ignored, a repeated key counts once.
 *
 * Pure, unit-tested in src/lib/__tests__/home-shortcuts.test.ts.
 */

export const HOME_SHORTCUT_KEYS = ['learn', 'playlist', 'photos', 'recipe', 'podcast', 'guide'] as const;
export type HomeShortcut = (typeof HOME_SHORTCUT_KEYS)[number];

export function isHomeShortcut(v: unknown): v is HomeShortcut {
  return typeof v === 'string' && (HOME_SHORTCUT_KEYS as readonly string[]).includes(v);
}

function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

/** The community's list from `centers.rules`, before module checks. `fallback` is what a community that has not chosen starts with. */
export function configuredShortcuts(rules: unknown, fallback: readonly HomeShortcut[] = HOME_SHORTCUT_KEYS): HomeShortcut[] {
  const list = obj(obj(rules).home).shortcuts;
  if (!Array.isArray(list)) return [...fallback];
  const out: HomeShortcut[] = [];
  for (const raw of list) {
    const key = typeof raw === 'string' ? raw.trim().toLowerCase() : raw;
    if (isHomeShortcut(key) && !out.includes(key)) out.push(key);
  }
  return out;
}

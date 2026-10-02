/**
 * Home shortcuts: the community's choice of what Home offers, edited in the
 * portal (Settings › Member app › Home shortcuts) and stored in
 * `centers.rules.home.shortcuts`. Since the Netflix-style Home (2026-10-02)
 * each shortcut brings a rail of tiles instead of a round button
 * (src/lib/home-rails.ts RAIL_SHORTCUTS):
 *
 * - key absent (or not a list) → all six, in the default order;
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

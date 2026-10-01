/**
 * Params that pick a pane inside a tab: Events `view` (upcoming | calendar | photos) and My Jain Way `tab` / `section`.
 * They stay on the tab's route after a deep link or a segment change, so without this a tap on the tab bar re-applied the
 * old pane (tapping Events after opening Photos from Home opened Photos again). A tap on a tab starts it at its default pane.
 */
export const PANE_PARAM_KEYS = ['view', 'tab', 'section'] as const;

/** Every pane param set to undefined: passed to navigate(), it clears them whether params are replaced or merged. */
export function clearedPaneParams(): Record<(typeof PANE_PARAM_KEYS)[number], undefined> {
  return { view: undefined, tab: undefined, section: undefined };
}

/** True when the route carries a pane param, so tapping the tab it is already on should bring it back to its default pane. */
export function hasPaneParams(params: object | null | undefined): boolean {
  if (!params) return false;
  const bag = params as Record<string, unknown>;
  return PANE_PARAM_KEYS.some((k) => bag[k] !== undefined && bag[k] !== null && bag[k] !== '');
}

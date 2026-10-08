/**
 * Open a screen a moment later, check that it really opened, and try again if it did not. Used right after a navigator
 * mounts or switches (the Welcome door buttons enter guest mode and then open a screen), when the router may not have
 * its route information yet. Two things can go wrong there, and both are handled:
 *   - the call THROWS (the web router had no route information: "Cannot read properties of null (reading 'pathname')"),
 *     which would blank the page if it escaped: it is caught and tried again;
 *   - the call returns normally but the navigator is still switching and DISCARDS it, so nothing opens and nothing is
 *     reported: `arrived` (when the caller can tell) is checked a moment after each try, and the call is repeated.
 * After the last try it gives up through `onFail` and the person stays where they are.
 */
export function pushSoon(
  push: () => void,
  onFail: (err: unknown) => void,
  delaysMs: readonly number[] = [0, 150, 400],
  arrived?: () => boolean,
  checkAfterMs = 300,
): void {
  const [wait, ...rest] = delaysMs;
  const again = (err: unknown) => (rest.length > 0 ? pushSoon(push, onFail, rest, arrived, checkAfterMs) : onFail(err));
  setTimeout(() => {
    try {
      push();
    } catch (err) {
      again(err);
      return;
    }
    if (!arrived) return;
    setTimeout(() => {
      if (!arrived()) again(new Error('the screen did not open'));
    }, checkAfterMs);
  }, wait ?? 0);
}

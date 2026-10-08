/**
 * Run a navigation `push` a moment later, and again if it throws, instead of letting the throw reach React (an
 * uncaught error in a handler unmounts the whole tree: a blank page). Used right after a navigator mounts, when the
 * router may not have its route information yet. After the last try it gives up through `onFail` and the person
 * stays where they are.
 */
export function pushSoon(push: () => void, onFail: (err: unknown) => void, delaysMs: readonly number[] = [0, 150, 400]): void {
  const [wait, ...rest] = delaysMs;
  setTimeout(() => {
    try {
      push();
    } catch (err) {
      if (rest.length > 0) pushSoon(push, onFail, rest);
      else onFail(err);
    }
  }, wait ?? 0);
}

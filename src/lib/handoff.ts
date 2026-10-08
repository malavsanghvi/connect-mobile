/**
 * A value one screen leaves for a component that mounts a moment later (the door chosen on the Welcome screen, the
 * event to return to after signing in, the event link to reopen after switching community). Kept in memory because
 * the app does not reload in between.
 *
 * WHY THIS IS A SEPARATE FUNCTION. The app is built with the React Compiler (app.json: reactCompiler), which compiles
 * components and hooks. Inside one it rewrote
 *
 *     const route = pending;   // a module-level `let`
 *     pending = null;
 *     if (route) go(route);
 *
 * into "pending = null; if (pending) go(pending)", so the value was always null: the Welcome door buttons pushed
 * `null` ("Cannot read properties of null (reading 'pathname')") and, after the first fix, did nothing at all; "back
 * to the event after signing in" read a field of null. A plain function like `take` below is not compiled, and its
 * result is opaque to the compiler, so the value survives. Never read a module-level `let` and then reassign it inside
 * a component or hook: take it through a handoff.
 */
export type Handoff<T> = {
  /** Leave a value (or null to clear it). */
  set: (value: T | null) => void;
  /** Look without taking. */
  peek: () => T | null;
  /** Take the value: returns it and clears it, so it is used once. */
  take: () => T | null;
};

export function createHandoff<T>(): Handoff<T> {
  let value: T | null = null;
  return {
    set(next) {
      value = next;
    },
    peek() {
      return value;
    },
    take() {
      const taken = value;
      value = null;
      return taken;
    },
  };
}

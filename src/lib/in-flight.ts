/**
 * Share a request that is already running. Home asks the same questions from two places at about the same time (the
 * "Still coming?" and lunch times load, and the Events row: both want the upcoming events and the family's RSVPs); while
 * the first request is on its way, the second takes its answer instead of making the request again.
 *
 * Nothing is kept once a request has finished, success or failure: a read made after a write (or after the first read
 * has failed) always goes to the server. Unit-tested in src/lib/__tests__/in-flight.test.ts.
 */
const running = new Map<string, Promise<unknown>>();

/** The result of `start()`, or of the request with the same `key` that is still running. */
export function shareWhileRunning<T>(key: string, start: () => Promise<T>): Promise<T> {
  const existing = running.get(key);
  if (existing) return existing as Promise<T>;
  const promise: Promise<T> = start().finally(() => {
    if (running.get(key) === promise) running.delete(key);
  });
  running.set(key, promise);
  return promise;
}

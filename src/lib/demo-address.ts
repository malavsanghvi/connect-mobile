import { logError } from './errors';

/**
 * The web address after a demo link has been used. `https://app.weaverams.org/demo?persona=<id>` carries an id (and `?as=family` an
 * instruction) that must not stay in the address bar or the history once the demo has started, or on a reload it would start again.
 * Called when the start has settled: a started demo goes to `/` (the Home), a start that failed stays on `/demo` (the chooser that
 * shows the reason). The history entry is replaced, not added, so Back never returns to the link. Only the web has an address bar:
 * on a phone there is no `history`, and this does nothing.
 */
export function forgetDemoLink(started: boolean): void {
  try {
    const where = globalThis as { history?: { state?: unknown; replaceState?: (state: unknown, unused: string, url: string) => void }; location?: { search?: string } };
    if (!where.history || typeof where.history.replaceState !== 'function' || !where.location) return;
    if (!where.location.search) return;
    where.history.replaceState(where.history.state ?? null, '', started ? '/' : '/demo');
  } catch (err) {
    // The demo itself is not affected; only the link stays in the address bar.
    logError('cleaning the demo link from the address bar (continuing)', err);
  }
}

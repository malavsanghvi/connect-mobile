import { afterEach, describe, expect, it, jest } from '@jest/globals';

import { forgetDemoLink } from '../demo-address';

type Where = { history?: unknown; location?: unknown };
const where = globalThis as unknown as Where;
const before = { history: where.history, location: where.location };

afterEach(() => {
  where.history = before.history;
  where.location = before.location;
  jest.restoreAllMocks();
});

function browser(search: string) {
  const replaceState = jest.fn<(state: unknown, unused: string, url: string) => void>();
  where.history = { state: { id: 'kept' }, replaceState };
  where.location = { search };
  return replaceState;
}

describe('cleaning a used demo link from the address bar (web)', () => {
  it('replaces the link with / once the demo has started, keeping the history state, so no id lingers', () => {
    const replaceState = browser('?persona=0f381a89-ac5c-4d68-8af0-a06a578e759c');
    forgetDemoLink(true);
    expect(replaceState).toHaveBeenCalledTimes(1);
    expect(replaceState).toHaveBeenCalledWith({ id: 'kept' }, '', '/');
  });

  it('leaves the chooser on /demo, without the query, when the start failed', () => {
    const replaceState = browser('?as=family&community=demo-club');
    forgetDemoLink(false);
    expect(replaceState).toHaveBeenCalledWith({ id: 'kept' }, '', '/demo');
  });

  it('does nothing when the address carries no query', () => {
    const replaceState = browser('');
    forgetDemoLink(true);
    expect(replaceState).not.toHaveBeenCalled();
  });

  it('does nothing on a phone, where there is no address bar', () => {
    where.history = undefined;
    where.location = undefined;
    expect(() => forgetDemoLink(true)).not.toThrow();
  });

  it('carries on (and says so in the log) when the address cannot be changed', () => {
    const log = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const replaceState = browser('?as=family');
    replaceState.mockImplementation(() => {
      throw new Error('SecurityError');
    });
    expect(() => forgetDemoLink(true)).not.toThrow();
    expect(log).toHaveBeenCalled();
  });
});

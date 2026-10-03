import { describe, expect, it, jest } from '@jest/globals';

import { shareWhileRunning } from '../in-flight';

/** A request we finish by hand. */
function pending<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('shareWhileRunning (one request when two ask at about the same time)', () => {
  it('starts the request once and gives every asker its answer while it is running', async () => {
    const request = pending<string>();
    const start = jest.fn(() => request.promise);
    const first = shareWhileRunning('events:c1', start);
    const second = shareWhileRunning('events:c1', start);
    expect(start).toHaveBeenCalledTimes(1);
    request.resolve('answer');
    await expect(first).resolves.toBe('answer');
    await expect(second).resolves.toBe('answer');
  });

  it('keeps nothing once the request is over: a later ask goes to the server again (a read after a write is never stale)', async () => {
    const answers = ['before the write', 'after the write'];
    const start = jest.fn(async () => answers.shift() as string);
    expect(await shareWhileRunning('events:c1', start)).toBe('before the write');
    expect(await shareWhileRunning('events:c1', start)).toBe('after the write');
    expect(start).toHaveBeenCalledTimes(2);
  });

  it('shares a failure with everyone who was waiting, and does not keep it: the next ask tries again', async () => {
    const request = pending<string>();
    const start = jest.fn<() => Promise<string>>().mockReturnValueOnce(request.promise).mockResolvedValueOnce('fine this time');
    const a = shareWhileRunning('rsvps:h1', start);
    const b = shareWhileRunning('rsvps:h1', start);
    request.reject(new Error('network down'));
    await expect(a).rejects.toThrow('network down');
    await expect(b).rejects.toThrow('network down');
    expect(await shareWhileRunning('rsvps:h1', start)).toBe('fine this time');
    expect(start).toHaveBeenCalledTimes(2);
  });

  it('does not mix up different questions', async () => {
    const one = pending<string>();
    const two = pending<string>();
    const a = shareWhileRunning('rsvps:h1:e1', () => one.promise);
    const b = shareWhileRunning('rsvps:h1:e1,e2', () => two.promise);
    one.resolve('only e1');
    two.resolve('e1 and e2');
    expect(await a).toBe('only e1');
    expect(await b).toBe('e1 and e2');
  });
});

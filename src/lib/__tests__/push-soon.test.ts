import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

import { pushSoon } from '../push-soon';

describe('pushSoon', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('pushes after a moment, not in the same tick', () => {
    const push = jest.fn();
    const fail = jest.fn();
    pushSoon(push, fail);
    expect(push).not.toHaveBeenCalled();
    jest.advanceTimersByTime(0);
    expect(push).toHaveBeenCalledTimes(1);
    expect(fail).not.toHaveBeenCalled();
  });

  it('tries again when the push throws, and stops as soon as one works', () => {
    const push = jest.fn<() => void>().mockImplementationOnce(() => {
      throw new TypeError("Cannot read properties of null (reading 'pathname')");
    });
    const fail = jest.fn();
    pushSoon(push, fail);
    jest.advanceTimersByTime(0);
    expect(push).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(150);
    expect(push).toHaveBeenCalledTimes(2);
    jest.advanceTimersByTime(1000);
    expect(push).toHaveBeenCalledTimes(2);
    expect(fail).not.toHaveBeenCalled();
  });

  it('gives up after the last try and says why, so the person stays where they are', () => {
    const boom = new TypeError('not ready');
    const push = jest.fn<() => void>().mockImplementation(() => {
      throw boom;
    });
    const fail = jest.fn();
    pushSoon(push, fail);
    jest.advanceTimersByTime(5000);
    expect(push).toHaveBeenCalledTimes(3);
    expect(fail).toHaveBeenCalledTimes(1);
    expect(fail).toHaveBeenCalledWith(boom);
  });

  it('never lets the error escape into the caller', () => {
    const push = () => {
      throw new Error('x');
    };
    expect(() => {
      pushSoon(push, () => undefined, [0]);
      jest.advanceTimersByTime(10);
    }).not.toThrow();
  });
});

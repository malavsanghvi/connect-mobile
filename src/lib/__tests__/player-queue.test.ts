import { describe, expect, it } from '@jest/globals';

import { firstPlayable, moveItem, nextPlayable, previousAction, previousPlayable, RESTART_AFTER_SECONDS, startIndex } from '../player-queue';

// a (audio) · v (video, skipped) · b (audio) · w (video) · c (audio)
const Q = [
  { id: 'a', playable: true },
  { id: 'v', playable: false },
  { id: 'b', playable: true },
  { id: 'w', playable: false },
  { id: 'c', playable: true },
];
const VIDEOS = [
  { id: 'v1', playable: false },
  { id: 'v2', playable: false },
];

describe('player queue', () => {
  it('firstPlayable skips what cannot play', () => {
    expect(firstPlayable(Q)).toBe(0);
    expect(firstPlayable(Q, 1)).toBe(2);
    expect(firstPlayable(Q, 5)).toBe(-1);
    expect(firstPlayable(Q, -3)).toBe(0);
    expect(firstPlayable(VIDEOS)).toBe(-1);
    expect(firstPlayable([])).toBe(-1);
  });
  it('next and previous jump over videos', () => {
    expect(nextPlayable(Q, 0)).toBe(2);
    expect(nextPlayable(Q, 2)).toBe(4);
    expect(nextPlayable(Q, 4)).toBe(-1);
    expect(previousPlayable(Q, 4)).toBe(2);
    expect(previousPlayable(Q, 2)).toBe(0);
    expect(previousPlayable(Q, 0)).toBe(-1);
    expect(previousPlayable(Q, 99)).toBe(4);
  });
  it('starts on the chosen item, else the next playable one, else the first', () => {
    expect(startIndex(Q)).toBe(0);
    expect(startIndex(Q, 'b')).toBe(2);
    expect(startIndex(Q, 'v')).toBe(2);
    expect(startIndex(Q, 'w')).toBe(4);
    expect(startIndex(Q, 'missing')).toBe(0);
    expect(startIndex([...Q.slice(0, 4), { id: 'x', playable: false }], 'w')).toBe(0);
    expect(startIndex(VIDEOS, 'v1')).toBe(-1);
  });
  it('previous restarts a track a few seconds in, or at the start of the queue', () => {
    expect(previousAction(Q, 2, 0)).toEqual({ kind: 'go', index: 0 });
    expect(previousAction(Q, 2, RESTART_AFTER_SECONDS)).toEqual({ kind: 'go', index: 0 });
    expect(previousAction(Q, 2, RESTART_AFTER_SECONDS + 0.5)).toEqual({ kind: 'restart' });
    expect(previousAction(Q, 0, 0)).toEqual({ kind: 'restart' });
  });
  it('moveItem swaps neighbours and leaves out-of-range moves alone', () => {
    const list = ['a', 'b', 'c'];
    expect(moveItem(list, 0, 1)).toEqual(['b', 'a', 'c']);
    expect(moveItem(list, 2, -1)).toEqual(['a', 'c', 'b']);
    expect(moveItem(list, 0, -1)).toEqual(['a', 'b', 'c']);
    expect(moveItem(list, 2, 1)).toEqual(['a', 'b', 'c']);
    expect(moveItem(list, 5, -1)).toEqual(['a', 'b', 'c']);
    expect(list).toEqual(['a', 'b', 'c']);
    expect(moveItem(list, 0, -1)).not.toBe(list);
  });
});

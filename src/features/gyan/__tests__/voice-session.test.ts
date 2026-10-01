import { describe, expect, it } from '@jest/globals';

import { addResult, continuousSupported, endAction, errorAction, freshSession, heardCandidates, heardText, MAX_QUIET_PAUSES, MAX_SESSION_MS } from '../voice-session';

describe('continuousSupported', () => {
  it('is missing on Android 12 and below only', () => {
    expect(continuousSupported('android', 31)).toBe(false);
    expect(continuousSupported('android', 32)).toBe(false);
    expect(continuousSupported('android', 33)).toBe(true);
    expect(continuousSupported('ios', '17.4')).toBe(true);
    expect(continuousSupported('web', undefined)).toBe(true);
  });
});

describe('heard text and candidates', () => {
  it('keeps unfinished words after the last finished segment in every alternative', () => {
    const s = freshSession('all');
    addResult(s, ['namo arihantanam'], true);
    addResult(s, ['namo siddhanam', 'nemo siddhanam'], true);
    addResult(s, ['namo aya'], false);
    expect(heardText(s)).toBe('namo arihantanam namo siddhanam namo aya');
    expect(heardCandidates(s)).toEqual(['namo arihantanam namo siddhanam namo aya', 'namo arihantanam nemo siddhanam namo aya']);
  });
  it('is empty when nothing was heard', () => {
    expect(heardCandidates(freshSession('verse'))).toEqual([]);
  });
});

describe('errorAction', () => {
  it('scores what was heard when "no speech" comes late', () => {
    const s = freshSession('all');
    addResult(s, ['namo arihantanam namo siddhanam'], true);
    expect(errorAction(s, 'no-speech')).toBe('evaluate');
    expect(errorAction(s, 'speech-timeout')).toBe('evaluate');
    expect(errorAction(s, 'network')).toBe('fail');
  });
  it('shows "no speech" when nothing was heard, and ignores our own abort', () => {
    expect(errorAction(freshSession('verse'), 'no-speech')).toBe('fail');
    expect(errorAction(freshSession('verse'), 'aborted')).toBe('ignore');
    expect(errorAction(freshSession(null), 'network')).toBe('ignore');
  });
  it('treats a pause on old Android as a pause until the member taps to finish', () => {
    const s = freshSession('all', true);
    expect(errorAction(s, 'no-speech')).toBe('pause');
    s.stopRequested = true;
    expect(errorAction(s, 'no-speech')).toBe('fail');
  });
});

describe('endAction', () => {
  it('starts old Android again after a pause, and finishes when the member taps', () => {
    const s = freshSession('all', true, 0);
    addResult(s, ['namo arihantanam'], true);
    expect(endAction(s, 5000)).toBe('restart');
    s.stopRequested = true;
    expect(endAction(s, 6000)).toBe('finish');
  });
  it('stops restarting after long quiet, a long session or an error', () => {
    const quiet = freshSession('all', true, 0);
    quiet.quiet = MAX_QUIET_PAUSES;
    expect(endAction(quiet, 1000)).toBe('finish');
    expect(endAction(freshSession('all', true, 0), MAX_SESSION_MS + 1)).toBe('finish');
    const failed = freshSession('all', true, 0);
    failed.errored = true;
    expect(endAction(failed, 1000)).toBe('finish');
  });
  it('finishes at once where listening goes through pauses, and ignores an ended session', () => {
    expect(endAction(freshSession('all', false, 0), 1000)).toBe('finish');
    expect(endAction(freshSession(null), 1000)).toBe('ignore');
  });
  it('resets the quiet count when words arrive', () => {
    const s = freshSession('all', true, 0);
    s.quiet = 2;
    addResult(s, ['eso panch'], true);
    expect(s.quiet).toBe(0);
  });
});

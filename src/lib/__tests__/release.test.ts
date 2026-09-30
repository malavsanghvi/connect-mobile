import { describe, expect, it } from '@jest/globals';

import { describeRelease, releaseLabel } from '../release';

describe('release', () => {
  it('shows the version, build and the over-the-air update in use', () => {
    const r = describeRelease({ version: '1.1.0', nativeBuild: '12', updateId: '4f3a21c0-aaaa-bbbb-cccc-ddddeeeeffff', channel: 'preview', isEmbeddedLaunch: false });
    expect(r).toEqual({ version: '1.1.0', build: '12', update: '4f3a21c0', channel: 'preview' });
    expect(releaseLabel(r)).toBe('1.1.0 (build 12) · update 4f3a21c0 · preview');
  });
  it('shows no update when the build\'s own bundle runs', () => {
    const r = describeRelease({ version: '1.1.0', nativeBuild: '12', updateId: 'abc12345-0000', isEmbeddedLaunch: true });
    expect(r.update).toBeNull();
    expect(releaseLabel(r)).toBe('1.1.0 (build 12)');
  });
  it('falls back to safe defaults', () => {
    expect(describeRelease({})).toEqual({ version: '1.0.0', build: '1', update: null, channel: null });
  });
});

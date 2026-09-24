import { describe, expect, it } from '@jest/globals';

import { readBranding, wordmarkLines } from '../branding';

describe('branding', () => {
  it('splits the community name into the two-line wordmark', () => {
    expect(wordmarkLines('Jain Society of Houston')).toEqual(['JAIN SOCIETY', 'OF HOUSTON']);
    expect(wordmarkLines('Jain Center of Northern California')).toEqual(['JAIN CENTER', 'OF NORTHERN CALIFORNIA']);
    expect(wordmarkLines('Jain Sangh')).toEqual(['JAIN SANGH']);
    expect(wordmarkLines('Greater Boston Jain Sangh Temple')).toEqual(['GREATER BOSTON', 'JAIN SANGH TEMPLE']);
  });
  it('reads logos, wordmark and dashboard url from centers.branding', () => {
    const b = readBranding({ name: 'Jain Society of Houston', branding: { logo_url: 'https://x.test/logo.png', dashboard_url: 'https://x.test/d' } });
    expect(b.markUrl).toBe('https://x.test/logo.png');
    expect(b.logoUrl).toBe('https://x.test/logo.png');
    expect(b.dashboardUrl).toBe('https://x.test/d');
    expect(b.wordmark).toEqual(['JAIN SOCIETY', 'OF HOUSTON']);
  });
  it('ignores non-http values and falls back to the env dashboard url', () => {
    const b = readBranding({ name: 'X', branding: { mark_url: 'javascript:alert(1)', wordmark: ['A', 'B'] } }, 'https://env.test/dash');
    expect(b.markUrl).toBeNull();
    expect(b.dashboardUrl).toBe('https://env.test/dash');
    expect(b.wordmark).toEqual(['A', 'B']);
    expect(readBranding(null).dashboardUrl).toBeNull();
  });
});

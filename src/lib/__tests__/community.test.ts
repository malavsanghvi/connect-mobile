import { describe, expect, it } from '@jest/globals';

import { brandAssetUrl, brandColors, brandPalette, communityToOpen, formatJoinCode, isCommunityChoice, mixHex, openedPath, parseJoinInput, searchableCommunities } from '../community';

describe('parseJoinInput', () => {
  it('reads a typed code in any case, with spaces or a dash', () => {
    expect(parseJoinInput('7k4m-q2pd')).toBe('7K4MQ2PD');
    expect(parseJoinInput(' 7K4M Q2PD ')).toBe('7K4MQ2PD');
  });
  it('reads the app link and the web link a QR code carries', () => {
    expect(parseJoinInput('communityconnect://join/7K4MQ2PD')).toBe('7K4MQ2PD');
    expect(parseJoinInput('connect://join/7k4m-q2pd')).toBe('7K4MQ2PD');
    expect(parseJoinInput('https://app.communityconnect.app/join/7K4MQ2PD?utm=poster')).toBe('7K4MQ2PD');
  });
  it('refuses other links and junk', () => {
    expect(parseJoinInput('https://example.org/events/12')).toBeNull();
    expect(parseJoinInput('JSH-TICKET:abc')).toBeNull();
    expect(parseJoinInput('abc')).toBeNull();
    expect(parseJoinInput('')).toBeNull();
    expect(parseJoinInput(null)).toBeNull();
  });
  it('prints codes in two groups', () => {
    expect(formatJoinCode('7k4mq2pd')).toBe('7K4M-Q2PD');
    expect(formatJoinCode('JSH2026AB12')).toBe('JSH2026AB12');
  });
});

describe('communityToOpen', () => {
  const choice = { slug: 'jcnj', name: 'Jain Center of New Jersey' };
  it('uses the saved choice first', () => {
    expect(communityToOpen({ saved: choice, signedIn: false, defaultSlug: 'jsh' })).toBe('jcnj');
    expect(communityToOpen({ saved: choice, signedIn: true, defaultSlug: 'jsh' })).toBe('jcnj');
  });
  it('keeps existing signed-in installs on the build default (no new step for current members)', () => {
    expect(communityToOpen({ saved: null, signedIn: true, defaultSlug: 'jsh' })).toBe('jsh');
  });
  it('asks a new install on a plain launch or a join link', () => {
    expect(communityToOpen({ saved: null, signedIn: false, defaultSlug: 'jsh' })).toBeNull();
    expect(communityToOpen({ saved: null, signedIn: false, defaultSlug: 'jsh', openedAt: '/' })).toBeNull();
    expect(communityToOpen({ saved: null, signedIn: false, defaultSlug: 'jsh', openedAt: '/join/7K4MQ2PD' })).toBeNull();
  });
  it("opens the build's community for a link into one of its screens", () => {
    expect(communityToOpen({ saved: null, signedIn: false, defaultSlug: 'jsh', openedAt: '/events/12' })).toBe('jsh');
    expect(communityToOpen({ saved: null, signedIn: false, defaultSlug: 'jsh', openedAt: '/sign-in' })).toBe('jsh');
  });
  it('reads the path the app was opened on', () => {
    expect(openedPath(null)).toBe('/');
    expect(openedPath('https://app.example.org/')).toBe('/');
    expect(openedPath('https://app.example.org/events/12?x=1')).toBe('/events/12');
    expect(openedPath('communityconnect://join/7K4MQ2PD')).toBe('/join/7K4MQ2PD');
    expect(openedPath('connect://events/12')).toBe('/events/12');
    expect(openedPath('exp://192.168.1.2:8081')).toBe('/');
    expect(openedPath('exp://192.168.1.2:8081/--/events')).toBe('/events');
  });
  it('validates what was stored on the device', () => {
    expect(isCommunityChoice(choice)).toBe(true);
    expect(isCommunityChoice({ slug: 'Bad Slug', name: 'x' })).toBe(false);
    expect(isCommunityChoice('jsh')).toBe(false);
    expect(isCommunityChoice(null)).toBe(false);
  });
});

describe('brand theme', () => {
  it('reads the brand kit colours, then the older top-level keys', () => {
    expect(brandColors({ colors: { primary: '#2f5d50', accent: '#c9731c' } })).toEqual({ primary: '#2F5D50', accent: '#C9731C' });
    expect(brandColors({ primary: '#1B2C5C', accent: '#C9731C' })).toEqual({ primary: '#1B2C5C', accent: '#C9731C' });
    expect(brandColors({ primary: 'red' })).toEqual({ primary: null, accent: null });
    expect(brandColors(null)).toEqual({ primary: null, accent: null });
  });
  it('mixes colours', () => {
    expect(mixHex('#000000', '#FFFFFF', 0.5)).toBe('#808080');
    expect(mixHex('#1B2C5C', '#FFFFFF', 0)).toBe('#1B2C5C');
  });
  it('derives the palette only for what the brand kit sets', () => {
    const p = brandPalette({ colors: { primary: '#2F5D50' } });
    expect(p.navy).toBe('#2F5D50');
    expect(p.navyTint).toMatch(/^#[0-9A-F]{6}$/);
    expect(p.saffron).toBeUndefined();
    expect(brandPalette({})).toEqual({});
  });
  it('builds public URLs for brand-kit files', () => {
    expect(brandAssetUrl('c1/logo.png', 'https://x.supabase.co/')).toBe('https://x.supabase.co/storage/v1/object/public/branding/c1/logo.png');
    expect(brandAssetUrl('../secret', 'https://x.supabase.co')).toBeNull();
    expect(brandAssetUrl(null, 'https://x.supabase.co')).toBeNull();
  });
});

describe('searchableCommunities', () => {
  it('never offers a sandbox in search results (join code only)', () => {
    const rows = [
      { slug: 'jsh', sandbox: false },
      { slug: 'jsh-sandbox', sandbox: true },
    ];
    expect(searchableCommunities(rows).map((r) => r.slug)).toEqual(['jsh']);
  });
});

import { describe, expect, it } from '@jest/globals';

import {
  addressForChoice,
  brandAssetUrl,
  brandColors,
  brandPalette,
  communityAddress,
  communityFromHost,
  communityToOpen,
  formatJoinCode,
  isCommunityChoice,
  mixHex,
  normalizeHost,
  onMemberDomain,
  openedPath,
  parseJoinInput,
  pickableCommunities,
  pickerAddress,
  searchableCommunities,
} from '../community';
import { communityDefaults } from '../env';

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

  describe('neutral first launch: no organization is suggested or opened for a new install', () => {
    const jsh = { slug: 'jsh', name: 'Jain Society of Houston' };
    const legacy = communityDefaults(undefined).centerSlug; // the shared app: no build community, the legacy default
    const forJsh = communityDefaults('jsh').centerSlug; // a build made for JSH (EXPO_PUBLIC_CENTER_SLUG=jsh)

    it('shows the finder for a new install on a plain launch, in the shared app and in a build made for one organization', () => {
      expect(communityToOpen({ saved: null, signedIn: false, defaultSlug: legacy, openedAt: '/' })).toBeNull();
      expect(communityToOpen({ saved: null, signedIn: false, defaultSlug: forJsh, openedAt: '/' })).toBeNull();
      expect(communityToOpen({ saved: null, signedIn: false, defaultSlug: legacy })).toBeNull();
    });
    it('suggests no organization in the shared app, and JSH in a build made for JSH', () => {
      expect(communityDefaults(undefined).buildCommunity).toBe('');
      expect(communityDefaults('jsh').buildCommunity).toBe('jsh');
    });
    it('still opens JSH for an install that already chose it, whatever the build', () => {
      expect(communityToOpen({ saved: jsh, signedIn: false, defaultSlug: legacy, openedAt: '/' })).toBe('jsh');
      expect(communityToOpen({ saved: jsh, signedIn: true, defaultSlug: legacy, openedAt: '/' })).toBe('jsh');
      expect(communityToOpen({ saved: jsh, signedIn: true, defaultSlug: forJsh, openedAt: '/' })).toBe('jsh');
    });
    it('still opens JSH on jsh.weaverams.org, even for a brand-new visitor', () => {
      const hostSlug = communityFromHost('jsh.weaverams.org', 'weaverams.org');
      expect(hostSlug).toBe('jsh');
      expect(communityToOpen({ saved: null, signedIn: false, defaultSlug: legacy, openedAt: '/', hostSlug })).toBe('jsh');
      expect(communityToOpen({ saved: null, signedIn: false, defaultSlug: forJsh, openedAt: '/', hostSlug })).toBe('jsh');
    });
    it('still opens the build\'s organization for a build with EXPO_PUBLIC_CENTER_SLUG set: signed in already, or on a link into a screen', () => {
      expect(communityToOpen({ saved: null, signedIn: true, defaultSlug: forJsh })).toBe('jsh');
      expect(communityToOpen({ saved: null, signedIn: false, defaultSlug: forJsh, openedAt: '/events/12' })).toBe('jsh');
      const forJcnj = communityDefaults('jcnj').centerSlug;
      expect(communityToOpen({ saved: null, signedIn: true, defaultSlug: forJcnj })).toBe('jcnj');
      expect(communityToOpen({ saved: null, signedIn: false, defaultSlug: forJcnj, openedAt: '/e/12' })).toBe('jcnj');
    });
    it('keeps an old install that was signed in before communities could be chosen in JSH, with no build community named', () => {
      expect(communityToOpen({ saved: null, signedIn: true, defaultSlug: legacy })).toBe('jsh');
      expect(communityToOpen({ saved: null, signedIn: false, defaultSlug: legacy, openedAt: '/events/12' })).toBe('jsh');
    });
    it('shows the list on app.<domain> to a new visitor, with no organization chosen for them', () => {
      expect(communityToOpen({ saved: null, signedIn: false, defaultSlug: legacy, openedAt: '/', pickerHost: true })).toBeNull();
    });
  });

  describe('on the web address (jsh.weaverams.org)', () => {
    it("the address wins over the saved choice, the build default and the signed-in rule", () => {
      expect(communityToOpen({ saved: choice, signedIn: true, defaultSlug: 'jsh', hostSlug: 'austin' })).toBe('austin');
      expect(communityToOpen({ saved: null, signedIn: false, defaultSlug: 'jsh', openedAt: '/', hostSlug: 'austin' })).toBe('austin');
    });
    it('shows the list on app.<domain> for a plain visit or a join link, even for someone who chose before', () => {
      expect(communityToOpen({ saved: choice, signedIn: true, defaultSlug: 'jsh', openedAt: '/', pickerHost: true })).toBeNull();
      expect(communityToOpen({ saved: choice, signedIn: false, defaultSlug: 'jsh', openedAt: '/join/7K4MQ2PD', pickerHost: true })).toBeNull();
    });
    it('still opens a deep link on app.<domain> in the remembered or default community', () => {
      expect(communityToOpen({ saved: choice, signedIn: false, defaultSlug: 'jsh', openedAt: '/e/12', pickerHost: true })).toBe('jcnj');
      expect(communityToOpen({ saved: null, signedIn: false, defaultSlug: 'jsh', openedAt: '/e/12', pickerHost: true })).toBe('jsh');
    });
    it('changes nothing without an address (native apps, a bare IP, localhost)', () => {
      expect(communityToOpen({ saved: choice, signedIn: false, defaultSlug: 'jsh', openedAt: '/', hostSlug: null, pickerHost: false })).toBe('jcnj');
    });
  });
});

describe('addresses on the member domain', () => {
  it('reads the community an address names', () => {
    expect(communityFromHost('jsh.weaverams.org', 'weaverams.org')).toBe('jsh');
    expect(communityFromHost('JSH.Weaverams.org:443', 'weaverams.org')).toBe('jsh');
    expect(communityFromHost('jain-center-austin-sandbox.weaverams.org', 'weaverams.org')).toBe('jain-center-austin-sandbox');
    expect(communityFromHost('jsh.weaverams.org', 'https://WeaverAMS.org/')).toBe('jsh');
  });
  it('names no community for the platform names, the bare domain, deeper names, IPs, other domains or no base domain', () => {
    for (const host of ['app.weaverams.org', 'admin.weaverams.org', 'www.weaverams.org', 'events.weaverams.org', 'weaverams.org', 'a.b.weaverams.org', 'jsh.example.org', '146.190.72.109', 'localhost', '']) {
      expect(communityFromHost(host, 'weaverams.org')).toBeNull();
    }
    expect(communityFromHost('jsh.weaverams.org', '')).toBeNull();
    expect(communityFromHost('jsh.weaverams.org', null)).toBeNull();
    expect(communityFromHost(null, 'weaverams.org')).toBeNull();
    expect(communityFromHost('-bad.weaverams.org', 'weaverams.org')).toBeNull();
  });
  it('knows whether an address is on the member domain', () => {
    expect(onMemberDomain('jsh.weaverams.org', 'weaverams.org')).toBe(true);
    expect(onMemberDomain('app.weaverams.org', 'weaverams.org')).toBe(true);
    expect(onMemberDomain('weaverams.org', 'weaverams.org')).toBe(true);
    expect(onMemberDomain('evilweaverams.org', 'weaverams.org')).toBe(false);
    expect(onMemberDomain('146.190.72.109', 'weaverams.org')).toBe(false);
    expect(onMemberDomain('app.weaverams.org', '')).toBe(false);
  });
  it('normalizes what it is given', () => {
    expect(normalizeHost('https://Jsh.Weaverams.org:8443/join/AB?x=1')).toBe('jsh.weaverams.org');
    expect(normalizeHost('weaverams.org.')).toBe('weaverams.org');
    expect(normalizeHost('  ')).toBeNull();
  });
  it('builds the two addresses', () => {
    expect(communityAddress('jsh', 'weaverams.org')).toBe('https://jsh.weaverams.org/');
    expect(pickerAddress('weaverams.org')).toBe('https://app.weaverams.org/');
    expect(pickerAddress('https://WeaverAMS.org/')).toBe('https://app.weaverams.org/');
  });
  it("sends a choice to the community's own address, only on the member domain and only when it is another one", () => {
    const base = { baseDomain: 'weaverams.org' };
    expect(addressForChoice({ ...base, hostname: 'app.weaverams.org', hostSlug: null, slug: 'jsh' })).toBe('https://jsh.weaverams.org/');
    expect(addressForChoice({ ...base, hostname: 'jsh.weaverams.org', hostSlug: 'jsh', slug: 'austin' })).toBe('https://austin.weaverams.org/');
    expect(addressForChoice({ ...base, hostname: 'jsh.weaverams.org', hostSlug: 'jsh', slug: 'jsh' })).toBeNull();
    expect(addressForChoice({ ...base, hostname: '146.190.72.109', hostSlug: null, slug: 'jsh' })).toBeNull();
    expect(addressForChoice({ ...base, hostname: null, hostSlug: null, slug: 'jsh' })).toBeNull();
    expect(addressForChoice({ baseDomain: '', hostname: 'app.weaverams.org', hostSlug: null, slug: 'jsh' })).toBeNull();
  });
});

describe('pickableCommunities', () => {
  const jsh = { slug: 'jsh', sandbox: true };
  const austin = { slug: 'austin', sandbox: true };
  const live = { slug: 'jcnj', sandbox: false };
  it('lists the sandboxes while no live community exists (owner decision 2026-10-07)', () => {
    expect(pickableCommunities([jsh, austin]).map((c) => c.slug)).toEqual(['jsh', 'austin']);
    expect(pickableCommunities([jsh]).map((c) => c.slug)).toEqual(['jsh']);
  });
  it('goes back to live communities only, by itself, once one exists', () => {
    expect(pickableCommunities([jsh, live, austin]).map((c) => c.slug)).toEqual(['jcnj']);
  });
  it('lists nothing when there is nothing', () => {
    expect(pickableCommunities([])).toEqual([]);
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

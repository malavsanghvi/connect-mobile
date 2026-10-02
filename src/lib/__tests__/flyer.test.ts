import { describe, expect, it } from '@jest/globals';

import { FLYER_RESIGN_AFTER_MS, flyerFileName, flyerLinkCommunity, flyerLinkPath, flyerLinkTarget, flyerMimeType, isExpiredLinkError, isUuid, needsResign } from '../flyer';

const ID = '6f1c2b9e-3d4a-4b8c-9e0f-1a2b3c4d5e6f';

describe('flyerFileName', () => {
  it('slugs the event name and keeps the stored extension', () => {
    expect(flyerFileName('Diwali Mela', 'c1/events/e1/flyer-1727800000000.png')).toBe('diwali-mela-flyer.png');
    expect(flyerFileName('  Paryushan Parva 2026!  ', 'content/c1/events/e1/flyer-1-poster.JPG')).toBe('paryushan-parva-2026-flyer.jpg');
    expect(flyerFileName('Mahavir Jayanti', 'c1/events/e1/flyer-1-a.jpeg')).toBe('mahavir-jayanti-flyer.jpeg');
    expect(flyerFileName('Café Night', 'c1/events/e1/flyer-1-a.webp')).toBe('cafe-night-flyer.webp');
  });
  it('reads the extension before a query string (a legacy https flyer)', () => {
    expect(flyerFileName('Navkar Jaap', 'https://example.org/flyers/navkar.webp?v=3')).toBe('navkar-jaap-flyer.webp');
    expect(flyerFileName('Navkar Jaap', 'https://example.org/flyers/navkar.jpg#top')).toBe('navkar-jaap-flyer.jpg');
  });
  it('defaults to png for no extension or one that is not an image', () => {
    expect(flyerFileName('Samvatsari', 'https://example.org/flyer')).toBe('samvatsari-flyer.png');
    expect(flyerFileName('Samvatsari', 'c1/events/e1/flyer.pdf')).toBe('samvatsari-flyer.png');
    expect(flyerFileName('Samvatsari', null)).toBe('samvatsari-flyer.png');
  });
  it('falls back to "event" when the name has no Latin letters or digits', () => {
    expect(flyerFileName('દિવાળી', 'a.png')).toBe('event-flyer.png');
    expect(flyerFileName('', 'a.png')).toBe('event-flyer.png');
    expect(flyerFileName(null, 'a.png')).toBe('event-flyer.png');
  });
  it('keeps long names to a readable length', () => {
    const name = flyerFileName('a'.repeat(59) + ' bcd', 'x.png');
    expect(name).toBe(`${'a'.repeat(59)}-flyer.png`);
  });
});

describe('flyerMimeType', () => {
  it('maps each extension and defaults to png', () => {
    expect(flyerMimeType('diwali-flyer.png')).toBe('image/png');
    expect(flyerMimeType('diwali-flyer.jpg')).toBe('image/jpeg');
    expect(flyerMimeType('diwali-flyer.jpeg')).toBe('image/jpeg');
    expect(flyerMimeType('diwali-flyer.JPG')).toBe('image/jpeg');
    expect(flyerMimeType('diwali-flyer.webp')).toBe('image/webp');
    expect(flyerMimeType('diwali-flyer')).toBe('image/png');
  });
});

describe('isUuid', () => {
  it('accepts uuids in either case and nothing else', () => {
    expect(isUuid(ID)).toBe(true);
    expect(isUuid(ID.toUpperCase())).toBe(true);
    expect(isUuid('not-a-uuid')).toBe(false);
    expect(isUuid(`${ID}x`)).toBe(false);
    expect(isUuid('')).toBe(false);
    expect(isUuid(undefined)).toBe(false);
    expect(isUuid(42)).toBe(false);
  });
});

describe('flyerLinkTarget', () => {
  const out = { signedIn: false, linked: false, onboarding: false };
  const linked = { signedIn: true, linked: true, onboarding: false };

  it('a signed-out visitor browses the event as a guest', () => {
    expect(flyerLinkTarget(out, ID)).toEqual({ guest: true, href: `/event/${ID}` });
    expect(flyerLinkTarget({ ...out, guest: true }, ID)).toEqual({ guest: true, href: `/event/${ID}` });
  });
  it('a signed-in account without a family goes to family matching, never past it', () => {
    expect(flyerLinkTarget({ signedIn: true, linked: false, onboarding: false }, ID)).toEqual({ guest: false, href: '/family-match' });
  });
  it('a member still onboarding goes back to onboarding', () => {
    expect(flyerLinkTarget({ signedIn: true, linked: true, onboarding: true }, ID)).toEqual({ guest: false, href: '/family-match' });
  });
  it('a linked member opens the event', () => {
    expect(flyerLinkTarget(linked, ID)).toEqual({ guest: false, href: `/event/${ID}` });
    expect(flyerLinkTarget(linked, ID.toUpperCase())).toEqual({ guest: false, href: `/event/${ID}` });
  });
  it('an invalid id never enters guest mode and goes to the start screen', () => {
    expect(flyerLinkTarget(linked, 'abc')).toEqual({ guest: false, href: '/' });
    expect(flyerLinkTarget(linked, undefined)).toEqual({ guest: false, href: '/' });
    expect(flyerLinkTarget(out, `${ID}/../x`)).toEqual({ guest: false, href: '/welcome' });
    expect(flyerLinkTarget({ ...out, guest: true }, 'abc')).toEqual({ guest: false, href: '/' });
    expect(flyerLinkTarget({ signedIn: true, linked: false, onboarding: false }, 'abc')).toEqual({ guest: false, href: '/family-match' });
  });
});

describe('flyerLinkCommunity', () => {
  it("reads the community's web name from ?c=", () => {
    expect(flyerLinkCommunity('jsh-houston')).toBe('jsh-houston');
    expect(flyerLinkCommunity('  JSH-Houston ')).toBe('jsh-houston');
    expect(flyerLinkCommunity(['jsh', 'other'])).toBe('jsh');
  });
  it('ignores a missing or malformed name', () => {
    expect(flyerLinkCommunity(undefined)).toBeNull();
    expect(flyerLinkCommunity('')).toBeNull();
    expect(flyerLinkCommunity('-jsh')).toBeNull();
    expect(flyerLinkCommunity('jsh/../x')).toBeNull();
    expect(flyerLinkCommunity('a'.repeat(64))).toBeNull();
    expect(flyerLinkCommunity([])).toBeNull();
    expect(flyerLinkCommunity(7)).toBeNull();
  });
});

describe('flyerLinkPath', () => {
  it('names the community the link switched to, which flyerLinkCommunity reads back', () => {
    expect(flyerLinkPath(ID.toUpperCase(), 'jsh-houston')).toBe(`/e/${ID}?c=jsh-houston`);
    const c = new URLSearchParams(flyerLinkPath(ID, 'jsh-houston').split('?')[1]).get('c');
    expect(flyerLinkCommunity(c)).toBe('jsh-houston');
  });
  it('escapes a name that would break the query', () => {
    expect(flyerLinkPath(ID, 'a&b c')).toBe(`/e/${ID}?c=a%26b%20c`);
  });
});

describe('needsResign', () => {
  it('re-signs after 50 minutes', () => {
    const at = 1_000_000;
    expect(needsResign(at, at)).toBe(false);
    expect(needsResign(at, at + FLYER_RESIGN_AFTER_MS - 1)).toBe(false);
    expect(needsResign(at, at + FLYER_RESIGN_AFTER_MS)).toBe(true);
    expect(needsResign(at, at + 2 * 3600 * 1000)).toBe(true);
    expect(needsResign(Number.NaN, at)).toBe(true);
  });
});

describe('isExpiredLinkError', () => {
  it('spots a refused or expired signed link from each platform', () => {
    expect(isExpiredLinkError({ userMessage: 'x', detail: 'HTTP 400' })).toBe(true);
    expect(isExpiredLinkError({ detail: 'HTTP 403' })).toBe(true);
    expect(isExpiredLinkError({ detail: 'Unable to download a file: response has status: 400' })).toBe(true);
    expect(isExpiredLinkError({ detail: 'response has status 403' })).toBe(true);
    expect(isExpiredLinkError(new Error('server returned HTTP 403'))).toBe(true);
  });
  it('ignores other failures', () => {
    expect(isExpiredLinkError({ detail: 'HTTP 404' })).toBe(false);
    expect(isExpiredLinkError({ detail: 'HTTP 500' })).toBe(false);
    expect(isExpiredLinkError({ detail: 'Network request failed' })).toBe(false);
    expect(isExpiredLinkError({ detail: 'navigator.share(files) unavailable' })).toBe(false);
    expect(isExpiredLinkError(null)).toBe(false);
    expect(isExpiredLinkError('HTTP 403')).toBe(false);
  });
});

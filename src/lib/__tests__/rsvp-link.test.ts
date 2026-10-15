import { describe, expect, it } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';

import { screenHeaderValue, traceHeaders } from '../request-context';
import { auditScreenName, isRsvpLinkPath, isRsvpToken } from '../rsvp-link';

// The link in the confirmation email of an RSVP made without signing in (connect-crm docs/RSVP_WITHOUT_LOGIN.md): /rsvp/<token>.
// The token is a secret, so it must not travel anywhere but to the one function that needs it.

const TOKEN = 'Zk3-_abcdefghijklmnopqrstuvwxy12'.slice(0, 32);

describe('the link', () => {
  it('is any path under /rsvp', () => {
    expect(isRsvpLinkPath(`/rsvp/${TOKEN}`)).toBe(true);
    expect(isRsvpLinkPath('/rsvp/')).toBe(true);
    expect(isRsvpLinkPath('/rsvp')).toBe(true);
  });

  it('is not any other screen, however much it looks like it', () => {
    for (const p of ['/', '/event/e1', '/e/abc', '/join/ABC123', '/rsvps', '/my/rsvp/x', '/events/rsvp', '', null, undefined]) expect([p, isRsvpLinkPath(p)]).toEqual([p, false]);
  });

  it('holds a token only when it is 32 letters, digits, - and _ (so nothing else is sent to the database)', () => {
    expect(TOKEN).toHaveLength(32);
    expect(isRsvpToken(TOKEN)).toBe(true);
    for (const bad of ['', 'abc', `${TOKEN}x`, TOKEN.slice(0, 31), `${TOKEN.slice(0, 31)}!`, `${TOKEN.slice(0, 31)} `, null, undefined, 42]) expect([bad, isRsvpToken(bad)]).toEqual([bad, false]);
  });
});

describe('the audit trail', () => {
  it('records the route of the page, never the token in the link', () => {
    expect(auditScreenName(`/rsvp/${TOKEN}`)).toBe('/rsvp/[token]');
    expect(auditScreenName('/rsvp/short')).toBe('/rsvp/[token]');
    const header = screenHeaderValue(auditScreenName(`/rsvp/${TOKEN}`));
    expect(header).toBe('/rsvp/%5Btoken%5D');
    expect(header).not.toContain(TOKEN);
  });

  it('puts no token into the headers of a request made from that page', () => {
    const headers = traceHeaders({ app: 'member', screen: auditScreenName(`/rsvp/${TOKEN}`) }, 'req-1');
    expect(JSON.stringify(headers)).not.toContain(TOKEN);
  });

  it('leaves every other screen as it is', () => {
    for (const p of ['/', '/events', '/event/8f0c1a2e-1111-4b6a-9d7e-3f2a6b5c4d3e', '/e/abc']) expect(auditScreenName(p)).toBe(p);
  });
});

describe('the root layout', () => {
  const layout = fs.readFileSync(path.join(__dirname, '..', '..', 'app', '_layout.tsx'), 'utf8');

  it('records the audit screen name, not the pathname, and keeps the link page outside the community choice and the sign-in guards', () => {
    expect(layout).toContain('setClientScreen(auditScreenName(pathname))');
    expect(layout).not.toMatch(/setClientScreen\(pathname\)/);
    // the link page is decided before anything that asks for a community, a session or a lock
    const link = layout.indexOf('isRsvpLinkPath(pathname)');
    expect(link).toBeGreaterThan(-1);
    expect(link).toBeLessThan(layout.indexOf('app.needsCommunity'));
    expect(link).toBeLessThan(layout.indexOf('<BiometricGate'));
    expect(layout).toContain('<Stack.Screen name="rsvp/[token]" />');
  });

  it('has the route file where the link opens', () => {
    expect(fs.existsSync(path.join(__dirname, '..', '..', 'app', 'rsvp', '[token].tsx'))).toBe(true);
  });
});

import { describe, expect, it } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';

import { createScreenTracker, ID_PLACEHOLDER, isScreenKey, routePattern, screenKey, type ScreenVisit } from '../activity-routes';

describe('route to pattern: no id survives', () => {
  it('turns a route into its file-path pattern, without groups', () => {
    expect(routePattern(['(app)', 'event', '[id]'])).toBe('/event/[id]');
    expect(routePattern(['(app)', 'event', '[id]', 'confirm'])).toBe('/event/[id]/confirm');
    expect(routePattern(['(app)', 'gyan', '[goalId]', 'level', '[levelId]'])).toBe('/gyan/[goalId]/level/[levelId]');
    expect(routePattern(['(app)', '(tabs)', 'give'])).toBe('/give');
    expect(routePattern(['e', '[id]'])).toBe('/e/[id]');
  });

  it('is the root for the home tab and while nothing is mounted yet', () => {
    expect(routePattern(['(app)', '(tabs)', 'index'])).toBe('/');
    expect(routePattern([])).toBe('/');
  });

  it('keeps the not-found screen', () => {
    expect(routePattern(['+not-found'])).toBe('/+not-found');
  });

  it('replaces anything that is not a plain word or a [param] with [id], whatever it is', () => {
    const real = [
      '8f0c1a2e-1111-4b6a-9d7e-3f2a6b5c4d3e', // a uuid
      '12345', // a number
      'John Smith', // a name
      'john-smith-2', // a name with a digit
      'JSH2026', // a code
      'abc?token=secret', // a query string stuck to a segment
      'x#frag',
      '%E0%AA%97', // an encoded name
      'a'.repeat(80), // too long to be a route
    ];
    for (const segment of real) {
      const pattern = routePattern(['(app)', 'person', segment, 'edit']);
      expect(pattern).toBe(`/person/${ID_PLACEHOLDER}/edit`);
      expect(pattern).not.toContain(segment);
      expect(pattern).not.toMatch(/[?#=%\d]/);
    }
  });

  it('never lets a query string or a hash into the pattern', () => {
    expect(routePattern(['event?x=1'])).toBe('/[id]');
    expect(routePattern(['event', '[id]?x=1'])).toBe('/event/[id]');
    expect(routePattern(['event', '[id]#top'])).toBe('/event/[id]');
  });

  it('makes a screen key that passes the screen-key check, and only those', () => {
    expect(screenKey('/event/[id]')).toBe('screen:/event/[id]');
    expect(isScreenKey('screen:/event/[id]')).toBe(true);
    expect(isScreenKey('screen:/')).toBe(true);
    expect(isScreenKey('screen:/event/8f0c1a2e-1111-4b6a-9d7e-3f2a6b5c4d3e')).toBe(false);
    expect(isScreenKey('screen:/event/123')).toBe(false);
    expect(isScreenKey('screen:/event/[id]?x=1')).toBe(false);
    expect(isScreenKey('screen:/person/John Smith')).toBe(false);
    expect(isScreenKey('rsvp_started')).toBe(false);
  });

  it('keeps every route of the app as written (a route named with a digit or capital would be recorded as [id]; rename it or extend the pattern on purpose)', () => {
    const root = path.join(__dirname, '..', '..', 'app');
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.tsx?$/.test(entry.name)) files.push(path.relative(root, full).split(path.sep).join('/'));
      }
    };
    walk(root);
    const routes = files.filter((f) => !/(^|\/)_layout\.tsx?$/.test(f) && !f.includes('+not-found') && !f.endsWith('.d.ts'));
    expect(routes.length).toBeGreaterThan(40);
    for (const file of routes) {
      const segments = file.replace(/\.tsx?$/, '').split('/');
      const expected = `/${segments.filter((s) => !/^\(.*\)$/.test(s) && s !== 'index').join('/')}`;
      expect(routePattern(segments)).toBe(expected);
      expect(isScreenKey(screenKey(routePattern(segments)))).toBe(true);
    }
  });
});

function harness(recording = true) {
  let clock = 1_000_000;
  const log: string[] = [];
  const tracker = createScreenTracker({
    now: () => clock,
    begin: (key) => {
      if (!recording) return null;
      log.push(`begin ${key}`);
      const visit: ScreenVisit = { end: (ms) => log.push(`end ${key} ${ms}`) };
      return visit;
    },
  });
  return { tracker, log, advance: (ms: number) => (clock += ms) };
}

describe('how long a screen is visible', () => {
  it('starts a visit for the screen and ends it with the time it was in view when the person moves on', () => {
    const h = harness();
    h.tracker.show('/events');
    h.advance(5_000);
    h.tracker.show('/event/[id]');
    h.advance(2_000);
    h.tracker.stop();
    expect(h.log).toEqual(['begin screen:/events', 'end screen:/events 5000', 'begin screen:/event/[id]', 'end screen:/event/[id] 2000']);
  });

  it('does not start a second visit for the same screen', () => {
    const h = harness();
    h.tracker.show('/events');
    h.advance(1_000);
    h.tracker.show('/events');
    expect(h.log).toEqual(['begin screen:/events']);
  });

  it('closes the visit when the app goes to the background, does not count the time away, and starts a new visit on return', () => {
    const h = harness();
    h.tracker.show('/give');
    h.advance(4_000);
    h.tracker.background();
    h.advance(600_000);
    h.tracker.background();
    h.tracker.foreground();
    h.advance(3_000);
    h.tracker.stop();
    expect(h.log).toEqual(['begin screen:/give', 'end screen:/give 4000', 'begin screen:/give', 'end screen:/give 3000']);
  });

  it('ignores a screen change while the app is in the background and starts the new screen on return', () => {
    const h = harness();
    h.tracker.show('/give');
    h.tracker.background();
    h.tracker.show('/events');
    expect(h.log).toEqual(['begin screen:/give', 'end screen:/give 0']);
    h.tracker.foreground();
    expect(h.log[h.log.length - 1]).toBe('begin screen:/events');
  });

  it('does nothing while nothing is recorded, and picks the screen up once recording starts', () => {
    const quiet = harness(false);
    quiet.tracker.show('/events');
    quiet.advance(1_000);
    quiet.tracker.show('/give');
    quiet.tracker.background();
    quiet.tracker.foreground();
    quiet.tracker.stop();
    expect(quiet.log).toEqual([]);

    let recording = false;
    const log: string[] = [];
    const tracker = createScreenTracker({
      now: () => 0,
      begin: (key) => {
        if (!recording) return null;
        log.push(`begin ${key}`);
        return { end: () => undefined };
      },
    });
    tracker.show('/');
    tracker.retry();
    expect(log).toEqual([]);
    recording = true;
    tracker.retry();
    tracker.retry();
    expect(log).toEqual(['begin screen:/']);
  });
});

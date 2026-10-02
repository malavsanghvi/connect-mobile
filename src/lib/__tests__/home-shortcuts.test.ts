import { describe, expect, it } from '@jest/globals';

import { configuredShortcuts, HOME_SHORTCUT_KEYS, HOME_SHORTCUT_MODULE, homeShortcuts, isHomeShortcut, shortcutColumns } from '../home-shortcuts';
import { ALL_ON, isModuleKey, MODULE_KEYS, type ModuleMap } from '../modules';

const off = (...keys: (typeof MODULE_KEYS)[number][]): ModuleMap => Object.fromEntries(keys.map((k) => [k, false]));
const DEFAULT = ['learn', 'playlist', 'photos', 'recipe', 'podcast', 'guide'];

describe('configuredShortcuts (centers.rules.home.shortcuts)', () => {
  it('shows all six in the default order when the community has not chosen', () => {
    expect(configuredShortcuts(null)).toEqual(DEFAULT);
    expect(configuredShortcuts({})).toEqual(DEFAULT);
    expect(configuredShortcuts({ home: {} })).toEqual(DEFAULT);
    expect(configuredShortcuts({ home: { shortcuts: 'learn' } })).toEqual(DEFAULT);
    expect(configuredShortcuts({ home: [] })).toEqual(DEFAULT);
    expect(configuredShortcuts('junk')).toEqual(DEFAULT);
  });
  it('an empty list means no strip', () => {
    expect(configuredShortcuts({ home: { shortcuts: [] } })).toEqual([]);
  });
  it("keeps the community's order", () => {
    expect(configuredShortcuts({ home: { shortcuts: ['recipe', 'learn'] } })).toEqual(['recipe', 'learn']);
  });
  it('ignores unknown keys and repeats; tolerates case and spaces', () => {
    expect(configuredShortcuts({ home: { shortcuts: ['podcast', 'radio', 7, null, 'Podcast', ' photos '] } })).toEqual(['podcast', 'photos']);
    expect(configuredShortcuts({ home: { shortcuts: ['constructor', 'toString'] } })).toEqual([]);
  });
  it('returns a fresh list each time', () => {
    const a = configuredShortcuts(null);
    a.pop();
    expect(configuredShortcuts(null)).toEqual(DEFAULT);
  });
});

describe('homeShortcuts', () => {
  it('maps every shortcut to a real module or none (learn = gyan_path, the media ones = content, the welcome guide = always)', () => {
    expect(HOME_SHORTCUT_KEYS).toEqual(DEFAULT);
    for (const key of HOME_SHORTCUT_KEYS) {
      const m = HOME_SHORTCUT_MODULE[key];
      expect(m === null || isModuleKey(m)).toBe(true);
    }
    expect(HOME_SHORTCUT_MODULE.learn).toBe('gyan_path');
    expect(HOME_SHORTCUT_MODULE.guide).toBeNull();
  });
  it('shows everything when every module is on', () => {
    expect(homeShortcuts(null, ALL_ON)).toEqual(DEFAULT);
  });
  it('hides a shortcut whose module is off', () => {
    expect(homeShortcuts(null, off('gyan_path'))).toEqual(['playlist', 'photos', 'recipe', 'podcast', 'guide']);
    expect(homeShortcuts(null, off('content'))).toEqual(['learn', 'guide']);
    expect(homeShortcuts({ home: { shortcuts: ['recipe', 'learn'] } }, off('content'))).toEqual(['learn']);
    expect(homeShortcuts(null, off('content', 'gyan_path'))).toEqual(['guide']);
  });
  it('the welcome guide stays when every module is off', () => {
    expect(homeShortcuts({ home: { shortcuts: ['guide'] } }, off(...MODULE_KEYS))).toEqual(['guide']);
  });
  it('isHomeShortcut', () => {
    expect(isHomeShortcut('photos')).toBe(true);
    expect(isHomeShortcut('Photos')).toBe(false);
    expect(isHomeShortcut(undefined)).toBe(false);
  });
});

describe('shortcutColumns (the Home grid, as wide as the cards)', () => {
  it('puts 3 on a row on phones and on the web (a phone-width frame)', () => {
    expect(shortcutColumns(280)).toBe(3); // 320 wide phone
    expect(shortcutColumns(335)).toBe(3); // 375
    expect(shortcutColumns(390)).toBe(3); // 430, the largest phones
    expect(shortcutColumns(440)).toBe(3); // the web frame (480)
  });
  it('puts more on a row on wider screens, up to 6', () => {
    expect(shortcutColumns(480)).toBe(4);
    expect(shortcutColumns(550)).toBe(5);
    expect(shortcutColumns(600)).toBe(6); // tablet: 640 content inside the gutters
    expect(shortcutColumns(2000)).toBe(6);
  });
  it('a larger text size counts as a narrower screen', () => {
    expect(shortcutColumns(600, 1.15)).toBe(4);
    expect(shortcutColumns(600, 1.3)).toBe(4);
    expect(shortcutColumns(440, 1.3)).toBe(3);
    expect(shortcutColumns(600, 0.5)).toBe(6); // never wider than the standard size
  });
  it('never has more columns than shortcuts', () => {
    expect(shortcutColumns(600, 1, 4)).toBe(4);
    expect(shortcutColumns(335, 1, 2)).toBe(2);
    expect(shortcutColumns(335, 1, 1)).toBe(1);
    expect(shortcutColumns(335, 1, 6)).toBe(3);
  });
  it('falls back to 3 before the grid is measured or with junk input', () => {
    expect(shortcutColumns(0)).toBe(3);
    expect(shortcutColumns(Number.NaN)).toBe(3);
    expect(shortcutColumns(-50)).toBe(3);
    expect(shortcutColumns(600, Number.NaN)).toBe(6);
    expect(shortcutColumns(600, 1, 0)).toBe(6);
  });
});

import { describe, expect, it } from '@jest/globals';

import { configuredShortcuts, HOME_SHORTCUT_KEYS, HOME_SHORTCUT_MODULE, homeShortcuts, isHomeShortcut } from '../home-shortcuts';
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

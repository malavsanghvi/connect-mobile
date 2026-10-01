import { describe, expect, it } from '@jest/globals';

import { configuredShortcuts, HOME_SHORTCUT_KEYS, HOME_SHORTCUT_MODULE, homeShortcuts, isHomeShortcut } from '../home-shortcuts';
import { ALL_ON, isModuleKey, MODULE_KEYS, type ModuleMap } from '../modules';

const off = (...keys: (typeof MODULE_KEYS)[number][]): ModuleMap => Object.fromEntries(keys.map((k) => [k, false]));
const DEFAULT = ['learn', 'playlist', 'photos', 'recipe', 'podcast'];

describe('configuredShortcuts (centers.rules.home.shortcuts)', () => {
  it('shows all five in the default order when the community has not chosen', () => {
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
  it('maps every shortcut to a real module (learn = gyan_path, the rest = content)', () => {
    expect(HOME_SHORTCUT_KEYS).toEqual(DEFAULT);
    for (const key of HOME_SHORTCUT_KEYS) expect(isModuleKey(HOME_SHORTCUT_MODULE[key])).toBe(true);
    expect(HOME_SHORTCUT_MODULE.learn).toBe('gyan_path');
  });
  it('shows everything when every module is on', () => {
    expect(homeShortcuts(null, ALL_ON)).toEqual(DEFAULT);
  });
  it('hides a shortcut whose module is off', () => {
    expect(homeShortcuts(null, off('gyan_path'))).toEqual(['playlist', 'photos', 'recipe', 'podcast']);
    expect(homeShortcuts(null, off('content'))).toEqual(['learn']);
    expect(homeShortcuts({ home: { shortcuts: ['recipe', 'learn'] } }, off('content'))).toEqual(['learn']);
    expect(homeShortcuts(null, off('content', 'gyan_path'))).toEqual([]);
  });
  it('isHomeShortcut', () => {
    expect(isHomeShortcut('photos')).toBe(true);
    expect(isHomeShortcut('Photos')).toBe(false);
    expect(isHomeShortcut(undefined)).toBe(false);
  });
});

import { describe, expect, it } from '@jest/globals';

import { configuredShortcuts, HOME_SHORTCUT_KEYS, isHomeShortcut } from '../home-shortcuts';

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
  it('an empty list means none', () => {
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

describe('isHomeShortcut', () => {
  it('knows the six keys, exactly as spelled', () => {
    expect(HOME_SHORTCUT_KEYS).toEqual(DEFAULT);
    expect(isHomeShortcut('photos')).toBe(true);
    expect(isHomeShortcut('Photos')).toBe(false);
    expect(isHomeShortcut(undefined)).toBe(false);
  });
});

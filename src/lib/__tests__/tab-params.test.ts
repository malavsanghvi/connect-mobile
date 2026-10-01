import { describe, expect, it } from '@jest/globals';

import { clearedPaneParams, hasPaneParams, PANE_PARAM_KEYS } from '../tab-params';

describe('clearedPaneParams', () => {
  it('names every pane param and leaves each undefined, so navigate() clears them whether it replaces or merges', () => {
    const cleared = clearedPaneParams();
    expect(Object.keys(cleared).sort()).toEqual([...PANE_PARAM_KEYS].sort());
    for (const k of PANE_PARAM_KEYS) expect(cleared[k]).toBeUndefined();
    // merging the old params with the cleared ones leaves no pane set
    const merged = { ...{ view: 'photos', tab: 'library', other: 'keep' }, ...cleared } as Record<string, unknown>;
    expect(merged.view).toBeUndefined();
    expect(merged.tab).toBeUndefined();
    expect(merged.other).toBe('keep');
  });
  it('covers the Events view and the My Jain Way tab and section', () => {
    expect(PANE_PARAM_KEYS).toEqual(['view', 'tab', 'section']);
  });
});

describe('hasPaneParams', () => {
  it('is true when the route carries a pane (Events on Photos, My Jain Way on Library)', () => {
    expect(hasPaneParams({ view: 'photos' })).toBe(true);
    expect(hasPaneParams({ tab: 'three_l', section: 'listen' })).toBe(true);
  });
  it('is false with no params, empty values or unrelated params', () => {
    expect(hasPaneParams(undefined)).toBe(false);
    expect(hasPaneParams(null)).toBe(false);
    expect(hasPaneParams({})).toBe(false);
    expect(hasPaneParams({ view: undefined, tab: '' })).toBe(false);
    expect(hasPaneParams({ autoplay: '1' })).toBe(false);
  });
});

import { describe, expect, it } from '@jest/globals';

import { ALL_ON, type ModuleMap } from '../modules';
import { barItems, TABS } from '../nav-bar';

describe('barItems (what the bottom bar holds)', () => {
  it('is the five tabs, then Niva as the sixth, when everything is on and the person may use Ask Niva', () => {
    expect(barItems(ALL_ON, true)).toEqual(['index', 'events', 'give', 'jain-way', 'family', 'niva']);
    expect(barItems(ALL_ON, true)).toHaveLength(6);
  });

  it('has no Niva for someone who may not use Ask Niva (a visitor, or below the level the community asks for)', () => {
    expect(barItems(ALL_ON, false)).toEqual([...TABS]);
  });

  it('keeps Niva last whatever else is left out', () => {
    const noGive: ModuleMap = { giving: false, bolis: false };
    expect(barItems(noGive, true)).toEqual(['index', 'events', 'jain-way', 'family', 'niva']);
    const noJainWay: ModuleMap = { jain_way: false, gyan_path: false, pathshala: false, content: false };
    const items = barItems(noJainWay, true);
    expect(items).not.toContain('jain-way');
    expect(items[items.length - 1]).toBe('niva');
  });

  it('is only Home, Family and Niva when the community switched everything else off', () => {
    const off: ModuleMap = { events: false, calendar: false, content: false, giving: false, bolis: false, jain_way: false, gyan_path: false, pathshala: false };
    expect(barItems(off, true)).toEqual(['index', 'family', 'niva']);
  });
});

describe('barItems for a kind of organization with no fourth tab', () => {
  it('leaves "jain-way" out even though its library module is on, and keeps Niva last', () => {
    expect(barItems(ALL_ON, true, false)).toEqual(['index', 'events', 'give', 'family', 'niva']);
    expect(barItems(ALL_ON, false, false)).toEqual(['index', 'events', 'give', 'family']);
  });

  it('keeps the original five tabs when the kind has a practice tab (the default)', () => {
    expect(barItems(ALL_ON, false, true)).toEqual([...TABS]);
    expect(barItems(ALL_ON, false)).toEqual([...TABS]);
  });
});

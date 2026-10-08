import { describe, expect, it } from '@jest/globals';

import { createHandoff } from '../handoff';

describe('createHandoff', () => {
  it('starts empty', () => {
    const h = createHandoff<string>();
    expect(h.peek()).toBeNull();
    expect(h.take()).toBeNull();
  });

  it('hands a value over once: take returns it and clears it', () => {
    const h = createHandoff<{ eventId: string }>();
    h.set({ eventId: 'e1' });
    expect(h.peek()).toEqual({ eventId: 'e1' });
    expect(h.take()).toEqual({ eventId: 'e1' });
    expect(h.take()).toBeNull();
    expect(h.peek()).toBeNull();
  });

  it('peek does not use the value up', () => {
    const h = createHandoff<string>();
    h.set('/darshan');
    expect(h.peek()).toBe('/darshan');
    expect(h.peek()).toBe('/darshan');
    expect(h.take()).toBe('/darshan');
  });

  it('a newer value replaces an older one, and null clears it', () => {
    const h = createHandoff<string>();
    h.set('/darshan');
    h.set('/puja');
    expect(h.take()).toBe('/puja');
    h.set('/darshan');
    h.set(null);
    expect(h.take()).toBeNull();
  });

  it('keeps separate handoffs apart', () => {
    const a = createHandoff<string>();
    const b = createHandoff<string>();
    a.set('a');
    expect(b.take()).toBeNull();
    expect(a.take()).toBe('a');
  });
});

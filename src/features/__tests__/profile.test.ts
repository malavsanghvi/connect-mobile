import { describe, expect, it } from '@jest/globals';

import { planEmailChanges } from '../../lib/emails';
import { normalizeInterests, relationshipChanged, toggle } from '../profile';

describe('profile helpers', () => {
  it('plans person_emails changes against the primary address', () => {
    const existing = [
      { id: '1', email: 'priya@work.example', label: 'work' },
      { id: '2', email: 'old@example.com', label: 'other' },
      { id: '3', email: 'p@example.com', label: 'primary' },
    ];
    const plan = planEmailChanges(
      existing,
      [
        { id: '1', email: 'Priya@Work.example ', label: 'other' },
        { id: null, email: 'new@example.com', label: 'work' },
        { id: null, email: 'p@example.com', label: 'work' },
        { id: null, email: '', label: 'work' },
      ],
      'p@example.com',
    );
    expect(plan).toEqual({ insert: [{ email: 'new@example.com', label: 'work' }], relabel: [{ id: '1', label: 'other' }], remove: ['2'] });
  });

  it('rejects an address that is not an email', () => {
    expect(() => planEmailChanges([], [{ id: null, email: 'not-an-email', label: 'work' }], null)).toThrow('does not look like an email address');
  });

  it('keeps interests to the known keys in order', () => {
    expect(normalizeInterests(['giving', 'Events', 'unknown'])).toEqual(['events', 'giving']);
    expect(toggle(['a'], 'a')).toEqual([]);
    expect(toggle(['a'], 'b')).toEqual(['a', 'b']);
  });

  it('notices a changed relationship only when something was typed', () => {
    expect(relationshipChanged('Child', ' child ')).toBe(false);
    expect(relationshipChanged('Child', 'Daughter')).toBe(true);
    expect(relationshipChanged('Child', '  ')).toBe(false);
  });
});

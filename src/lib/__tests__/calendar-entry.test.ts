import { describe, expect, it } from '@jest/globals';

import { entryDetails } from '../calendar-entry';

describe('calendar entry details', () => {
  it('reads the second line, notes and a secure link from a subscribed entry', () => {
    expect(entryDetails({ source: 'feed', sub: '9:20 AM – 10:00 AM', notes: 'Meeting ID: 343 341 0593', link: 'https://bit.ly/jshzoom' })).toEqual({
      sub: '9:20 AM – 10:00 AM',
      notes: 'Meeting ID: 343 341 0593',
      link: 'https://bit.ly/jshzoom',
    });
  });
  it('ignores missing values and links that are not https', () => {
    expect(entryDetails(null)).toEqual({ sub: null, notes: null, link: null });
    expect(entryDetails({ sub: ' ', link: 'javascript:alert(1)' })).toEqual({ sub: null, notes: null, link: null });
    expect(entryDetails({ link: 'http://example.com/zoom' }).link).toBeNull();
  });
});

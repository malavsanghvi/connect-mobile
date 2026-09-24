import { describe, expect, it, jest } from '@jest/globals';

jest.mock('../supabase', () => ({ supabase: {} }));
jest.mock('../storage', () => ({ readPref: async () => [], writePref: async () => undefined }));

import { parseQuestions } from '../api/surveys';

describe('survey questions', () => {
  it('reads likert / scale questions as a five-point Poor–Superb scale', () => {
    const qs = parseQuestions([
      { id: 'food', type: 'likert', label: 'Food and bhojanshala' },
      { id: 'venue', type: 'scale', label: 'Venue and parking', options: ['Bad', 'OK', 'Good'] },
      { id: 'overall', type: 'stars', label: 'Overall, how was it?', required: true },
    ]);
    expect(qs[0]).toMatchObject({ type: 'likert', options: ['Poor', 'Fair', 'Good', 'Great', 'Superb'] });
    expect(qs[1]).toMatchObject({ type: 'likert', options: ['Bad', 'OK', 'Good'] });
    expect(qs[2]).toMatchObject({ type: 'rating', required: true });
  });
});

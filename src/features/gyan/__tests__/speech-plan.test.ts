import { describe, expect, it } from '@jest/globals';

import { speechPlan } from '../speech-plan';

const VERSE = { text: 'नमो अरिहंताणं', translit: 'Namo Arihantanam' };

describe('speechPlan', () => {
  it('reads the script with a Hindi voice, the transliteration as a fallback', () => {
    expect(speechPlan(VERSE, 'hi-IN', ['en-US', 'hi_IN'])).toEqual([
      { text: 'नमो अरिहंताणं', language: 'hi-IN' },
      { text: 'Namo Arihantanam', language: undefined },
    ]);
  });
  it('reads the transliteration with Indian English when there is no Hindi voice', () => {
    expect(speechPlan(VERSE, 'hi-IN', ['en-US', 'en-IN'])).toEqual([{ text: 'Namo Arihantanam', language: 'en-IN' }]);
    expect(speechPlan(VERSE, 'hi-IN', ['en-GB'])).toEqual([{ text: 'Namo Arihantanam', language: undefined }]);
  });
  it('tries the script first when the phone lists no voices', () => {
    expect(speechPlan(VERSE, 'hi-IN', [])).toEqual([
      { text: 'नमो अरिहंताणं', language: 'hi-IN' },
      { text: 'Namo Arihantanam', language: 'en-IN' },
    ]);
  });
  it('reads the script when there is no transliteration', () => {
    expect(speechPlan({ text: 'नमो', translit: null }, 'hi-IN', ['en-US'])).toEqual([{ text: 'नमो', language: 'hi-IN' }]);
  });
});

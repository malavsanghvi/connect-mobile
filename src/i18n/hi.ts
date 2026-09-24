import { en, type StringKey } from './en';

/**
 * हिन्दी. Every key is present; untranslated entries fall back to English
 * until the center's reviewed translations are added.
 */
export const hi: Record<StringKey, string> = {
  ...en,
  'tab.home': 'होम',
  'tab.events': 'कार्यक्रम',
  'tab.give': 'दान',
  'tab.jainWay': 'जैन मार्ग',
  'tab.family': 'परिवार',
};

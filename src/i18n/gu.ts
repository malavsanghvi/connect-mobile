import { en, type StringKey } from './en';

/**
 * ગુજરાતી. Every key is present; untranslated entries fall back to English
 * until the center's reviewed translations are added.
 */
export const gu: Record<StringKey, string> = {
  ...en,
  'tab.home': 'હોમ',
  'tab.events': 'કાર્યક્રમો',
  'tab.give': 'દાન',
  'tab.jainWay': 'જૈન માર્ગ',
  'tab.family': 'પરિવાર',
};

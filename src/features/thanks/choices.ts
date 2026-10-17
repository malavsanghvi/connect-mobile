import type { RecognitionChoice, ReachChoice, ThanksChoice } from '@/lib/api/care-prefs';

// The cards of "How would you like to be thanked?", in the order they are shown. The words are in src/i18n (thanks.*).
export const THANKS_KEYS: readonly ThanksChoice[] = ['in_person', 'call', 'card', 'message', 'none'];
export const RECOGNITION_KEYS: readonly RecognitionChoice[] = ['public', 'private_only', 'anonymous'];
export const REACH_KEYS: readonly ReachChoice[] = ['in_person', 'phone', 'text', 'email', 'whatsapp', 'post'];

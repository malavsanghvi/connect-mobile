import type { Translate } from '@/i18n';

export function freqLabel(t: Translate, f: string): string {
  const map: Record<string, Parameters<Translate>[0]> = { weekly: 'recurring.weekly', monthly: 'recurring.monthly', quarterly: 'recurring.quarterly', yearly: 'recurring.yearly', special_day: 'recurring.specialDay' };
  return map[f] ? t(map[f]) : f;
}

export function methodLabel(t: Translate, method: string): string {
  switch (method) {
    case 'ach':
      return t('recurring.methodAch');
    case 'card':
      return t('recurring.methodCard');
    case 'apple_pay':
      return 'Apple Pay';
    case 'google_pay':
      return 'Google Pay';
    case 'zelle':
      return 'Zelle';
    case 'check':
      return t('recurring.methodCheck');
    default:
      return t('recurring.methodOther');
  }
}

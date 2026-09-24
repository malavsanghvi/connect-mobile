import type { Translate } from '@/i18n';
import type { SpecialDay } from '@/lib/api/family';
import type { FamilyMember } from '@/lib/api/member';

export const SPECIAL_DAY_KINDS = ['birthday', 'anniversary', 'punyatithi', 'diksha', 'other'] as const;

export function kindLabel(t: Translate, kind: string): string {
  switch (kind) {
    case 'birthday':
      return t('days.kindBirthday');
    case 'anniversary':
      return t('days.kindAnniversary');
    case 'punyatithi':
      return t('days.kindPunyatithi');
    case 'diksha':
      return t('days.kindDiksha');
    default:
      return t('days.kindOther');
  }
}

/** "Anya's birthday", or the label the family gave it. */
export function listDisplayName(t: Translate, day: SpecialDay, members: FamilyMember[]): string {
  if (day.label?.trim()) return day.label.trim();
  const who = day.person_id ? members.find((m) => m.person.id === day.person_id) : null;
  const kind = kindLabel(t, day.kind).toLowerCase();
  return who ? t('days.whoseKind', { name: who.person.preferred_name || who.person.first_name, kind }) : kindLabel(t, day.kind);
}

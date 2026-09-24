import type { Translate } from '@/i18n';
import type { SpecialDay } from '@/lib/api/family';
import type { FamilyMember } from '@/lib/api/member';
import { daysBetween, monthName, parseISODate } from '@/lib/format';

/**
 * Occasions offered when adding a day (Main.dc.html sdType). "Birth tithi" is
 * stored as kind 'birthday' remembered by tithi — the table's check constraint
 * has no separate kind. Existing 'diksha' rows still display.
 */
export const OCCASIONS = ['birthday', 'anniversary', 'birth_tithi', 'punyatithi', 'other'] as const;
export type Occasion = (typeof OCCASIONS)[number];
/** Kept for older call sites. */
export const SPECIAL_DAY_KINDS = OCCASIONS;

/** The occasion a stored row represents. */
export function occasionOf(day: Pick<SpecialDay, 'kind' | 'calendar_date' | 'tithi'>): Occasion | 'diksha' {
  if (day.kind === 'birthday' && !day.calendar_date && day.tithi) return 'birth_tithi';
  if (day.kind === 'birthday' || day.kind === 'anniversary' || day.kind === 'punyatithi' || day.kind === 'diksha') return day.kind;
  return 'other';
}

export function kindLabel(t: Translate, kind: string): string {
  switch (kind) {
    case 'birthday':
      return t('days.kindBirthday');
    case 'anniversary':
      return t('days.kindAnniversary');
    case 'birth_tithi':
      return t('days.kindBirthTithi');
    case 'punyatithi':
      return t('days.kindPunyatithi');
    case 'diksha':
      return t('days.kindDiksha');
    default:
      return t('days.kindOther');
  }
}

/** "Anya's birthday", "Priya's birth tithi", or the label the family gave it. */
export function listDisplayName(t: Translate, day: SpecialDay, members: FamilyMember[]): string {
  if (day.label?.trim()) return day.label.trim();
  const who = day.person_id ? members.find((m) => m.person.id === day.person_id) : null;
  const occ = occasionOf(day);
  const kind = kindLabel(t, occ).toLowerCase();
  return who ? t('days.whoseKind', { name: who.person.preferred_name || who.person.first_name, kind }) : kindLabel(t, occ);
}

/** Family-tab timing: "Tomorrow", "in 14 days", or "Mar 14" when 60+ days out (prototype whenTxt). */
export function whenText(t: Translate, today: string, next: string | null): string {
  if (!next) return '';
  const n = daysBetween(today, next);
  if (n <= 0) return t('days.today');
  if (n === 1) return t('days.tomorrow');
  if (n < 60) return t('days.inDays', { n });
  const d = parseISODate(next);
  return d ? `${monthName(d.m)} ${d.d}` : '';
}

/** "1 week" / "2 weeks" / "1 month" / "N days" for a reminder lead time. */
export function reminderSpan(t: Translate, days: number): string {
  if (days === 7) return t('days.span1w');
  if (days === 14) return t('days.span2w');
  if (days === 30 || days === 31) return t('days.span1m');
  if (days % 7 === 0) return t('days.spanWeeks', { n: days / 7 });
  return t('days.spanDays', { n: days });
}

/** The age a birthday turns / years an anniversary marks on `next` (null when the year is unknown). */
export function yearsOn(originalISO: string | null, next: string | null): number | null {
  const o = parseISODate(originalISO);
  const n = parseISODate(next);
  if (!o || !n || o.y < 1900) return null;
  const years = n.y - o.y;
  return years > 0 ? years : null;
}

/** Split "Kartak sud 12" into month and the rest (tithi). */
export function splitTithi(input: string): { month: string; tithi: string } | null {
  const parts = input.trim().split(/\s+/);
  if (parts.length < 2) return null;
  return { month: parts[0], tithi: parts.slice(1).join(' ') };
}

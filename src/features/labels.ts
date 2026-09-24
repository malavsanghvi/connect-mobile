import type { Translate } from '@/i18n';
import type { HouseholdRole } from '@/lib/api/member';

export function genderLabel(t: Translate, gender: string | null | undefined): string | null {
  if (!gender) return null;
  const g = gender.toLowerCase();
  if (g === 'female') return t('profile.female');
  if (g === 'male') return t('profile.male');
  if (g === 'prefer_not_to_say') return t('profile.preferNot');
  return gender;
}

export function roleLabel(t: Translate, role: HouseholdRole): string {
  return t(`role.${role}`);
}

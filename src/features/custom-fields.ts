import { formatCents } from '@/lib/format';

/** A member's own detail kept by the community (app.person_custom_fields, sensitivity member_self). */
export type MemberCustomField = { entity: string; key: string; label: string; type: string; value: unknown };

/** How a custom value reads on the profile ("" when there is nothing to show). */
export function formatMemberCustomValue(type: string, value: unknown, yes = 'Yes', no = 'No'): string {
  if (value === null || value === undefined || value === '') return '';
  if (type === 'boolean') return value === true ? yes : value === false ? no : String(value);
  if (type === 'money' && typeof value === 'number') return formatCents(value);
  if (type === 'date' && typeof value === 'string') {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    return m ? `${m[2]}/${m[3]}/${m[1]}` : value;
  }
  return String(value);
}

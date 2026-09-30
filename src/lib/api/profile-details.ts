import { check, maybe, must } from '../errors';
import type { DetailsValue, DietaryOption, ProfileDetailsRow } from '../profile-details';
import { withAuditReason } from '../request-context';
import { supabase } from '../supabase';

// "More about you" (connect-crm 0546). RLS: the person, and the adults of their household, read and
// write the row; a child's row is written by a parent only; staff read it with people.view.

/** The community's dietary choices (app.dietary_options), in the order the office set, including switched-off ones. */
export async function loadDietaryOptions(centerId: string): Promise<DietaryOption[]> {
  const rows = must(await supabase.from('dietary_options').select('key, label, active').eq('center_id', centerId).order('sort').order('label'), 'load the dietary choices');
  return rows.map((r) => ({ key: r.key, label: r.label, active: r.active }));
}

/** One person's saved details, or null when they have not saved any yet. */
export async function loadProfileDetails(personId: string): Promise<ProfileDetailsRow | null> {
  return maybe(await supabase.from('person_profile_details').select('*').eq('person_id', personId).maybeSingle(), 'load these details');
}

/** Save (insert or replace) one person's details. The database pins the row to the person's community. */
export async function saveProfileDetails(args: { centerId: string; personId: string; value: DetailsValue }): Promise<void> {
  const row = { person_id: args.personId, center_id: args.centerId, ...args.value };
  check(await withAuditReason(supabase.from('person_profile_details').upsert(row, { onConflict: 'person_id' }), 'Profile details updated in the member app'), 'save these details');
}

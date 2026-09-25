import type { User } from '@supabase/supabase-js';

import type { Enums, Tables } from '../database.types';
import { AppError, check, maybe, must } from '../errors';
import { todayAt } from '../format';
import { splitRemembered } from '@/features/remembrance';
import { isAdult, orgIdDisplay } from '../rules';
import { supabase } from '../supabase';

export type Center = Pick<Tables<'centers'>, 'id' | 'slug' | 'name' | 'short_name' | 'time_zone' | 'tradition' | 'branding' | 'feature_flags' | 'rules' | 'environment'>;
export type Person = Tables<'people'>;
export type Household = Tables<'households'>;
export type HouseholdRole = Enums<'person_role_in_household'>;

export type FamilyMember = {
  person: Person;
  role: HouseholdRole;
  isPrimary: boolean;
  isAdult: boolean;
  /** Organization's own PERSON id (external_ids kind 'org_member'), e.g. "0417". */
  orgMemberId: string | null;
};

export type Member = {
  userId: string;
  email: string | null;
  phone: string | null;
  person: Person;
  household: Household | null;
  /** Organization's own HOUSEHOLD id (external_ids kind 'org_household'), e.g. "0212". */
  orgHouseholdId: string | null;
  /** The living members of the household (a member recorded as deceased is never listed or offered). */
  members: FamilyMember[];
  /** Household members recorded as deceased: shown only as the "In memory" line on the Family tab. */
  remembered: FamilyMember[];
  membership: Tables<'memberships'> | null;
  account: Tables<'accounts'> | null;
  /** Center date when the member record was loaded ('YYYY-MM-DD'). */
  today: string;
  isAdult: boolean;
};

const ROLE_ORDER: Record<HouseholdRole, number> = { primary: 0, spouse: 1, parent: 2, sibling: 3, other: 4, child: 5 };

export async function loadCenter(slug: string): Promise<Center> {
  const res = await supabase
    .from('centers')
    .select('id, slug, name, short_name, time_zone, tradition, branding, feature_flags, rules, environment')
    .eq('slug', slug)
    .maybeSingle();
  const center = maybe(res, 'open your center');
  if (!center) {
    throw new AppError(
      `We couldn't find the community "${slug}". It may no longer be active — choose your community again, or ask its office.`,
      `no active center with slug ${slug}`,
    );
  }
  return center;
}

/** centers.rules.identifiers — labels for the org's own IDs (connect-crm 0013/0015). */
export function orgIdentifierRules(center: Center | null): { memberLabel: string | null; householdLabel: string | null } {
  const rules = center?.rules;
  if (!rules || typeof rules !== 'object' || Array.isArray(rules)) return { memberLabel: null, householdLabel: null };
  const ids = (rules as Record<string, unknown>).identifiers;
  if (!ids || typeof ids !== 'object' || Array.isArray(ids)) return { memberLabel: null, householdLabel: null };
  const o = ids as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
  return { memberLabel: str(o.org_member_label), householdLabel: str(o.org_household_label) };
}

/** Returns null when this login is not linked to a person at the center yet (onboarding needed). */
export async function loadMember(center: Center, user: User): Promise<Member | null> {
  const link = maybe(
    await supabase.from('center_users').select('person_id').eq('center_id', center.id).eq('user_id', user.id).maybeSingle(),
    'load your membership',
  );
  if (!link) return null;
  const today = todayAt(center.time_zone);

  const [personRes, myHouseholdsRes, accountRes] = await Promise.all([
    supabase.from('people').select('*').eq('id', link.person_id).single(),
    supabase.from('household_members').select('household_id, role, is_primary').eq('person_id', link.person_id).eq('center_id', center.id).is('left_at', null),
    supabase.from('accounts').select('*').eq('user_id', user.id).maybeSingle(),
  ]);
  const person = must(personRes, 'load your profile');
  const myHouseholds = must(myHouseholdsRes, 'load your family');
  const account = maybe(accountRes, 'load your account');

  // A person can belong to several households; the app works with the one they
  // are primary in, else the first (multi-household switching is a later feature).
  const chosen = [...myHouseholds].sort((a, b) => Number(b.is_primary) - Number(a.is_primary))[0];

  let household: Household | null = null;
  let orgHouseholdId: string | null = null;
  let members: FamilyMember[] = [];
  let remembered: FamilyMember[] = [];
  let membership: Tables<'memberships'> | null = null;

  if (chosen) {
    const [householdRes, rosterRes, membershipRes, orgIdsRes] = await Promise.all([
      supabase.from('households').select('*').eq('id', chosen.household_id).single(),
      supabase.from('household_members').select('person_id, role, is_primary').eq('household_id', chosen.household_id).is('left_at', null),
      supabase.from('memberships').select('*').eq('household_id', chosen.household_id).order('starts_on', { ascending: false }).limit(5),
      supabase
        .from('external_ids')
        .select('kind, person_id, household_id, value, is_primary, valid_to')
        .eq('household_id', chosen.household_id)
        .in('kind', ['org_member', 'org_household'])
        .is('valid_to', null),
    ]);
    household = must(householdRes, 'load your household');
    const roster = must(rosterRes, 'load your family');
    const memberships = must(membershipRes, 'load your membership');
    const orgIds = must(orgIdsRes, 'load your member IDs');
    membership = memberships.find((m) => m.status === 'active') ?? memberships[0] ?? null;

    const ids = roster.map((r) => r.person_id);
    const people = ids.length ? must(await supabase.from('people').select('*').in('id', ids), 'load your family') : [];
    const byId = new Map(people.map((p) => [p.id, p]));
    const personIds = orgIds.filter((o) => o.kind === 'org_member' && o.person_id);
    const householdIds = orgIds.filter((o) => o.kind === 'org_household');
    orgHouseholdId = orgIdDisplay((householdIds.find((o) => o.is_primary) ?? householdIds[0])?.value);

    members = roster
      .map((r) => {
        const p = byId.get(r.person_id);
        if (!p) return null;
        const own = personIds.find((o) => o.person_id === p.id && o.is_primary) ?? personIds.find((o) => o.person_id === p.id);
        return {
          person: p,
          role: r.role,
          isPrimary: r.is_primary,
          isAdult: isAdult(p.date_of_birth, today),
          orgMemberId: orgIdDisplay(own?.value),
        } satisfies FamilyMember;
      })
      .filter((m): m is FamilyMember => m !== null)
      .sort((a, b) => {
        if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
        if (ROLE_ORDER[a.role] !== ROLE_ORDER[b.role]) return ROLE_ORDER[a.role] - ROLE_ORDER[b.role];
        return (a.person.date_of_birth ?? '').localeCompare(b.person.date_of_birth ?? '');
      });
    ({ living: members, remembered } = splitRemembered(members));
  }

  if (!members.some((m) => m.person.id === person.id)) {
    members.unshift({ person, role: 'other', isPrimary: false, isAdult: isAdult(person.date_of_birth, today), orgMemberId: null });
  }

  return {
    userId: user.id,
    email: user.email ?? null,
    phone: user.phone ? `+${user.phone.replace(/^\+/, '')}` : null,
    person,
    household,
    orgHouseholdId,
    members,
    remembered,
    membership,
    account,
    today,
    isAdult: isAdult(person.date_of_birth, today),
  };
}

/** Candidate households for "Is this your family?" (app.find_my_family). */
export async function findMyFamily(centerId: string) {
  return must(await supabase.rpc('find_my_family', { p_center: centerId }), 'look up your family');
}

export async function linkAccount(centerId: string, personId: string): Promise<void> {
  check(await supabase.rpc('link_account', { p_center: centerId, p_person: personId }), 'link your account');
}

export async function createMyHousehold(centerId: string, first: string, last: string): Promise<void> {
  check(await supabase.rpc('create_my_household', { p_center: centerId, p_first: first, p_last: last }), 'start your family profile');
}

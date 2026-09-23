import type { Enums, Tables, TablesInsert } from '../database.types';
import { AppError, check, maybe, must } from '../errors';
import { formatDob, formatPhone, isValidEmail, parseDobInput, toE164 } from '../format';
import { supabase } from '../supabase';

import type { Person } from './member';

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

export type Gender = 'female' | 'male' | 'prefer_not_to_say' | '';

export type ProfileDraft = {
  first_name: string;
  last_name: string;
  dob: string;
  gender: Gender;
  profession: string;
  employer: string;
  phone: string;
  email: string;
};

export function draftFromPerson(p: Person): ProfileDraft {
  const g = (p.gender ?? '').toLowerCase();
  return {
    first_name: p.first_name,
    last_name: p.last_name,
    dob: formatDob(p.date_of_birth),
    gender: g === 'female' || g === 'male' || g === 'prefer_not_to_say' ? g : '',
    profession: p.profession ?? '',
    employer: p.employer ?? '',
    phone: formatPhone(p.phone_e164),
    email: p.email ?? '',
  };
}

export type ProfileErrors = Partial<Record<keyof ProfileDraft, string>>;

/** Validate and convert to a people update. `withContact` is false for children (no contact fields). */
export function profileToUpdate(d: ProfileDraft, withContact: boolean): { update: Partial<Person>; errors: ProfileErrors } {
  const errors: ProfileErrors = {};
  if (!d.first_name.trim()) errors.first_name = 'Please enter a first name.';
  if (!d.last_name.trim()) errors.last_name = 'Please enter a last name.';
  let dob: string | null = null;
  if (d.dob.trim()) {
    dob = parseDobInput(d.dob);
    if (!dob) errors.dob = 'Use the format MM/DD/YYYY, for example 03/14/1985.';
  }
  const update: Partial<Person> = {
    first_name: d.first_name.trim(),
    last_name: d.last_name.trim(),
    date_of_birth: dob,
    gender: d.gender || null,
  };
  if (withContact) {
    let phone: string | null = null;
    if (d.phone.trim()) {
      phone = toE164(d.phone);
      if (!phone) errors.phone = 'Enter a 10-digit US number, or an international number starting with +.';
    }
    if (d.email.trim() && !isValidEmail(d.email)) errors.email = 'That email address does not look right.';
    update.profession = d.profession.trim() || null;
    update.employer = d.employer.trim() || null;
    update.phone_e164 = phone;
    update.email = d.email.trim() ? d.email.trim().toLowerCase() : null;
  }
  return { update, errors };
}

export async function updatePerson(personId: string, patch: Partial<Person>): Promise<void> {
  // RLS (people_self_or_guardian_update): yourself, or — as an adult — anyone in your household.
  check(await supabase.from('people').update(patch).eq('id', personId), 'save this profile');
}

// ---------------------------------------------------------------------------
// Contact preferences (onboarding step 5, Settings › Preferences)
// ---------------------------------------------------------------------------

export type ContactChannel = 'sms' | 'whatsapp' | 'email';
export const CONTACT_CHANNELS: ContactChannel[] = ['sms', 'whatsapp', 'email'];
const PREF_CHANNELS: Enums<'channel'>[] = ['push', 'email', 'sms', 'whatsapp'];

export type ContactPrefs = {
  topics: Tables<'notification_topics'>[];
  /** Topic keys the person wants to hear about. */
  selectedTopics: string[];
  channels: ContactChannel[];
  /** The person's last recorded documents-and-mail choice (consents kind 'physical_mail'); null if never chosen. */
  physicalMail: boolean | null;
  /** households.physical_mail_opt_in as stored (defaults to true in the schema, so it can't mean "chosen"). */
  householdPhysicalMail: boolean | null;
};

export async function loadContactPrefs(centerId: string, personId: string, householdId: string | null): Promise<ContactPrefs> {
  const [topicsRes, prefsRes, optinsRes, consentRes, householdRes] = await Promise.all([
    supabase.from('notification_topics').select('*').order('name'),
    supabase.from('notification_preferences').select('topic_key, channel, enabled').eq('person_id', personId),
    supabase.from('channel_optins').select('channel, opted_in, recorded_at').eq('person_id', personId).order('recorded_at', { ascending: false }),
    supabase.from('consents').select('granted, recorded_at').eq('person_id', personId).eq('kind', 'physical_mail').order('recorded_at', { ascending: false }).limit(1),
    householdId ? supabase.from('households').select('physical_mail_opt_in').eq('id', householdId).maybeSingle() : Promise.resolve({ data: null, error: null }),
  ]);
  const topics = must(topicsRes, 'load notification topics');
  const prefs = must(prefsRes, 'load your notification choices');
  const optins = must(optinsRes, 'load your contact choices');
  const consent = must(consentRes, 'load your mail choice');
  const household = maybe(householdRes, 'load your mail choice');

  const selectedTopics = topics
    .filter((topic) => {
      const rows = prefs.filter((p) => p.topic_key === topic.key);
      return rows.length === 0 ? topic.default_on : rows.some((r) => r.enabled);
    })
    .map((topic) => topic.key);

  const latest = new Map<string, boolean>();
  for (const o of optins) if (!latest.has(o.channel)) latest.set(o.channel, o.opted_in);
  const channels = CONTACT_CHANNELS.filter((c) => latest.get(c) === true);

  return {
    topics,
    selectedTopics,
    channels,
    physicalMail: consent.length > 0 ? consent[0].granted : null,
    householdPhysicalMail: household ? household.physical_mail_opt_in : null,
  };
}

export async function saveContactPrefs(args: {
  centerId: string;
  userId: string;
  personId: string;
  householdId: string | null;
  isAdult: boolean;
  topics: Tables<'notification_topics'>[];
  selectedTopics: string[];
  channels: ContactChannel[];
  physicalMail: boolean | null;
  phone: string | null;
  email: string | null;
}): Promise<void> {
  const now = new Date().toISOString();

  // Per topic × channel. Push follows the topic choice; SMS / WhatsApp / email also need the channel.
  const prefRows: TablesInsert<'notification_preferences'>[] = [];
  for (const topic of args.topics) {
    if (!args.isAdult && topic.marketing) continue; // children never receive marketing
    const topicOn = args.selectedTopics.includes(topic.key);
    for (const channel of PREF_CHANNELS) {
      const channelOn = channel === 'push' || args.channels.includes(channel as ContactChannel);
      prefRows.push({ center_id: args.centerId, person_id: args.personId, topic_key: topic.key, channel, enabled: topicOn && channelOn, updated_at: now });
    }
  }
  if (prefRows.length) {
    check(await supabase.from('notification_preferences').upsert(prefRows, { onConflict: 'person_id,topic_key,channel' }), 'save your notification choices');
  }

  // Channel opt-ins are an append-only consent trail; record one row per channel with an address.
  const optinRows: TablesInsert<'channel_optins'>[] = [];
  for (const channel of CONTACT_CHANNELS) {
    const address = channel === 'email' ? args.email : args.phone;
    if (!address) continue;
    optinRows.push({ center_id: args.centerId, person_id: args.personId, channel, address, opted_in: args.channels.includes(channel), source: 'onboarding' });
  }
  if (optinRows.length) check(await supabase.from('channel_optins').insert(optinRows), 'save how we contact you');

  if (args.physicalMail !== null && args.householdId && args.isAdult) {
    check(await supabase.from('households').update({ physical_mail_opt_in: args.physicalMail }).eq('id', args.householdId), 'save your documents and mail choice');
    check(
      await supabase.from('consents').insert({ center_id: args.centerId, person_id: args.personId, given_by_user: args.userId, kind: 'physical_mail', granted: args.physicalMail, source: 'app' }),
      'record your documents and mail choice',
    );
  }
}

// ---------------------------------------------------------------------------
// Requests to the office (members cannot insert people directly — see README "Schema gaps")
// ---------------------------------------------------------------------------

async function findInbox(centerId: string, preferredKeys: string[]): Promise<Tables<'inboxes'>> {
  const inboxes = must(await supabase.from('inboxes').select('*').eq('center_id', centerId).is('zone_id', null), 'find the right team inbox');
  for (const key of preferredKeys) {
    const hit = inboxes.find((i) => i.key === key);
    if (hit) return hit;
  }
  if (inboxes[0]) return inboxes[0];
  throw new AppError("The center hasn't set up a team inbox yet, so we can't send this. Please contact the office directly.", 'no inboxes for center');
}

/** Send a message to a team inbox as a new thread (Ask a question, add a family member, …). */
export async function sendToInbox(args: { centerId: string; userId: string; personId: string; inboxId?: string; preferredKeys?: string[]; subject: string; body: string }): Promise<string> {
  const inboxId = args.inboxId ?? (await findInbox(args.centerId, args.preferredKeys ?? ['office'])).id;
  const thread = must(
    await supabase.from('threads').insert({ center_id: args.centerId, inbox_id: inboxId, from_person_id: args.personId, subject: args.subject, status: 'open' }).select('id').single(),
    'send your message',
  );
  check(await supabase.from('thread_messages').insert({ center_id: args.centerId, thread_id: thread.id, author_user: args.userId, body: args.body }), 'send your message');
  return thread.id;
}

export async function requestAddFamilyMember(args: { centerId: string; userId: string; personId: string; householdName: string; first: string; last: string; relationship: string; dob: string }): Promise<void> {
  if (!args.first.trim() || !args.last.trim()) throw new AppError('Please enter their first and last name.', 'validation');
  const dob = args.dob.trim() ? parseDobInput(args.dob) : null;
  if (args.dob.trim() && !dob) throw new AppError('Use the format MM/DD/YYYY for the date of birth.', 'validation');
  await sendToInbox({
    centerId: args.centerId,
    userId: args.userId,
    personId: args.personId,
    preferredKeys: ['membership', 'office'],
    subject: `Add a family member to ${args.householdName}`,
    body: [
      `Please add a family member to ${args.householdName}.`,
      `Name: ${args.first.trim()} ${args.last.trim()}`,
      `Relationship: ${args.relationship || 'not given'}`,
      `Date of birth: ${dob ?? 'not given'}`,
      'Sent from the Connect member app.',
    ].join('\n'),
  });
}

// ---------------------------------------------------------------------------
// Eligibility, membership
// ---------------------------------------------------------------------------

export type Eligibility = { canVote: boolean; computedAt: string; reasons: { label: string; ok: boolean | null }[]; overridden: boolean };

function parseReasons(raw: unknown): Eligibility['reasons'] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((r) => {
      if (typeof r === 'string') return { label: r, ok: null };
      if (r && typeof r === 'object') {
        const o = r as Record<string, unknown>;
        const label = [o.label, o.text, o.reason, o.rule, o.key].find((v) => typeof v === 'string') as string | undefined;
        const ok = typeof o.ok === 'boolean' ? o.ok : typeof o.passed === 'boolean' ? o.passed : typeof o.met === 'boolean' ? o.met : null;
        return label ? { label, ok } : null;
      }
      return null;
    })
    .filter((r): r is { label: string; ok: boolean | null } => r !== null);
}

export async function loadEligibility(personId: string): Promise<Eligibility | null> {
  const row = maybe(
    await supabase.from('eligibility_snapshots').select('*').eq('person_id', personId).order('computed_at', { ascending: false }).limit(1).maybeSingle(),
    'load voting eligibility',
  );
  if (!row) return null;
  return {
    canVote: row.override_can_vote ?? row.can_vote,
    computedAt: row.computed_at,
    reasons: parseReasons(row.reasons),
    overridden: row.override_can_vote !== null,
  };
}

// ---------------------------------------------------------------------------
// Special days
// ---------------------------------------------------------------------------

export type SpecialDay = Tables<'special_days'>;
export type SpecialDayKind = 'birthday' | 'anniversary' | 'punyatithi' | 'diksha' | 'other';

export async function listSpecialDays(householdId: string): Promise<SpecialDay[]> {
  return must(await supabase.from('special_days').select('*').eq('household_id', householdId).order('calendar_date'), 'load special days');
}

export async function saveSpecialDay(row: TablesInsert<'special_days'>, id?: string): Promise<void> {
  if (id) check(await supabase.from('special_days').update(row).eq('id', id), 'save this special day');
  else check(await supabase.from('special_days').insert(row), 'save this special day');
}

export async function deleteSpecialDay(id: string): Promise<void> {
  check(await supabase.from('special_days').delete().eq('id', id), 'remove this special day');
}

/** Next Gregorian date for a tithi-based special day, from the published tithi table. */
export async function nextTithiDates(centerId: string, fromDate: string, days: { id: string; tithi: string; month: string }[]): Promise<Record<string, string>> {
  if (days.length === 0) return {};
  const rows = must(
    await supabase
      .from('tithi_days')
      .select('gregorian, tithi, month_name, center_id')
      .gte('gregorian', fromDate)
      .or(`center_id.eq.${centerId},center_id.is.null`)
      .order('gregorian')
      .limit(800),
    'look up tithi dates',
  );
  const out: Record<string, string> = {};
  for (const d of days) {
    const hit = rows.find((r) => r.tithi.trim().toLowerCase() === d.tithi.trim().toLowerCase() && r.month_name.trim().toLowerCase() === d.month.trim().toLowerCase());
    if (hit) out[d.id] = hit.gregorian;
  }
  return out;
}

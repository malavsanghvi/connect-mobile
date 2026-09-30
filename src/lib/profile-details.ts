/**
 * "More about you" (connect-crm 0546): the optional things a member tells the community —
 * wedding anniversary, dietary needs, an emergency contact (app.person_profile_details) and
 * volunteering interests (app.volunteer_interests, saved by the same form). Pure: drafts,
 * validation and list handling, so the rules are unit-tested and mirror the database's.
 *
 * Interests ("Interested in") are NOT here: they already live in people.interests and are asked
 * in onboarding "How should we reach you?" and on the profile.
 *
 * The database enforces all of this too (RLS + a trigger); these checks exist so the member gets
 * a plain-English answer next to the field instead of a failed save.
 */
import type { StringKey, Vars } from '../i18n';
import { en } from '../i18n/en';

import type { Tables } from './database.types';
import { formatDob, formatPhone, parseDobInput, toE164 } from './format';

export type ProfileDetailsRow = Tables<'person_profile_details'>;

/** One choice from the community's dietary list (app.dietary_options). */
export type DietaryOption = { key: string; label: string; active: boolean };

/** The "other" choice: the member adds their own words. */
export const DIETARY_OTHER_KEY = 'other';
export const MAX_DIETARY_OTHER = 200;
export const MAX_EC_NAME = 120;
export const MAX_EC_RELATIONSHIP = 60;

/** What the form holds while the member types (dates and phone as they appear on screen). */
export type DetailsDraft = {
  /** 'MM/DD/YYYY' or ''. */
  anniversary: string;
  dietary: string[];
  dietaryOther: string;
  ecName: string;
  ecRelationship: string;
  ecPhone: string;
};

export const EMPTY_DETAILS: DetailsDraft = { anniversary: '', dietary: [], dietaryOther: '', ecName: '', ecRelationship: '', ecPhone: '' };

/** What is written to app.person_profile_details (besides person_id and center_id). */
export type DetailsValue = {
  anniversary: string | null;
  dietary: string[];
  dietary_other: string | null;
  emergency_contact_name: string | null;
  emergency_contact_relationship: string | null;
  emergency_contact_phone: string | null;
};

export type DetailsField = 'anniversary' | 'dietaryOther' | 'ecName' | 'ecRelationship' | 'ecPhone';
/** An error is a string key (shown with `t(key, vars)`), so every language gets it. */
export type DetailsError = { key: StringKey; vars?: Vars };
export type DetailsErrors = Partial<Record<DetailsField, DetailsError>>;

export function draftFromDetails(row: Partial<ProfileDetailsRow> | null | undefined): DetailsDraft {
  if (!row) return { ...EMPTY_DETAILS };
  return {
    anniversary: formatDob(row.anniversary),
    dietary: [...(row.dietary ?? [])],
    dietaryOther: row.dietary_other ?? '',
    ecName: row.emergency_contact_name ?? '',
    ecRelationship: row.emergency_contact_relationship ?? '',
    ecPhone: formatPhone(row.emergency_contact_phone),
  };
}

export type DetailsContext = {
  /** Anniversary and volunteering are for adults; a child's form never carries an anniversary. */
  isAdult: boolean;
  /** The community's date today, 'YYYY-MM-DD'. */
  today: string;
  /** The person's birth date, 'YYYY-MM-DD', when known. */
  dob: string | null;
};

/** Validate a draft and turn it into the row to save. `errors` is empty when it can be saved. */
export function validateDetails(draft: DetailsDraft, ctx: DetailsContext): { value: DetailsValue; errors: DetailsErrors } {
  const errors: DetailsErrors = {};

  let anniversary: string | null = null;
  if (ctx.isAdult && draft.anniversary.trim()) {
    anniversary = parseDobInput(draft.anniversary);
    if (!anniversary) errors.anniversary = { key: 'details.dateInvalid' };
    else if (anniversary > ctx.today) errors.anniversary = { key: 'details.dateFuture' };
    else if (ctx.dob && anniversary <= ctx.dob) errors.anniversary = { key: 'details.dateBeforeBirth' };
  }

  const dietary = [...new Set(draft.dietary.map((k) => k.trim()).filter(Boolean))];
  // The free-text note belongs to the "other" choice; without it the box is hidden, so the words go too.
  let dietaryOther: string | null = null;
  if (dietary.includes(DIETARY_OTHER_KEY)) {
    const note = draft.dietaryOther.trim().replace(/\s+/g, ' ');
    if (note.length > MAX_DIETARY_OTHER) errors.dietaryOther = { key: 'details.tooLong', vars: { max: MAX_DIETARY_OTHER } };
    dietaryOther = note || null;
  }

  const name = draft.ecName.trim().replace(/\s+/g, ' ');
  const relationship = draft.ecRelationship.trim().replace(/\s+/g, ' ');
  const phoneTyped = draft.ecPhone.trim();
  let phone: string | null = null;
  if (name || relationship || phoneTyped) {
    if (!name) errors.ecName = { key: 'details.needName' };
    else if (name.length > MAX_EC_NAME) errors.ecName = { key: 'details.tooLong', vars: { max: MAX_EC_NAME } };
    if (relationship.length > MAX_EC_RELATIONSHIP) errors.ecRelationship = { key: 'details.tooLong', vars: { max: MAX_EC_RELATIONSHIP } };
    if (!phoneTyped) errors.ecPhone = { key: 'details.needPhone' };
    else {
      phone = toE164(phoneTyped);
      if (!phone) errors.ecPhone = { key: 'details.phoneInvalid' };
    }
  }
  const hasContact = !!name && !!phone;

  return {
    value: {
      anniversary,
      dietary,
      dietary_other: dietaryOther,
      emergency_contact_name: hasContact ? name : null,
      emergency_contact_relationship: hasContact && relationship ? relationship : null,
      emergency_contact_phone: hasContact ? phone : null,
    },
    errors,
  };
}

/** True when there is nothing to save (used so a member who skips every field never gets an empty row). */
export function isEmptyDetails(v: DetailsValue): boolean {
  return !v.anniversary && v.dietary.length === 0 && !v.dietary_other && !v.emergency_contact_name && !v.emergency_contact_phone && !v.emergency_contact_relationship;
}

/** "nut_allergy" → "Nut allergy": the last-resort name for a choice nobody labelled. */
export function humanizeKey(key: string): string {
  const t = key.trim().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
  return t ? t[0].toUpperCase() + t.slice(1) : '';
}

/**
 * The choices to offer: every active option in the community's order, then any choice the person
 * already made that the community has since switched off (so it can still be seen and un-ticked).
 */
export function dietaryChoiceList(options: readonly DietaryOption[], selected: readonly string[]): DietaryOption[] {
  const active = options.filter((o) => o.active);
  const offered = new Set(active.map((o) => o.key));
  const retired = [...new Set(selected)].filter((k) => !offered.has(k)).map((k) => options.find((o) => o.key === k) ?? { key: k, label: humanizeKey(k), active: false });
  return [...active, ...retired];
}

/** The translation key for a default choice ("vegetarian"), when there is one. */
export function dietaryStringKey(key: string): StringKey | null {
  const k = `details.dietary.${key}`;
  return k in en ? (k as StringKey) : null;
}

/**
 * What to show for a choice. The community's own wording wins; a default choice they never renamed
 * is shown in the member's language.
 */
export function dietaryLabel(option: DietaryOption, t: (key: StringKey) => string): string {
  const k = dietaryStringKey(option.key);
  return k && en[k] === option.label ? t(k) : option.label;
}

/** Tick or untick one dietary choice. */
export function toggleDietary(selected: readonly string[], key: string): string[] {
  return selected.includes(key) ? selected.filter((k) => k !== key) : [...selected, key];
}

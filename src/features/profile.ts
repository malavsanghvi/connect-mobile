import { KNOWN_INTERESTS } from '../lib/categories';

/**
 * people.interests (0018): interest tags stored as stable keys. The catalog of keys is src/lib/categories.ts INTEREST_CATALOG
 * (the prototype's six first); which of them a person is offered depends on the kind of organization (`interestsToOffer`).
 */
export type InterestKey = string;

/** Keep only known keys, in the canonical order (older rows may hold labels or unknown values). Keys a kind of organization does not offer are kept too, so saving never drops them. */
export function normalizeInterests(values: string[] | null | undefined): InterestKey[] {
  const set = new Set((values ?? []).map((v) => v.trim().toLowerCase()));
  return KNOWN_INTERESTS.filter((k) => set.has(k));
}

export function toggle<T>(list: T[], v: T): T[] {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
}

/** True when the family typed a different relationship than the record shows (case and spaces ignored). */
export function relationshipChanged(recorded: string, typed: string): boolean {
  const norm = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();
  return norm(typed) !== '' && norm(typed) !== norm(recorded);
}

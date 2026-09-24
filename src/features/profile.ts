/** people.interests (0018): the prototype's six interest tags, stored as stable keys. */
export const INTERESTS = ['events', 'pathshala', 'volunteering', 'youth', 'seniors', 'giving'] as const;
export type InterestKey = (typeof INTERESTS)[number];

/** Keep only known keys, in the canonical order (older rows may hold labels or unknown values). */
export function normalizeInterests(values: string[] | null | undefined): InterestKey[] {
  const set = new Set((values ?? []).map((v) => v.trim().toLowerCase()));
  return INTERESTS.filter((k) => set.has(k));
}

export function toggle<T>(list: T[], v: T): T[] {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
}

/** True when the family typed a different relationship than the record shows (case and spaces ignored). */
export function relationshipChanged(recorded: string, typed: string): boolean {
  const norm = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();
  return norm(typed) !== '' && norm(typed) !== norm(recorded);
}

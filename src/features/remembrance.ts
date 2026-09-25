// The deceased flag (owner decision 2026-09-25, connect-crm 0420): a family member recorded as
// deceased leaves every family list, picker and count in the app, and is remembered with one
// respectful "In memory" line on the Family tab. Pure.

type WithPerson = { person: { is_deceased: boolean; deceased_on?: string | null; first_name: string; last_name: string; preferred_name?: string | null } };

/** Living members (used everywhere) and those remembered (the In memory line only). */
export function splitRemembered<T extends WithPerson>(list: T[]): { living: T[]; remembered: T[] } {
  const living: T[] = [];
  const remembered: T[] = [];
  for (const m of list) (m.person.is_deceased ? remembered : living).push(m);
  return { living, remembered };
}

/** "Maniben Doshi (2025)" · "Ramesh Shah" — the year when it is known. */
export function rememberedName(p: WithPerson['person']): string {
  const name = `${p.preferred_name || p.first_name} ${p.last_name}`.trim();
  const year = p.deceased_on ? p.deceased_on.slice(0, 4) : null;
  return year ? `${name} (${year})` : name;
}

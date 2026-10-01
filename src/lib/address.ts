import type { ComboOption } from './combo';

/**
 * Household address helpers for the address forms: the US state list, how city / state / ZIP are stored
 * (title-cased city, 2-letter state, 5-digit ZIP or ZIP+4 — the same normalization connect-crm 0561 groups by), a
 * ZIP-prefix → state sanity check, and the type-ahead lists built from app.address_suggestions. Pure, so it is
 * unit-tested.
 */

/** US states, DC and the inhabited territories. A household's state is stored as the 2-letter code. */
export const US_STATES: readonly { code: string; name: string }[] = [
  { code: 'AL', name: 'Alabama' },
  { code: 'AK', name: 'Alaska' },
  { code: 'AZ', name: 'Arizona' },
  { code: 'AR', name: 'Arkansas' },
  { code: 'CA', name: 'California' },
  { code: 'CO', name: 'Colorado' },
  { code: 'CT', name: 'Connecticut' },
  { code: 'DE', name: 'Delaware' },
  { code: 'DC', name: 'District of Columbia' },
  { code: 'FL', name: 'Florida' },
  { code: 'GA', name: 'Georgia' },
  { code: 'HI', name: 'Hawaii' },
  { code: 'ID', name: 'Idaho' },
  { code: 'IL', name: 'Illinois' },
  { code: 'IN', name: 'Indiana' },
  { code: 'IA', name: 'Iowa' },
  { code: 'KS', name: 'Kansas' },
  { code: 'KY', name: 'Kentucky' },
  { code: 'LA', name: 'Louisiana' },
  { code: 'ME', name: 'Maine' },
  { code: 'MD', name: 'Maryland' },
  { code: 'MA', name: 'Massachusetts' },
  { code: 'MI', name: 'Michigan' },
  { code: 'MN', name: 'Minnesota' },
  { code: 'MS', name: 'Mississippi' },
  { code: 'MO', name: 'Missouri' },
  { code: 'MT', name: 'Montana' },
  { code: 'NE', name: 'Nebraska' },
  { code: 'NV', name: 'Nevada' },
  { code: 'NH', name: 'New Hampshire' },
  { code: 'NJ', name: 'New Jersey' },
  { code: 'NM', name: 'New Mexico' },
  { code: 'NY', name: 'New York' },
  { code: 'NC', name: 'North Carolina' },
  { code: 'ND', name: 'North Dakota' },
  { code: 'OH', name: 'Ohio' },
  { code: 'OK', name: 'Oklahoma' },
  { code: 'OR', name: 'Oregon' },
  { code: 'PA', name: 'Pennsylvania' },
  { code: 'RI', name: 'Rhode Island' },
  { code: 'SC', name: 'South Carolina' },
  { code: 'SD', name: 'South Dakota' },
  { code: 'TN', name: 'Tennessee' },
  { code: 'TX', name: 'Texas' },
  { code: 'UT', name: 'Utah' },
  { code: 'VT', name: 'Vermont' },
  { code: 'VA', name: 'Virginia' },
  { code: 'WA', name: 'Washington' },
  { code: 'WV', name: 'West Virginia' },
  { code: 'WI', name: 'Wisconsin' },
  { code: 'WY', name: 'Wyoming' },
  { code: 'AS', name: 'American Samoa' },
  { code: 'GU', name: 'Guam' },
  { code: 'MP', name: 'Northern Mariana Islands' },
  { code: 'PR', name: 'Puerto Rico' },
  { code: 'VI', name: 'U.S. Virgin Islands' },
];

const BY_CODE = new Map(US_STATES.map((s) => [s.code, s]));
const plainName = (s: string) => s.toLowerCase().replace(/\./g, '').replace(/\s+/g, ' ').trim();

/** "Texas" for "TX"; null for anything that is not a state code. */
export function stateName(code: string): string | null {
  return BY_CODE.get(code.trim().toUpperCase())?.name ?? null;
}

/** The state field's suggestions: "Texas" with "TX" beside it; typing "tex" or "tx" finds it. */
export function stateOptions(): ComboOption[] {
  return US_STATES.map((s) => ({ value: s.code, label: s.name, detail: s.code, keywords: s.code === 'VI' ? ['Virgin Islands'] : undefined }));
}

/**
 * A typed state as it is stored: the 2-letter code for a code or a full name in any case ("tx", "texas", "Texas"),
 * or for the start of exactly one state's name ("tex"); anything else upper-cased as typed.
 */
export function normalizeState(input: string): string {
  const s = input.trim().replace(/\s+/g, ' ');
  if (!s) return '';
  const upper = s.toUpperCase();
  if (BY_CODE.has(upper)) return upper;
  const typed = plainName(s);
  const exact = US_STATES.find((st) => plainName(st.name) === typed);
  if (exact) return exact.code;
  if (typed.length >= 3) {
    const starts = US_STATES.filter((st) => plainName(st.name).startsWith(typed));
    if (starts.length === 1) return starts[0].code;
  }
  return upper;
}

/**
 * A city as it is stored: single spaces, and each word capitalized with the rest lower case, the way Postgres
 * initcap does it ("  new   BRUNSWICK" → "New Brunswick", "o'fallon" → "O'Fallon", "winston-salem" →
 * "Winston-Salem"), so it groups with the community's other households (connect-crm 0561).
 */
export function normalizeCity(input: string): string {
  let out = '';
  let prevAlnum = false;
  for (const ch of input.trim().replace(/\s+/g, ' ')) {
    const alnum = /[\p{L}\p{N}]/u.test(ch);
    out += alnum ? (prevAlnum ? ch.toLowerCase() : ch.toUpperCase()) : ch;
    prevAlnum = alnum;
  }
  return out;
}

/** A ZIP code as it is stored: 5 digits, or ZIP+4 as "12345-6789" (from "123456789" or "12345 6789"). Anything else is returned trimmed, for the form to flag. */
export function normalizeZip(input: string): string {
  const s = input.trim();
  const m = /^(\d{5})(?:[- ]?(\d{4}))?$/.exec(s);
  if (!m) return s;
  return m[2] ? `${m[1]}-${m[2]}` : m[1];
}

export function isValidZip(zip: string): boolean {
  return /^\d{5}(-\d{4})?$/.test(zip.trim());
}

/**
 * The state(s) each 3-digit ZIP prefix belongs to (USPS), first match wins. Military (APO/FPO: 090–099, 340,
 * 962–966) and unassigned prefixes are left out, so they are never questioned.
 */
const ZIP_PREFIXES: readonly [from: number, to: number, states: readonly string[]][] = [
  [5, 5, ['NY']],
  [6, 7, ['PR']],
  [8, 8, ['VI']],
  [9, 9, ['PR']],
  [10, 27, ['MA']],
  [28, 29, ['RI']],
  [30, 38, ['NH']],
  [39, 49, ['ME']],
  [55, 55, ['MA']],
  [50, 59, ['VT']],
  [60, 69, ['CT']],
  [70, 89, ['NJ']],
  [100, 149, ['NY']],
  [150, 196, ['PA']],
  [197, 199, ['DE']],
  [201, 201, ['VA']],
  [200, 205, ['DC']],
  [206, 219, ['MD']],
  [220, 246, ['VA']],
  [247, 268, ['WV']],
  [270, 289, ['NC']],
  [290, 299, ['SC']],
  [300, 319, ['GA']],
  [320, 339, ['FL']],
  [341, 349, ['FL']],
  [350, 369, ['AL']],
  [370, 385, ['TN']],
  [386, 397, ['MS']],
  [398, 399, ['GA']],
  [400, 427, ['KY']],
  [430, 459, ['OH']],
  [460, 479, ['IN']],
  [480, 499, ['MI']],
  [500, 528, ['IA']],
  [530, 549, ['WI']],
  [550, 567, ['MN']],
  [569, 569, ['DC']],
  [570, 577, ['SD']],
  [580, 588, ['ND']],
  [590, 599, ['MT']],
  [600, 629, ['IL']],
  [630, 658, ['MO']],
  [660, 679, ['KS']],
  [680, 693, ['NE']],
  [700, 715, ['LA']],
  [716, 729, ['AR']],
  [733, 733, ['TX']],
  [730, 749, ['OK']],
  [750, 799, ['TX']],
  [800, 816, ['CO']],
  [820, 831, ['WY']],
  [832, 838, ['ID']],
  [840, 847, ['UT']],
  [850, 865, ['AZ']],
  [870, 884, ['NM']],
  [885, 885, ['TX']],
  [889, 898, ['NV']],
  [900, 961, ['CA']],
  [967, 967, ['HI', 'AS']],
  [968, 968, ['HI']],
  [969, 969, ['GU', 'MP']],
  [970, 979, ['OR']],
  [980, 994, ['WA']],
  [995, 999, ['AK']],
];

/** The state codes a ZIP code belongs to, or null when that is not known (not a ZIP, military, unassigned). */
export function zipStates(zip: string): readonly string[] | null {
  const z = normalizeZip(zip);
  if (!isValidZip(z)) return null;
  const prefix = Number(z.slice(0, 3));
  return ZIP_PREFIXES.find(([from, to]) => prefix >= from && prefix <= to)?.[2] ?? null;
}

/**
 * When the ZIP code and the state disagree: the state(s) the ZIP belongs to, for a plain-English warning. Null when
 * they agree or either is not complete yet (a ZIP still being typed, a state that is not a code).
 */
export function zipStateMismatch(zip: string, state: string): readonly string[] | null {
  const code = state.trim().toUpperCase();
  if (!BY_CODE.has(code)) return null;
  const expected = zipStates(zip);
  return expected && !expected.includes(code) ? expected : null;
}

/** One row of app.address_suggestions (connect-crm 0561). Zone ZIP codes come first, with no city or state. */
export type AddressSuggestion = { postal_code: string; city: string | null; state_region: string | null; households: number; from_zone: boolean };

const place = (r: AddressSuggestion) => (r.state_region ? `${r.city}, ${r.state_region}` : (r.city ?? ''));

/**
 * The ZIP field's suggestions, in the order the RPC gives them (the community's zone ZIP codes first), each once,
 * with the places the community knows for it ("Edison, NJ") and `zoneLabel` when it is a zone's ZIP code.
 */
export function zipOptions(rows: readonly AddressSuggestion[], zoneLabel: string): ComboOption[] {
  const byZip = new Map<string, { places: string[]; zone: boolean }>();
  for (const r of rows) {
    const entry = byZip.get(r.postal_code) ?? { places: [], zone: false };
    if (r.from_zone) entry.zone = true;
    if (r.city) entry.places.push(place(r));
    byZip.set(r.postal_code, entry);
  }
  return [...byZip].map(([zip, e]) => ({ value: zip, label: zip, detail: [...e.places, e.zone ? zoneLabel : null].filter(Boolean).join(' · ') || undefined }));
}

/**
 * The city field's suggestions: the cities known for the chosen ZIP code (most households first); when the ZIP is
 * empty or the community knows no city for it, every city it knows (most households first), each with its state.
 */
export function cityOptions(rows: readonly AddressSuggestion[], zip: string): ComboOption[] {
  const z = normalizeZip(zip).slice(0, 5);
  const known = rows.filter((r) => r.city);
  const forZip = known.filter((r) => r.postal_code === z);
  const source = forZip.length ? forZip : known;
  const totals = new Map<string, { city: string; state: string | null; households: number }>();
  for (const r of source) {
    const key = `${r.city}|${r.state_region ?? ''}`;
    const t = totals.get(key) ?? { city: r.city as string, state: r.state_region, households: 0 };
    t.households += r.households;
    totals.set(key, t);
  }
  return [...totals.values()]
    .sort((a, b) => b.households - a.households || a.city.localeCompare(b.city))
    .map((c) => ({ value: c.city, label: c.city, detail: c.state ?? undefined }));
}

/** The city and state a ZIP code fills in: only when the community knows exactly one place for it. */
export function placeForZip(rows: readonly AddressSuggestion[], zip: string): { city: string; state: string } | null {
  const z = normalizeZip(zip);
  if (!isValidZip(z)) return null;
  const places = rows.filter((r) => r.postal_code === z.slice(0, 5) && r.city && r.state_region);
  const distinct = new Set(places.map((r) => `${r.city}|${r.state_region}`));
  return distinct.size === 1 ? { city: places[0].city as string, state: places[0].state_region as string } : null;
}

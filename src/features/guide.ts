/**
 * Pure helpers for the New-to-{center} guide (Welcome.dc.html). Kept free of
 * React and Supabase so they are unit-tested.
 */

type Obj = Record<string, unknown>;

function asObj(v: unknown): Obj | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : null;
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function httpUrl(v: unknown): string | null {
  const s = str(v);
  return s && /^https?:\/\//i.test(s) ? s : null;
}

export type CenterLink = { label: string; url: string; sub: string | null };

export type CenterContact = {
  /** Where the center is, e.g. "Jain Center of Houston". */
  placeName: string | null;
  address: string | null;
  /** Parking, dress code… */
  addressNote: string | null;
  /** E.164 or display phone for "Call the office". */
  phone: string | null;
  /** Explicit directions link; otherwise one is built from the address. */
  mapUrl: string | null;
  links: CenterLink[];
};

/**
 * Contact details live in `centers.branding` (JSON the portal's Center settings
 * edit). Keys, all optional: place_name, address, address_note, phone,
 * map_url, website, links: [{label, url, sub}]. Anything missing is simply not
 * shown — never invented.
 */
export function readCenterContact(center: { branding?: unknown } | null | undefined): CenterContact {
  const b = asObj(center?.branding) ?? {};
  const links: CenterLink[] = [];
  const website = httpUrl(b.website);
  if (website) links.push({ label: website.replace(/^https?:\/\//i, '').replace(/\/$/, ''), url: website, sub: null });
  if (Array.isArray(b.links)) {
    for (const raw of b.links) {
      const o = asObj(raw);
      const url = httpUrl(o?.url);
      const label = str(o?.label) ?? str(o?.name);
      if (url && label && !links.some((l) => l.url === url)) links.push({ label, url, sub: str(o?.sub) ?? str(o?.description) });
    }
  }
  return {
    placeName: str(b.place_name),
    address: str(b.address),
    addressNote: str(b.address_note),
    phone: str(b.phone),
    mapUrl: httpUrl(b.map_url),
    links,
  };
}

export function directionsUrl(contact: Pick<CenterContact, 'address' | 'mapUrl'>): string | null {
  if (contact.mapUrl) return contact.mapUrl;
  if (!contact.address) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(contact.address)}`;
}

export function telUrl(phone: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/[^\d+]/g, '');
  return digits.replace(/\D/g, '').length >= 7 ? `tel:${digits}` : null;
}

/** Two-letter mark for a link or role tile: "YouTube" → "YO", "Vice President" → "VP". */
export function markFor(label: string): string {
  const words = label.replace(/[^A-Za-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

/**
 * The guide's "timings" page is center-authored Markdown. A two-column table
 * (| What | When |) becomes the prototype's timing rows; other lines stay as
 * a note under them.
 */
export function parseTimingsTable(md: string): { rows: { what: string; when: string }[]; note: string } {
  const rows: { what: string; when: string }[] = [];
  const rest: string[] = [];
  let headerSkipped = false;
  for (const line of md.replace(/\r\n/g, '\n').split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      const cells = trimmed.slice(1, -1).split('|').map((c) => c.trim());
      if (cells.every((c) => /^:?-{2,}:?$/.test(c))) continue;
      if (!headerSkipped) {
        headerSkipped = true;
        continue;
      }
      if (cells.length >= 2 && cells[0]) rows.push({ what: cells[0], when: cells.slice(1).join(' · ') });
    } else {
      rest.push(line);
    }
  }
  return { rows, note: rest.join('\n').trim() };
}

export type FirstSteps = { whatsapp: boolean; zone: boolean; membership: boolean; volunteer: boolean; ask: boolean };

export const FIRST_STEP_KEYS: (keyof FirstSteps)[] = ['whatsapp', 'zone', 'membership', 'volunteer', 'ask'];

export function firstStepsDone(s: FirstSteps): number {
  return FIRST_STEP_KEYS.filter((k) => s[k]).length;
}

export type RegistrationStatus = { kind: 'open' } | { kind: 'opens'; on: string } | { kind: 'closed' };

/** Open / Opens {date} / Closed from a registration window (ISO timestamps; null = unbounded). */
export function registrationStatus(opensAt: string | null, closesAt: string | null, now: Date): RegistrationStatus {
  if (opensAt && new Date(opensAt).getTime() > now.getTime()) return { kind: 'opens', on: opensAt.slice(0, 10) };
  if (closesAt && new Date(closesAt).getTime() <= now.getTime()) return { kind: 'closed' };
  return { kind: 'open' };
}

/** 'executive_committee' → 'Executive Committee'. */
export function rosterBodyLabel(body: string): string {
  const known: Record<string, string> = { executive_committee: 'Executive Committee', trustees: 'Trustees', board_of_trustees: 'Trustees' };
  if (known[body]) return known[body];
  return body
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ');
}

/** Replies-within copy from an inbox's response target. */
export function replyWithin(hours: number | null | undefined): 'day' | 'days' | null {
  if (hours == null || hours <= 0) return null;
  return hours <= 24 ? 'day' : 'days';
}

/** A short, stable reference from the thread id, e.g. "Q-3F2A1C". */
export function questionRef(threadId: string): string {
  return `Q-${threadId.replace(/-/g, '').slice(0, 6).toUpperCase()}`;
}

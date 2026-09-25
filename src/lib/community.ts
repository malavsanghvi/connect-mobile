/**
 * "Find your community" (connect-crm docs/ONBOARDING_PLAN.md §7): one shared
 * app for every organization. The member picks a community by searching its
 * name, typing a join code, or scanning a poster's QR code
 * (communityconnect://join/<code>, or an https …/join/<code> link). Pure
 * helpers only; data access is src/lib/api/community.ts.
 */

/** A join code as the database stores it ("7K4MQ2PD"), from anything a member might type, paste or scan; null when it is not one. */
export function parseJoinInput(raw: string | null | undefined): string | null {
  let v = (raw ?? '').trim();
  if (!v) return null;
  const link = v.match(/\/join\/([^/?#\s]+)/i);
  if (link) v = decodeURIComponent(link[1]);
  else if (/^[a-z][a-z0-9+.-]*:/i.test(v)) return null; // some other link (a ticket QR, a web page)
  const code = v.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return /^[A-Z0-9]{6,16}$/.test(code) ? code : null;
}

/** "7K4M-Q2PD" */
/**
 * Search results a member may pick: live communities only. The database never lists a sandbox
 * (app.find_community, owner decision 2026-09-25 #21); this keeps the screen honest even if a
 * sandbox ever came back — a sandbox opens with its join code only.
 */
export function searchableCommunities<T extends { sandbox: boolean }>(rows: readonly T[]): T[] {
  return rows.filter((r) => !r.sandbox);
}

export function formatJoinCode(code: string): string {
  const c = code.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return c.length === 8 ? `${c.slice(0, 4)}-${c.slice(4)}` : c;
}

export type CommunityChoice = { slug: string; name: string };

export function isCommunityChoice(v: unknown): v is CommunityChoice {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return typeof o.slug === 'string' && /^[a-z0-9][a-z0-9-]{0,62}$/.test(o.slug) && typeof o.name === 'string';
}

/**
 * Which community to open:
 *   the member's saved choice →
 *   the build's default (EXPO_PUBLIC_CENTER_SLUG) for an install that is already
 *   signed in (every existing JSH member keeps working, with no new step), or
 *   when the app was opened on a link into one of its screens (an event link,
 *   the sign-in page) — that link belongs to the build's community →
 *   none: a plain first launch shows "Find your community".
 * `openedAt` is the path the app was opened on ("/", "/events/…", "/join/…").
 */
export function communityToOpen(input: {
  saved: CommunityChoice | null;
  signedIn: boolean;
  defaultSlug: string;
  openedAt?: string | null;
}): string | null {
  if (input.saved) return input.saved.slug;
  if (input.signedIn) return input.defaultSlug;
  const path = (input.openedAt ?? '/').split(/[?#]/)[0].replace(/\/+$/, '') || '/';
  if (path !== '/' && !/^\/join(\/|$)/i.test(path)) return input.defaultSlug;
  return null;
}

/** The path of the URL the app was opened with ("/" when none): "https://app.x/events/1?a" → "/events/1", "communityconnect://join/AB" → "/join/AB". */
export function openedPath(url: string | null | undefined): string {
  const u = (url ?? '').trim();
  if (!u) return '/';
  const m = u.match(/^[a-z][a-z0-9+.-]*:\/\/([^/?#]*)(\/[^?#]*)?/i);
  if (!m) return u.startsWith('/') ? u.split(/[?#]/)[0] : '/';
  // communityconnect://join/AB: the "host" is the first path segment.
  const scheme = u.slice(0, u.indexOf(':')).toLowerCase();
  // Expo development URLs: exp://192.168.1.2:8081/--/events → "/events".
  if (scheme === 'exp' || scheme === 'exps') return (m[2] ?? '').replace(/^\/--/, '').replace(/\/+$/, '') || '/';
  if (scheme !== 'http' && scheme !== 'https') return `/${m[1]}${m[2] ?? ''}`.replace(/\/+$/, '') || '/';
  return m[2] || '/';
}

// ── Theming from the brand kit ───────────────────────────────────────────────

type Obj = Record<string, unknown>;
const HEX = /^#([0-9a-f]{6})$/i;

function asObj(v: unknown): Obj | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : null;
}

/** centers.branding colours: the brand kit's `colors.{primary, accent}`, or the older top-level `primary` / `accent`. */
export function brandColors(branding: unknown): { primary: string | null; accent: string | null } {
  const b = asObj(branding) ?? {};
  const kit = asObj(b.colors) ?? {};
  const pick = (...vals: unknown[]) => {
    for (const v of vals) if (typeof v === 'string' && HEX.test(v.trim())) return v.trim().toUpperCase();
    return null;
  };
  return { primary: pick(kit.primary, b.primary), accent: pick(kit.accent, b.accent) };
}

/** Mix two #RRGGBB colours: t = 0 → a, t = 1 → b. */
export function mixHex(a: string, b: string, t: number): string {
  const pa = HEX.exec(a);
  const pb = HEX.exec(b);
  if (!pa || !pb) return a;
  const na = Number.parseInt(pa[1], 16);
  const nb = Number.parseInt(pb[1], 16);
  const ch = (n: number, shift: number) => (n >> shift) & 255;
  const out = [16, 8, 0].map((s) => Math.round(ch(na, s) + (ch(nb, s) - ch(na, s)) * t));
  return `#${out.map((x) => x.toString(16).padStart(2, '0')).join('').toUpperCase()}`;
}

/**
 * The theme colours derived from a community's primary and accent. Only the
 * keys that change are returned; the default palette (JSH navy and saffron)
 * is kept for anything the brand kit does not set.
 */
export function brandPalette(branding: unknown): Record<string, string> {
  const { primary, accent } = brandColors(branding);
  const out: Record<string, string> = {};
  if (primary) {
    out.navy = primary;
    out.navyHover = mixHex(primary, '#000000', 0.35);
    out.navyPanel = mixHex(primary, '#FFFFFF', 0.12);
    out.navyPanel2 = mixHex(primary, '#FFFFFF', 0.06);
    out.navyTint = mixHex(primary, '#FFFFFF', 0.92);
    out.navyTint2 = mixHex(primary, '#FFFFFF', 0.89);
    out.navyBorder = mixHex(primary, '#FFFFFF', 0.68);
    out.navyDisabled = mixHex(primary, '#FFFFFF', 0.45);
    out.onNavy = mixHex(primary, '#FFFFFF', 0.78);
  }
  if (accent) out.saffron = accent;
  return out;
}

/** Public URL of a brand-kit file in the `branding` storage bucket (paths start with the center id). */
export function brandAssetUrl(path: unknown, supabaseUrl: string): string | null {
  if (typeof path !== 'string' || !path.trim() || !supabaseUrl) return null;
  const clean = path.trim().replace(/^\/+/, '');
  if (clean.includes('..')) return null;
  return `${supabaseUrl.replace(/\/+$/, '')}/storage/v1/object/public/branding/${clean.split('/').map(encodeURIComponent).join('/')}`;
}

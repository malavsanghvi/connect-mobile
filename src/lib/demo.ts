/**
 * "Try the demo": the pure rules. No network and no React here; the portal calls and the two database checks are in
 * src/lib/api/demo.ts, the app-wide state is src/providers/demo.tsx, and the portal side is connect-crm
 * (docs/DEMO_SIGNIN.md, docs/MEMBER_APP_DEMO.md).
 *
 * A demo is a real sign-in of an invented person in a demo community. It lasts two hours, the community starts over every
 * night, and nothing in it reaches a real person. The database (app.demo_session_state, app.demo_leave) decides when it ends;
 * the app only reads those answers and words them for people.
 */

/** The reserved address domain of every demo sign-in (nobody receives mail there). Mirrors connect-crm app.demo_persona_domain(). */
export const DEMO_EMAIL_DOMAIN = 'demo.weaverams.org';

const SLUG = /^[a-z0-9][a-z0-9-]{0,62}$/;

/** True for something that can be a community's web name ("sunrise-worship-demo"), false for a display name with spaces and capitals. */
export function isSlug(v: unknown): v is string {
  return typeof v === 'string' && SLUG.test(v);
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

// ── Who is a demo sign-in ────────────────────────────────────────────────────

/** A signed-in login as the app holds it (Supabase auth user): only the two fields the check reads. */
export type DemoLogin = { email?: string | null; app_metadata?: unknown } | null | undefined;

/**
 * True for a demo person's login: the address is exactly on the demo domain, or the token's app_metadata says demo (the database sets
 * that flag and a person cannot edit their own app_metadata). The same test the portal's proxy makes (connect-crm isDemoClaims).
 */
export function isDemoLogin(login: DemoLogin): boolean {
  if (!login) return false;
  const email = str(login.email).trim().toLowerCase();
  const at = email.lastIndexOf('@');
  if (at > 0 && email.slice(at + 1) === DEMO_EMAIL_DOMAIN) return true;
  const meta = login.app_metadata;
  return !!meta && typeof meta === 'object' && (meta as { demo?: unknown }).demo === true;
}

/** Is the app being opened on the demo address (`/demo`, `connect://demo`)? `path` is the opened path from openedPath(). */
export function isDemoPath(path: string | null | undefined): boolean {
  return /^\/demo\/?$/i.test((path ?? '').split(/[?#]/)[0]);
}

/**
 * What a demo link asks for, besides opening the demo communities (docs/DEMO.md, "Deep links"):
 *  - `?persona=<id>`: start as exactly this person (an id from GET /api/demo/choices, which the portal's /demo page links to);
 *  - `?as=family`: start as the family's main adult of the first demo community, or of the one `&community=<web name>` names;
 *  - an id that cannot be an id is `unknown_person` (nothing is sent to the portal for it).
 * `persona` wins when both are there. Anything else (`/demo`, `?as=teacher`) is a plain visit: the chooser, nothing started.
 */
export type DemoLink = { kind: 'persona'; persona: string } | { kind: 'family'; community: string | null } | { kind: 'unknown_person' };

const PERSONA_ID = /^[A-Za-z0-9_-]{1,80}$/;

/** One piece of a query, decoded; a bad escape keeps the raw text. */
function unescapeQuery(s: string): string {
  const spaced = s.replace(/\+/g, ' ');
  try {
    return decodeURIComponent(spaced);
  } catch {
    return spaced;
  }
}

/** The query of a link as name → first value ("connect://demo?as=family&community=x#top"). */
function queryOf(url: string): Map<string, string> {
  const out = new Map<string, string>();
  const noHash = url.split('#')[0];
  const at = noHash.indexOf('?');
  if (at < 0) return out;
  for (const pair of noHash.slice(at + 1).split('&')) {
    if (!pair) continue;
    const eq = pair.indexOf('=');
    const name = unescapeQuery(eq < 0 ? pair : pair.slice(0, eq));
    if (!out.has(name)) out.set(name, eq < 0 ? '' : unescapeQuery(pair.slice(eq + 1)));
  }
  return out;
}

/**
 * Reads a link the app was opened with (`https://app.weaverams.org/demo?as=family`, `connect://demo?persona=…`). `path` is that link's
 * path from openedPath(). Null when it is not the demo address or asks for nothing to be started.
 */
export function parseDemoLink(url: string | null | undefined, path: string | null | undefined): DemoLink | null {
  if (!url || !isDemoPath(path)) return null;
  const query = queryOf(url);
  const persona = (query.get('persona') ?? '').trim();
  if (persona) return PERSONA_ID.test(persona) ? { kind: 'persona', persona } : { kind: 'unknown_person' };
  if ((query.get('as') ?? '').trim().toLowerCase() !== 'family') return null;
  return { kind: 'family', community: (query.get('community') ?? '').trim().toLowerCase().slice(0, 80) || null };
}

// ── The people to choose from ────────────────────────────────────────────────

export type DemoKind = 'faith' | 'neutral';
export const DEMO_KINDS: readonly DemoKind[] = ['faith', 'neutral'];

export type DemoArea = 'community' | 'operations';

export type DemoPerson = {
  id: string;
  /** The role as the portal words it ("Teacher", "Community member · Adult"). */
  role: string;
  name: string;
  /** One sentence about who this person is. */
  story: string;
  /** Which area of the demo this person belongs to (the portal sends it); null from a portal that does not yet. */
  area: DemoArea | null;
};
export type DemoCommunity = {
  kind: DemoKind;
  name: string;
  /** The community's id and web name, which the portal sends so the app can open it as a guest. Null from a portal that does not yet. */
  id: string | null;
  slug: string | null;
  people: DemoPerson[];
};
export type DemoChoices = {
  enabled: boolean;
  communities: DemoCommunity[];
  /** The portal's own sentence when the demo is switched off or nothing is set up ("The demo is switched off right now. Please try again later."). */
  message: string | null;
};

/** The demo community this device is looking around in as a guest (no sign-in): what the app opens and what the banner names. */
export type DemoGuest = { slug: string; name: string };

export function isDemoGuest(v: unknown): v is DemoGuest {
  return !!v && typeof v === 'object' && isSlug((v as Record<string, unknown>).slug) && typeof (v as Record<string, unknown>).name === 'string';
}

/** Is this demo community one that can be opened as a guest? (It needs the web name the portal sends.) */
export function canOpenAsGuest(c: DemoCommunity): c is DemoCommunity & { slug: string } {
  return isSlug(c.slug);
}

/** How the app is in the demo: not at all, looking around as a guest (no sign-in), or signed in as a demo person. */
export type DemoMode = 'off' | 'guest' | 'person';

const areaOf = (v: unknown): DemoArea | null => (v === 'community' || v === 'operations' ? v : null);

/** Reads GET /api/demo/choices. Null when the answer is not in the shape the portal promises; a person or community that is not usable is left out. */
export function parseChoices(raw: unknown): DemoChoices | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (o.ok === false) return null;
  if (typeof o.enabled !== 'boolean') return null;
  const communities: DemoCommunity[] = [];
  for (const c of Array.isArray(o.communities) ? o.communities : []) {
    if (!c || typeof c !== 'object') continue;
    const cr = c as Record<string, unknown>;
    if (cr.kind !== 'faith' && cr.kind !== 'neutral') continue;
    const people: DemoPerson[] = [];
    for (const p of Array.isArray(cr.people) ? cr.people : []) {
      if (!p || typeof p !== 'object') continue;
      const r = p as Record<string, unknown>;
      const id = str(r.id);
      if (!id || !str(r.role) || !str(r.name)) continue;
      people.push({ id, role: str(r.role), name: str(r.name), story: str(r.story), area: areaOf(r.area) });
    }
    // A community with no people yet can still be looked around as a guest, when the portal names it.
    if (people.length > 0 || isSlug(cr.slug)) communities.push({ kind: cr.kind, name: str(cr.name), id: str(cr.id) || null, slug: isSlug(cr.slug) ? cr.slug : null, people });
  }
  communities.sort((a, b) => DEMO_KINDS.indexOf(a.kind) - DEMO_KINDS.indexOf(b.kind));
  return { enabled: o.enabled, communities, message: portalSentence(o.message) };
}

/**
 * The people of a community in the sections the chooser shows, in this order: Community roles (the member app's own people) first,
 * then Non-profit operational roles. The portal has already decided who is offered; this only groups them, keeping its order inside
 * a section. A person with no area (an older portal) goes in a last section with no heading, which is the only section when nobody
 * has an area: then the chooser shows one plain list.
 */
export type PeopleSection = { area: DemoArea | null; people: DemoPerson[] };

export function sectionsByArea(people: readonly DemoPerson[]): PeopleSection[] {
  const sections: PeopleSection[] = [
    { area: 'community', people: people.filter((p) => p.area === 'community') },
    { area: 'operations', people: people.filter((p) => p.area === 'operations') },
    { area: null, people: people.filter((p) => p.area === null) },
  ];
  return sections.filter((s) => s.people.length > 0);
}

// ── The family to start as (one tap: "Start as a community member") ─────────────

const ADULT = /\badult\b/i;
const MEMBER_ROLE = /\b(community member|family)\b/i;

/**
 * The person "Start as a community member" signs in as: the family's main adult. Chosen by AREA first (the portal puts the member app's
 * own people in `community`), then by ROLE (an adult before any other role of that area, else the first the portal lists). A portal that
 * sends no areas is read by role alone. No name or id is known to the app: the portal's list decides who exists. Null when nobody fits.
 */
export function familyPerson(people: readonly DemoPerson[]): DemoPerson | null {
  const inArea = people.filter((p) => p.area === 'community');
  const pool = inArea.length > 0 ? inArea : people.filter((p) => p.area === null && MEMBER_ROLE.test(p.role));
  return pool.find((p) => ADULT.test(p.role)) ?? pool[0] ?? null;
}

export type FamilyPick = { ok: true; community: DemoCommunity; person: DemoPerson } | { ok: false; code: 'unknown_community' | 'no_family' };

/**
 * Who `?as=family` starts as: the family person of the community named by its web name, else of the first community (faith-based first,
 * as the portal sorts them) that has one.
 */
export function pickFamily(choices: DemoChoices, communitySlug?: string | null): FamilyPick {
  if (communitySlug) {
    const community = choices.communities.find((c) => c.slug === communitySlug);
    if (!community) return { ok: false, code: 'unknown_community' };
    const person = familyPerson(community.people);
    return person ? { ok: true, community, person } : { ok: false, code: 'no_family' };
  }
  for (const community of choices.communities) {
    const person = familyPerson(community.people);
    if (person) return { ok: true, community, person };
  }
  return { ok: false, code: choices.communities.length > 0 ? 'no_family' : 'unknown_community' };
}

// ── Starting ─────────────────────────────────────────────────────────────────

export type DemoTokens = { access_token: string; refresh_token: string };
export type DemoStartInfo = { endsAt: string; role: string; name: string; community: string };

/**
 * Why a start did not happen. `off`, `limit`, `unknown_person` and `failed` are the portal's own codes (connect-crm docs/MEMBER_APP_DEMO.md);
 * `network` and `unreadable` are the app's (nothing answered, or the answer was not what was promised), and so are `unknown_community`
 * and `no_family` (a link named a demo community that is not on the list, or one with no family to start as).
 */
export type DemoFailureCode = 'off' | 'limit' | 'unknown_person' | 'failed' | 'network' | 'unreadable' | 'unknown_community' | 'no_family';

/** Does trying the same start again make sense? Not when the person or the community is not on the list: choosing another is the way on. */
export function canRetryStart(code: DemoFailureCode): boolean {
  return code !== 'unknown_person' && code !== 'unknown_community' && code !== 'no_family';
}

/** The portal's code, from what it sent. The names of an earlier draft of the contract (`ip_limit`, `busy`, `not_ready`, `unknown_persona`) read the same. */
export function portalCode(v: unknown): DemoFailureCode | null {
  switch (v) {
    case 'off':
    case 'not_ready':
      return 'off';
    case 'limit':
    case 'ip_limit':
    case 'busy':
      return 'limit';
    case 'unknown_person':
    case 'unknown_persona':
      return 'unknown_person';
    case 'failed':
      return 'failed';
    default:
      return null;
  }
}

/**
 * The portal's own sentence ("Could not start the demo — you have started a lot of demos in the last hour. Please wait a while, then try
 * again."): the same wording its web flow shows, written for people, so it is shown as it is. Null when there is none, or it is too long
 * to be a sentence.
 */
export function portalSentence(text: unknown): string | null {
  const s = typeof text === 'string' ? text.trim() : '';
  return s && s.length <= 300 ? s : null;
}

const COULD_NOT = "We couldn't start the demo — ";

/** A failed start in plain words, for when the portal sent no sentence of its own (or never answered). */
export function startFailureMessage(code: DemoFailureCode): string {
  switch (code) {
    case 'off':
      return `${COULD_NOT}the demo is switched off right now. Please try again later.`;
    case 'limit':
      return `${COULD_NOT}you have started a lot of demos in the last hour. Please wait a while, then try again.`;
    case 'unknown_person':
      return `${COULD_NOT}that person is not available. Choose someone else.`;
    case 'unknown_community':
      return `${COULD_NOT}that demo community is not available. Choose one below.`;
    case 'no_family':
      return `${COULD_NOT}there is no family to start as in that community. Choose someone else.`;
    case 'network':
      return `${COULD_NOT}we could not reach the demo. Check your internet connection and try again.`;
    case 'unreadable':
      return `${COULD_NOT}the answer was not what we expected. Please try again in a minute.`;
    case 'failed':
      return `${COULD_NOT}something went wrong. Please try again.`;
  }
}

// ── The check while a demo runs ──────────────────────────────────────────────

export type DemoOk = {
  state: 'ok';
  secondsLeft: number;
  endsAt: string | null;
  role: string;
  name: string;
  centerName: string;
  centerSlug: string;
};
/** Anything but ok: the demo is over (ended or ran out), switched off, not on record, or this login is not a demo at all. */
export type DemoOver = { state: 'ended' | 'expired' | 'off' | 'unknown' | 'not_demo' };
export type DemoState = DemoOk | DemoOver;

const OVER: readonly string[] = ['ended', 'expired', 'off', 'unknown', 'not_demo'];

/** Reads app.demo_session_state(). Null when the answer is not in the shape the database promises (not a verdict: the check is tried again). */
export function parseDemoState(raw: unknown): DemoState | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const state = str(o.state);
  if (OVER.includes(state)) return { state } as DemoOver;
  if (state !== 'ok') return null;
  const left = typeof o.seconds_left === 'number' ? o.seconds_left : Number(o.seconds_left);
  if (!Number.isFinite(left) || !isSlug(o.center_slug)) return null;
  return {
    state: 'ok',
    secondsLeft: Math.max(0, Math.floor(left)),
    endsAt: str(o.expires_at) || null,
    role: str(o.role),
    name: str(o.name),
    centerName: str(o.center_name),
    centerSlug: o.center_slug,
  };
}

/** The demo we know about on this device: what the banner shows and which community to open. */
export type DemoInfo = {
  role: string;
  name: string;
  community: string;
  /** The community's web name: the app opens this community for as long as the demo runs. */
  slug: string;
  /** When the demo ends, as a clock time on THIS device (ms): the server's seconds left, added to the device clock when they were read. */
  deadline: number;
};

export function isDemoInfo(v: unknown): v is DemoInfo {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return typeof o.role === 'string' && typeof o.name === 'string' && typeof o.community === 'string' && isSlug(o.slug) && typeof o.deadline === 'number' && Number.isFinite(o.deadline);
}

export function infoFromState(state: DemoOk, now: number): DemoInfo {
  return { role: state.role, name: state.name, community: state.centerName, slug: state.centerSlug, deadline: now + state.secondsLeft * 1000 };
}

/** Seconds left until the deadline, never below 0. */
export function secondsUntil(deadline: number, now: number): number {
  return Math.max(0, Math.round((deadline - now) / 1000));
}

/** "1 h 42 min left" / "35 min left" / "less than a minute left" (the portal's own wording). */
export function timeLeftText(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  if (s < 60) return 'less than a minute left';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h} h ${m} min left` : `${m} min left`;
}

/** How often a running demo is checked with the database (ms), besides when the app comes back to the foreground. */
export const DEMO_CHECK_MS = 60_000;

/** Why a demo is over, for the sentence on the chooser. */
export type DemoEnd = 'ended' | 'off';

export function endFor(state: DemoOver['state']): DemoEnd {
  return state === 'off' ? 'off' : 'ended';
}

// ── What a demo person must not do ───────────────────────────────────────────

/**
 * The account actions that are turned off while a demo runs (owner request 2026-10-14): nothing here may change a login, reach a real
 * person or ask a phone for permissions. The database refuses real messages from a demo community anyway; these are the app's own
 * layer, so the screens say so instead of failing. Everything else (RSVPs, pledges, the store, learning) works as for any member.
 */
export type DemoLimited =
  | 'changeContact' // change the email, phone or password of the login (and the contact details that go with it)
  | 'deleteAccount'
  | 'deactivateAccount'
  | 'push' // asking the phone for notification permission, registering it for push
  | 'sendMessage' // a message to a team inbox (the office, a zone lead, a role)
  | 'dataRequest' // "Download my data" (a request to the privacy officer)
  | 'switchCommunity'; // leaving the demo community for another one while still the demo person

export const DEMO_LIMITED: readonly DemoLimited[] = ['changeContact', 'deleteAccount', 'deactivateAccount', 'push', 'sendMessage', 'dataRequest', 'switchCommunity'];

/** May this be done? Always, outside a demo; in a demo, none of the limited actions. */
export function demoAllows(demoActive: boolean, action: DemoLimited): boolean {
  return !demoActive || !DEMO_LIMITED.includes(action);
}

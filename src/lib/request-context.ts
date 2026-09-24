/**
 * Traceability headers (WAVE2 contract › Member app). Every PostgREST request
 * carries who-is-asking context that `app.audit_row()` copies into the audit
 * log:
 *
 *   x-client-app     member | kiosk        (kiosk while the volunteer board is in kiosk mode)
 *   x-request-id     a fresh uuid per request (the audit row's correlation id)
 *   x-client-screen  the current route pathname (set from the root layout)
 *   x-audit-reason   only on requests where the member gave a reason (`withAuditReason`)
 *
 * The headers are added by a fetch wrapper for `/rest/v1/` calls only: the
 * audit trigger only sees PostgREST writes, and the Edge Functions' CORS
 * allow-list would reject unknown headers on web.
 *
 * Everything here is pure or module-level state, so it is unit-tested
 * without React Native.
 */

import { logError } from './errors';

export type ClientApp = 'member' | 'kiosk';

export const HEADER_CLIENT_APP = 'x-client-app';
export const HEADER_REQUEST_ID = 'x-request-id';
export const HEADER_CLIENT_SCREEN = 'x-client-screen';
export const HEADER_AUDIT_REASON = 'x-audit-reason';

/** Limits from the contract (the database trims too; we never send more). */
export const MAX_SCREEN_LENGTH = 200;
export const MAX_REASON_LENGTH = 500;

let currentScreen = '';
let currentApp: ClientApp = 'member';

/** Called by the root layout whenever the route changes. */
export function setClientScreen(pathname: string | null | undefined): void {
  currentScreen = pathname ?? '';
}

/** The volunteer board flips this to 'kiosk' while kiosk mode is on and back to 'member' on exit. */
export function setClientApp(app: ClientApp): void {
  currentApp = app;
}

export function getClientContext(): { app: ClientApp; screen: string } {
  return { app: currentApp, screen: currentScreen };
}

type RandomBytes = (n: number) => Uint8Array;

function defaultRandomBytes(n: number): Uint8Array {
  const out = new Uint8Array(n);
  const c = (globalThis as { crypto?: { getRandomValues?: (a: Uint8Array) => Uint8Array } }).crypto;
  if (c?.getRandomValues) {
    c.getRandomValues(out);
    return out;
  }
  // Hermes has no Web Crypto. A request id only has to be unique enough to
  // correlate log rows, not unguessable, so Math.random is acceptable here.
  for (let i = 0; i < n; i++) out[i] = Math.floor(Math.random() * 256);
  return out;
}

/** RFC 4122 version-4 uuid (the database only accepts `x-request-id` when it is a valid uuid). */
export function newRequestId(randomBytes: RandomBytes = defaultRandomBytes): string {
  const b = randomBytes(16);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const hex = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Header-safe screen value: at most 200 characters, and ASCII only (non-Latin
 * route segments are percent-encoded; browsers reject other header bytes).
 */
export function screenHeaderValue(pathname: string): string {
  let encoded: string;
  try {
    encoded = encodeURI(pathname);
  } catch (err) {
    // A lone surrogate can't be encoded; keep only the printable ASCII characters.
    logError('encoding the screen name for the audit header (sending the ASCII part only)', err);
    encoded = pathname.replace(/[^\x20-\x7e]/g, '');
  }
  return encoded.slice(0, MAX_SCREEN_LENGTH);
}

/**
 * Value for `x-audit-reason`: trimmed, at most 500 characters, url-encoded
 * (the database url-decodes it). Null when there is no reason to send.
 */
export function auditReasonHeader(reason: string | null | undefined): string | null {
  const text = (reason ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return null;
  return encodeURIComponent(Array.from(text).slice(0, MAX_REASON_LENGTH).join(''));
}

/** True for PostgREST calls (`{supabaseUrl}/rest/v1/...`), the only ones that reach the audit trigger. */
export function isRestRequest(url: string, supabaseUrl: string): boolean {
  const base = supabaseUrl.replace(/\/+$/, '');
  return url.startsWith(`${base}/rest/v1/`) || url === `${base}/rest/v1`;
}

/** Headers to add to one request. Existing headers of the same name win (e.g. a reason set per query). */
export function traceHeaders(ctx: { app: ClientApp; screen: string }, requestId: string): Record<string, string> {
  const out: Record<string, string> = {
    [HEADER_CLIENT_APP]: ctx.app,
    [HEADER_REQUEST_ID]: requestId,
  };
  const screen = screenHeaderValue(ctx.screen);
  if (screen) out[HEADER_CLIENT_SCREEN] = screen;
  return out;
}

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function urlOf(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  return (input as Request).url;
}

/**
 * fetch for the Supabase client: PostgREST requests get the trace headers,
 * everything else (auth, storage, functions) is passed through untouched.
 * `baseFetch` is resolved per call so tests and polyfills can swap it.
 */
export function createTracingFetch(supabaseUrl: string, baseFetch: () => FetchLike = () => fetch): FetchLike {
  return (input, init) => {
    const doFetch = baseFetch();
    if (!isRestRequest(urlOf(input), supabaseUrl)) return doFetch(input, init);
    const headers = new Headers(init?.headers ?? (typeof input === 'object' && !(input instanceof URL) ? (input as Request).headers : undefined));
    for (const [name, value] of Object.entries(traceHeaders(getClientContext(), newRequestId()))) {
      if (!headers.has(name)) headers.set(name, value);
    }
    return doFetch(input, { ...init, headers });
  };
}

type HeaderSettable = { setHeader(name: string, value: string): unknown };

/**
 * Attach the member's reason to one PostgREST query or RPC call, so the audit
 * row for that change carries it:
 *
 *   check(await withAuditReason(supabase.from('rsvps').update(...).eq('id', id), 'Cancelled: can't make it'), ...)
 */
export function withAuditReason<Q extends HeaderSettable>(query: Q, reason: string | null | undefined): Q {
  const value = auditReasonHeader(reason);
  if (value) query.setHeader(HEADER_AUDIT_REASON, value);
  return query;
}

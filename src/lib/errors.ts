/**
 * Error surfacing rule (connect-crm/docs/ARCHITECTURE.md): every failure is
 * shown to the member in plain English, with a retry where one exists. The
 * technical detail is logged, never shown raw and never swallowed.
 */

export class AppError extends Error {
  /** Plain-English message that is safe to show to a member. */
  readonly userMessage: string;
  /** Technical detail for logs (PostgREST / auth / network message). */
  readonly detail: string;
  readonly code: string | null;

  constructor(userMessage: string, detail: string, code: string | null = null) {
    super(userMessage);
    this.name = 'AppError';
    this.userMessage = userMessage;
    this.detail = detail;
    this.code = code;
  }
}

type ErrorLike = { message?: unknown; code?: unknown; details?: unknown; hint?: unknown; status?: unknown; name?: unknown };

function asErrorLike(err: unknown): ErrorLike {
  if (err && typeof err === 'object') return err as ErrorLike;
  return { message: String(err) };
}

function capitalize(s: string): string {
  return s.length ? s[0].toUpperCase() + s.slice(1) : s;
}

function withPeriod(s: string): string {
  return /[.!?]$/.test(s) ? s : `${s}.`;
}

/** Turns "pledge must be at least 50100" (cents, from place_boli_entry) into dollars. */
function centsInRpcMessage(msg: string): string {
  return msg.replace(/at least (\d+)$/i, (_m, cents: string) => {
    const n = Number(cents);
    const dollars = n % 100 === 0 ? String(n / 100) : (n / 100).toFixed(2);
    return `at least $${dollars.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
  });
}

/**
 * Map any thrown value (PostgREST error, auth error, network TypeError …) to
 * an AppError with a member-facing sentence. `action` is a short verb phrase
 * such as "load your events" or "save your RSVP".
 */
export function toAppError(err: unknown, action: string): AppError {
  if (err instanceof AppError) return err;
  const e = asErrorLike(err);
  const message = typeof e.message === 'string' ? e.message : '';
  const code = typeof e.code === 'string' ? e.code : e.code != null ? String(e.code) : null;
  const detail = [message, typeof e.details === 'string' ? e.details : '', typeof e.hint === 'string' ? e.hint : '', code ? `code=${code}` : '']
    .filter(Boolean)
    .join(' | ');
  const lower = message.toLowerCase();

  if (lower.includes('network request failed') || lower.includes('failed to fetch') || lower.includes('networkerror') || lower.includes('load failed') || (e.name === 'TypeError' && lower.includes('fetch'))) {
    return new AppError(`We couldn't ${action}. Check your internet connection and try again.`, detail || 'network error', code);
  }
  if (lower.includes('jwt expired') || lower.includes('invalid jwt') || code === 'PGRST301' || code === 'PGRST303') {
    return new AppError('Your sign-in has expired. Please sign in again.', detail, code);
  }
  // Auth (GoTrue) messages
  if (lower.includes('token has expired or is invalid') || lower.includes('otp has expired') || lower.includes('invalid otp')) {
    return new AppError("That code is wrong or has expired. Check it, or send a new code.", detail, code);
  }
  const wait = lower.match(/after (\d+) seconds?/);
  if (lower.includes('security purposes') && wait) {
    return new AppError(`Please wait ${wait[1]} seconds before asking for another code.`, detail, code);
  }
  if (lower.includes('rate limit') || code === 'over_email_send_rate_limit' || code === 'over_sms_send_rate_limit' || e.status === 429) {
    return new AppError('Too many attempts. Please wait a minute and try again.', detail, code);
  }
  if (lower.includes('signups not allowed') || lower.includes('signup is disabled')) {
    return new AppError('New sign-ups are turned off for this center. Please contact the office.', detail, code);
  }
  if (lower.includes('sms') && (lower.includes('provider') || lower.includes('unsupported'))) {
    return new AppError("We can't send text messages right now. Please sign in with your email instead.", detail, code);
  }
  // Postgres / PostgREST
  if (code === '42501' || lower.includes('row-level security') || lower.includes('permission denied')) {
    return new AppError(`You don't have permission to ${action}. If you think this is a mistake, please contact the office.`, detail, code);
  }
  if (code === 'PGRST116') {
    return new AppError(`We couldn't ${action} — it may have been removed.`, detail, code);
  }
  if (code === '23505') {
    return new AppError(`We couldn't ${action} because it already exists.`, detail, code);
  }
  if (code === '23514' || code === '22P02' || code === '22007' || code === '22008') {
    return new AppError(`We couldn't ${action} — one of the values isn't valid. Please check and try again.`, detail, code);
  }
  // Business-rule messages raised by our security-definer RPCs are written for people.
  if (code === 'P0001' && message) {
    return new AppError(withPeriod(capitalize(centsInRpcMessage(message))), detail, code);
  }
  return new AppError(`Something went wrong while trying to ${action}. Please try again.`, detail || 'unknown error', code);
}

/** Log the technical detail of a failure. The member sees `userMessage`. */
export function logError(context: string, err: unknown): void {
  const e = err instanceof AppError ? `${err.userMessage} :: ${err.detail}` : err;
  console.error(`[connect] ${context}:`, e);
}

/** Convert + log in one step. Use in catch blocks that surface to the UI. */
export function report(err: unknown, action: string): AppError {
  // AppErrors are logged where they are created (must() or explicit validation).
  if (err instanceof AppError) return err;
  const appErr = toAppError(err, action);
  logError(action, appErr);
  return appErr;
}

type SupabaseResult = { data: unknown; error: unknown };

/** Unwrap a supabase-js result that must carry data, or throw an AppError describing `action`. */
export function must<R extends SupabaseResult>(res: R, action: string): NonNullable<R['data']> {
  if (res.error) throw report(res.error, action);
  if (res.data === null || res.data === undefined) {
    const err = new AppError(`We couldn't ${action} — the server returned nothing. Please try again.`, `null data for "${action}"`);
    logError(action, err);
    throw err;
  }
  return res.data as NonNullable<R['data']>;
}

/** Like must(), for maybeSingle() lookups where "no row" is a normal answer. */
export function maybe<R extends SupabaseResult>(res: R, action: string): NonNullable<R['data']> | null {
  if (res.error) throw report(res.error, action);
  return (res.data ?? null) as NonNullable<R['data']> | null;
}

/** For writes and void RPCs: only the error matters. */
export function check(res: { error: unknown }, action: string): void {
  if (res.error) throw report(res.error, action);
}

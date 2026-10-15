import {
  isDemoLogin,
  parseChoices,
  parseDemoState,
  portalCode,
  portalSentence,
  startFailureMessage,
  type DemoChoices,
  type DemoFailureCode,
  type DemoStartInfo,
  type DemoState,
  type DemoTokens,
} from '../demo';
import { env } from '../env';
import { AppError, check, logError, report } from '../errors';
import { supabase } from '../supabase';

/**
 * "Try the demo": the two portal calls (connect-crm /api/demo/choices and /api/demo/session) and the two database calls a running
 * demo makes (app.demo_session_state, app.demo_leave). The rules and the wording are in src/lib/demo.ts.
 *
 * The portal calls carry no sign-in and no custom header (a plain GET and a JSON POST), so the browser build can make them from
 * app.weaverams.org under the portal's CORS rule.
 */

/** A call to the portal that has not answered by now is given up on (ms). */
export const DEMO_TIMEOUT_MS = 20_000;

type PortalAnswer = { status: number; body: unknown };

/** One call to the portal. Throws only when nothing answered (offline, refused, timed out); an HTTP error status is an answer. */
async function portal(path: string, init?: { method: 'POST'; json: unknown }): Promise<PortalAnswer> {
  const controller = typeof AbortController === 'undefined' ? null : new AbortController();
  const timer = controller ? setTimeout(() => controller.abort(), DEMO_TIMEOUT_MS) : null;
  try {
    const res = await fetch(`${env.demoUrl}${path}`, {
      method: init ? 'POST' : 'GET',
      ...(init ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(init.json) } : {}),
      ...(controller ? { signal: controller.signal } : {}),
    });
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    return { status: res.status, body };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** The portal's sentence from its own error shape ({ ok: false, error, code }); a proxy's or a gateway's error body (no `ok: false`) is not the portal speaking. */
function portalError(body: unknown): string | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const o = body as Record<string, unknown>;
  return o.ok === false ? portalSentence(o.error) : null;
}

/** Who can be tried: the demo communities and their people. Throws an AppError (plain English) when it cannot be read. */
export async function loadDemoChoices(): Promise<DemoChoices> {
  if (!env.demoUrl) throw new AppError('The demo is not set up in this app.', 'no demo address (EXPO_PUBLIC_DEMO_URL / EXPO_PUBLIC_PORTAL_URL)');
  let answer: PortalAnswer;
  try {
    answer = await portal('/api/demo/choices');
  } catch (err) {
    const e = new AppError("We couldn't load the demo. Check your internet connection and try again.", String(err));
    logError('load the demo people', e);
    throw e;
  }
  const choices = answer.status >= 200 && answer.status < 300 ? parseChoices(answer.body) : null;
  if (!choices) {
    // The portal's own sentence when it sent one ("Could not load the demo — the list of demo people could not be loaded. Please try again in a minute.").
    const own = portalError(answer.body);
    if (own) {
      const e = new AppError(own, `choices ${answer.status}: ${own}`);
      logError('load the demo people', e);
      throw e;
    }
    const e = new AppError("We couldn't load the demo — the answer was not what we expected. Please try again in a minute.", `choices ${answer.status}: ${JSON.stringify(answer.body)?.slice(0, 200)}`);
    logError('load the demo people', e);
    throw e;
  }
  return choices;
}

export type DemoStartResult = { ok: true; session: DemoTokens; demo: DemoStartInfo } | { ok: false; code: DemoFailureCode; message: string };

/** A failed start: the portal's own sentence as it is (the wording of its web flow), else the app's, for the code. The detail is logged, never shown. */
function fail(code: DemoFailureCode, serverText: string | null, detail: string): DemoStartResult {
  const message = portalSentence(serverText) ?? startFailureMessage(code);
  logError('start the demo', new AppError(message, detail, code));
  return { ok: false, code, message };
}

/**
 * Asks the portal to start a demo as this person. It returns the tokens of a real sign-in (the portal checks the switch and the
 * limits and records the session); the caller stores them with supabase.auth.setSession. Never throws: a refusal or a failure is a
 * result with a plain sentence.
 */
export async function startDemo(persona: string): Promise<DemoStartResult> {
  if (!env.demoUrl) return fail('failed', null, 'no demo address (EXPO_PUBLIC_DEMO_URL / EXPO_PUBLIC_PORTAL_URL)');
  let answer: PortalAnswer;
  try {
    answer = await portal('/api/demo/session', { method: 'POST', json: { persona } });
  } catch (err) {
    return fail('network', null, String(err));
  }
  const o = answer.body && typeof answer.body === 'object' && !Array.isArray(answer.body) ? (answer.body as Record<string, unknown>) : null;
  if (!o) return fail(answer.status >= 500 || answer.status === 0 ? 'failed' : 'unreadable', null, `session ${answer.status}: no readable body`);

  if (o.ok === true) {
    const s = o.session && typeof o.session === 'object' ? (o.session as Record<string, unknown>) : null;
    const access = typeof s?.access_token === 'string' ? s.access_token : '';
    const refresh = typeof s?.refresh_token === 'string' ? s.refresh_token : '';
    if (!access || !refresh) return fail('unreadable', null, `session ${answer.status}: ok without tokens (keys: ${Object.keys(o).join(',')})`);
    const d = o.demo && typeof o.demo === 'object' ? (o.demo as Record<string, unknown>) : {};
    const text = (v: unknown): string => (typeof v === 'string' ? v : '');
    return { ok: true, session: { access_token: access, refresh_token: refresh }, demo: { endsAt: text(d.ends_at), role: text(d.role), name: text(d.name), community: text(d.community) } };
  }

  const serverText = portalError(o);
  const code = portalCode(o.code) ?? (answer.status === 429 ? 'limit' : 'failed');
  return fail(code, serverText, `session ${answer.status}: ${String(o.code ?? 'no code')} ${serverText ?? 'no reason given'}`);
}

/**
 * The database's verdict on the signed-in demo person's session (app.demo_session_state): ok with the time left, or why the demo is
 * over. Throws an AppError when the question itself could not be answered (offline, a server error): that is not a verdict, the
 * caller keeps the demo and asks again.
 */
export async function checkDemoState(): Promise<DemoState> {
  const { data, error } = await supabase.rpc('demo_session_state');
  if (error) throw report(error, 'check the demo');
  const state = parseDemoState(data);
  if (!state) {
    const e = new AppError("We couldn't check the demo — the answer was not what we expected.", `demo_session_state: ${JSON.stringify(data)?.slice(0, 200)}`);
    logError('check the demo', e);
    throw e;
  }
  return state;
}

/** The demo person ends their own session (app.demo_leave). Throws an AppError when it could not be told; the caller signs out on this device anyway. */
export async function leaveDemo(): Promise<void> {
  check(await supabase.rpc('demo_leave'), 'leave the demo');
}

/**
 * Safety net under every "send a message to a team" call: a demo person's message is refused here, whatever screen asked (the screens
 * leave the Send button out in a demo, and the database refuses to send from a demo community, so this is the third lock). The
 * login is read from the saved sign-in, not from app state, so it holds even if a screen forgot to ask.
 */
export async function refuseMessageInDemo(): Promise<void> {
  const { data } = await supabase.auth.getSession();
  if (isDemoLogin(data.session?.user)) throw new AppError('Messages are turned off in the demo. Nothing was sent.', 'a demo login tried to send a message to a team inbox');
}

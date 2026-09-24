import { logError } from '../errors';
import { ALL_ON, isMissingRpcError, parseModuleRows, type ModuleKey, type ModuleMap } from '../modules';
import { supabase } from '../supabase';

/**
 * `app.my_modules(p_center uuid)` returns `(key, label, enabled, core)`.
 * It is added by the platform schema stream and is not in the generated
 * types yet, so the call is hand-typed here.
 */
type UntypedRpc = { rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }> };

export type ModuleSettings = { map: ModuleMap; labels: Partial<Record<ModuleKey, string>> };

const logged = new Set<string>();

/** Log a module-loading problem once per distinct cause, so a missing RPC doesn't flood the log. */
function logOnce(cause: string, context: string, err: unknown): void {
  if (logged.has(cause)) return;
  logged.add(cause);
  logError(context, err);
}

/**
 * Which modules are switched on for this center. Never throws: when the RPC
 * is missing (not deployed yet) or fails, everything is treated as on and the
 * reason is logged — hiding features because of our own error would be worse
 * than showing one the database will refuse anyway (module tables are
 * enforced by RLS and the module RPCs refuse when switched off).
 */
export async function loadModuleSettings(centerId: string): Promise<ModuleSettings> {
  try {
    const res = await (supabase as unknown as UntypedRpc).rpc('my_modules', { p_center: centerId });
    if (res.error) {
      if (isMissingRpcError(res.error)) {
        logOnce('missing', 'loading switched-on modules: app.my_modules is not deployed yet, so every module is shown', res.error);
      } else {
        const msg = typeof (res.error as { message?: unknown }).message === 'string' ? (res.error as { message: string }).message : 'error';
        logOnce(`error:${msg}`, 'loading switched-on modules failed, so every module is shown', res.error);
      }
      return { map: ALL_ON, labels: {} };
    }
    return parseModuleRows(res.data);
  } catch (err) {
    logOnce(`thrown:${err instanceof Error ? err.message : String(err)}`, 'loading switched-on modules failed, so every module is shown', err);
    return { map: ALL_ON, labels: {} };
  }
}

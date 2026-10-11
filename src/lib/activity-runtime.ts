import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { createActivityLogger, installActivityLogger, noteActivityOptOut, readActivityOptOut, setActivityOptOut, type ActivityEvent, type ActivityLogger } from './activity';
import { createNoticeController, type NoticeController } from './activity-notice';
import { newRequestId } from './request-context';
import { readPref, writePref } from './storage';
import { supabase } from './supabase';

/**
 * The real dependencies of the usage logger (src/lib/activity.ts): where the queue is kept on the phone, how a batch
 * reaches the database, the app version and the platform.
 *
 * `app.record_activity` and `app.set_activity_opt_out` (connect-crm B91) are not in the generated types yet, so they are
 * called through the same client with a narrow cast (so is `app.activity_status`, which says whether recording is on for the
 * community and whether this person opted out). When the function does not exist on the server, the logger drops the
 * batch quietly and pauses (see classifyFailure); nothing here ever shows an error to the member.
 */

type RpcResult = { data?: unknown; error: { code?: string; message?: string } | null; status?: number };
type LooseRpc = { rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<RpcResult> };

const STORE_KEY = 'activity.v1';
const NOTICE_KEY = 'activity.notice.v1';

async function call(fn: string, args: Record<string, unknown>): Promise<{ error: unknown | null }> {
  const res = await (supabase as unknown as LooseRpc).rpc(fn, args);
  // Keep only the code and the HTTP status: they decide retry or drop. The message is never kept.
  return { error: res.error ? { code: res.error.code, status: res.status } : null };
}

/** `app.activity_status(p_center)`: the raw answer. Throws when it cannot be had (the notice then shows nothing). */
async function fetchActivityStatus(centerId: string): Promise<unknown> {
  const res = await (supabase as unknown as LooseRpc).rpc('activity_status', { p_center: centerId });
  if (res.error) throw new Error(`activity_status was not answered (${res.error.code ?? res.status ?? 'no code'})`);
  return res.data;
}

let logger: ActivityLogger | null = null;
let notice: NoticeController | null = null;

/** The first-run notice: who has seen it is kept on this phone (AsyncStorage), per person and community. */
export function activityNotice(): NoticeController {
  if (!notice) {
    notice = createNoticeController({
      loadSeen: async () => {
        const kept = await readPref<unknown>(NOTICE_KEY, []);
        return Array.isArray(kept) ? kept.filter((k): k is string => typeof k === 'string') : [];
      },
      saveSeen: (keys) => writePref(NOTICE_KEY, keys),
      fetchStatus: fetchActivityStatus,
      isOptedOut: (userId) => readActivityOptOut(userId),
      noteOptedOut: (userId) => noteActivityOptOut(userId),
      setOptOut: (userId, out) => setActivityOptOut(userId, out),
    });
  }
  return notice;
}

/** The one logger of this app, made on first use and installed so `track()` reaches it from anywhere. */
export function activityLogger(): ActivityLogger {
  if (!logger) {
    logger = createActivityLogger({
      now: () => Date.now(),
      newId: () => newRequestId(),
      load: () => readPref<unknown>(STORE_KEY, null),
      save: (state) => writePref(STORE_KEY, state),
      send: (centerId: string, events: ActivityEvent[]) => call('record_activity', { p_center: centerId, p_events: events }),
      sendOptOut: (out: boolean) => call('set_activity_opt_out', { p_out: out }),
      appVersion: Constants.expoConfig?.version ?? undefined,
      platform: Platform.OS,
    });
    installActivityLogger(logger);
  }
  return logger;
}

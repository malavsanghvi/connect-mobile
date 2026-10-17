import { must } from '../errors';
import { supabase } from '../supabase';

// "How would you like to be thanked?" (connect-crm 0897, DonorDelight slice 9). The member sees and sets ONLY three choices for their household: how they
// would like to be thanked, how they would like to be recognised, and how to reach them. They never see notes, signs, owners, touches or any list the
// organization keeps (W2). The database decides whether the question is asked at all (the organization turns it on; adults only), and answers
// { available: false } otherwise. The calls are hand-typed until the generated types carry the new functions.

export const THANKS_CHOICES = ['in_person', 'call', 'card', 'message', 'none'] as const;
export type ThanksChoice = (typeof THANKS_CHOICES)[number];
export const RECOGNITION_CHOICES = ['public', 'private_only', 'anonymous'] as const;
export type RecognitionChoice = (typeof RECOGNITION_CHOICES)[number];
export const REACH_CHOICES = ['in_person', 'phone', 'text', 'email', 'whatsapp', 'post'] as const;
export type ReachChoice = (typeof REACH_CHOICES)[number];

export type ThanksPrefs = { available: boolean; thanks: ThanksChoice | null; recognition: RecognitionChoice | null; channel: ReachChoice | null };
export type ThanksPatch = Partial<Pick<ThanksPrefs, 'thanks' | 'recognition' | 'channel'>>;

function oneOf<T extends string>(list: readonly T[], v: unknown): T | null {
  return typeof v === 'string' && (list as readonly string[]).includes(v) ? (v as T) : null;
}

/** The answer of app.member_care_preferences, read safely: anything unexpected is "not available", never a guess. */
export function parseThanksPrefs(v: unknown): ThanksPrefs {
  const o = v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  if (o.available !== true) return { available: false, thanks: null, recognition: null, channel: null };
  return { available: true, thanks: oneOf(THANKS_CHOICES, o.thanks), recognition: oneOf(RECOGNITION_CHOICES, o.recognition), channel: oneOf(REACH_CHOICES, o.channel) };
}

/** What changed: only the keys that differ, so an untouched choice is never rewritten. */
export function changedPrefs(before: ThanksPrefs, after: Pick<ThanksPrefs, 'thanks' | 'recognition' | 'channel'>): ThanksPatch {
  const out: ThanksPatch = {};
  if (after.thanks !== before.thanks) out.thanks = after.thanks;
  if (after.recognition !== before.recognition) out.recognition = after.recognition;
  if (after.channel !== before.channel) out.channel = after.channel;
  return out;
}

type UntypedRpc = { rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }> };
const untyped = supabase as unknown as UntypedRpc;

export async function loadThanksPrefs(centerId: string): Promise<ThanksPrefs> {
  return parseThanksPrefs(must(await untyped.rpc('member_care_preferences', { p_center: centerId }), 'load how you would like to be thanked'));
}

export async function saveThanksPrefs(centerId: string, prefs: ThanksPatch): Promise<ThanksPrefs> {
  return parseThanksPrefs(must(await untyped.rpc('save_member_care_preferences', { p_center: centerId, p_prefs: prefs }), 'save how you would like to be thanked'));
}

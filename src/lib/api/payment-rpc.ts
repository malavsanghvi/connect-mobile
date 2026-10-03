import { supabase } from '../supabase';

/**
 * TEMPORARY, ONE PLACE. The payments functions below are connect-crm 0581 and 0582 (pull requests #81 and #82). They are
 * not in the generated `database.types.ts` until those are merged and the types are copied here, so they are called
 * through this one narrow cast, with result types of our own (src/features/pay/methods.ts, zelle-report.ts).
 *
 *   app.member_payment_methods(p_center)                         the ways to give, in the community's order
 *   app.report_payment(p_center, p_household, p_method, p_amount_cents, p_sent_on, p_confirmation, p_sender_name,
 *                      p_pledge_ids, p_note)                      an adult reports a Zelle they sent
 *   app.withdraw_payment_report(p_report, p_reason)              withdraw a report that is still waiting
 *   app.my_payment_reports(p_center, p_household)                the family's reports of the last 180 days
 *
 * When the types arrive: replace each `paymentRpc('x', args)` in payments.ts with `supabase.rpc('x', args)`, then
 * delete this file. Nothing else needs to change.
 */
type PaymentRpcName = 'member_payment_methods' | 'report_payment' | 'withdraw_payment_report' | 'my_payment_reports';

type UntypedRpc = { rpc: (fn: PaymentRpcName, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }> };

export function paymentRpc(fn: PaymentRpcName, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }> {
  return (supabase as unknown as UntypedRpc).rpc(fn, args);
}

import type { OfflineMethod } from '@/lib/api/payments';

/** Offline methods a community can accept (connect-crm app.center_payment_methods). */
export const OFFLINE_METHOD_KEYS = ['check', 'cash', 'zelle', 'ach', 'stock', 'daf', 'matching_gift'];
const FIELDS = ['payee', 'address', 'recipient', 'name', 'where', 'legal_name', 'ein', 'details', 'contact', 'memo_hint', 'note'];

/** Only instruction fields we have a label for, in a stable order (the portal's Settings › Payments). */
export function instructionLines(m: OfflineMethod): { field: string; value: string }[] {
  return FIELDS.filter((f) => typeof m.instructions?.[f] === 'string' && m.instructions[f].trim()).map((f) => ({ field: f, value: m.instructions[f].trim() }));
}

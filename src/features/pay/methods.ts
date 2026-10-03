/**
 * The ways this community takes a gift, as the Pay sheet and "How to give" show them. Pure: no I/O, no React.
 *
 * Two sources, one shape:
 *   - `app.member_payment_methods` (connect-crm 0581): one entry per way to pay, already in the community's order
 *     (Card, PayPal, Zelle, the offline methods).
 *   - `app.member_payment_options` (connect-crm 0211): the older answer, a single online processor plus the offline
 *     methods. An app talking to a portal that does not have the new function yet gets this one, converted, and
 *     behaves exactly as it did before: the server picks the processor, so none is sent.
 *
 * The app never decides what is accepted: whatever the database lists is shown, in its order, and nothing it does not
 * list is offered. Money is integer cents everywhere else; there are no amounts here.
 */

import { OFFLINE_METHOD_KEYS } from './offline';

export type OnlineProcessor = 'stripe' | 'paypal';

/** A provider's own hosted page: Card (Stripe) or PayPal. The app opens the page and waits for the provider's webhook. */
export type OnlineMethod = {
  kind: 'online';
  key: string;
  label: string;
  processor: OnlineProcessor;
  mode: 'test' | 'live';
  /** Wallets that appear on the provider's page when the phone and the account allow it: 'apple_pay', 'google_pay'. */
  wallets: string[];
  /** Other things the same page takes: 'venmo' (PayPal), 'bank_debit' (Card). */
  also: string[];
  sort: number;
  /** From the older answer: the server picks the processor, so the app sends none (exactly as before). */
  legacy: boolean;
};

export type ZelleInstructions = { recipient: string | null; name: string | null; memoHint: string | null };

/** Zelle: money goes bank to bank. The member reports it; the treasurer matches it at the bank. */
export type ZelleMethod = {
  kind: 'zelle';
  key: string;
  label: string;
  /** A sandbox: Zelle has no test mode, so members never see the real address and report a test payment. */
  rehearsal: boolean;
  instructions: ZelleInstructions;
  /** The database can take a member's "I sent it" (app.report_payment exists). */
  reportAvailable: boolean;
  windowDays: number;
  sort: number;
};

/** Check, cash, ACH and wire, stock, donor-advised fund, matching gift: the office's own instructions. */
export type InstructionMethod = {
  kind: 'instructions';
  key: string;
  /** The community's own name for it, when the database gave one; otherwise the app names it by `method`. */
  label: string | null;
  method: string;
  instructions: Record<string, string>;
  sort: number;
};

export type PayMethod = OnlineMethod | ZelleMethod | InstructionMethod;

export type PaymentMethods = {
  /** Where the list came from: the new answer, or the older one converted. */
  source: 'methods' | 'options';
  environment: string;
  sandbox: boolean;
  /** Why online payment is off: not_connected | test_mode | offline_only. Null when something can be paid online. */
  onlineUnavailable: string | null;
  methods: PayMethod[];
};

const DEFAULT_WINDOW_DAYS = 10;

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function text(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function stringList(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '').map((x) => x.trim()) : [];
}

function sortOf(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

/** Only text instruction fields, trimmed; anything else the database might add is not shown. */
function instructionMap(v: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!isRecord(v)) return out;
  for (const [k, val] of Object.entries(v)) {
    const s = text(val);
    if (s) out[k] = s;
  }
  return out;
}

function windowDays(v: unknown): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' && /^\d{1,3}$/.test(v.trim()) ? Number(v) : NaN;
  return Number.isInteger(n) && n >= 3 && n <= 30 ? n : DEFAULT_WINDOW_DAYS;
}

/**
 * The community's order: by the database's `sort`, and for equal (or missing) values in the order it listed them. A
 * stable sort on a copy; the input is not changed.
 */
export function orderMethods<T extends { sort: number }>(list: readonly T[]): T[] {
  return list
    .map((m, i) => ({ m, i }))
    .sort((a, b) => a.m.sort - b.m.sort || a.i - b.i)
    .map((x) => x.m);
}

/**
 * Reads `app.member_payment_methods`. Returns null when the answer is not the expected shape (the caller says so in
 * plain English). An entry this build does not know (a family or provider added later, a method with no instructions
 * screen) is left out, never guessed at; the rest of the list still shows.
 */
export function parseMemberMethods(raw: unknown): PaymentMethods | null {
  if (!isRecord(raw) || !Array.isArray(raw.methods)) return null;
  const environment = text(raw.environment) ?? 'production';
  const methods: PayMethod[] = [];
  raw.methods.forEach((entry, index) => {
    if (!isRecord(entry)) return;
    const key = text(entry.key);
    const family = text(entry.family);
    if (!key || !family) return;
    const sort = sortOf(entry.sort, index);
    if (family === 'provider_checkout') {
      const processor = entry.provider === 'stripe' || entry.provider === 'paypal' ? entry.provider : null;
      if (!processor) return;
      methods.push({
        kind: 'online',
        key,
        label: text(entry.label) ?? (processor === 'paypal' ? 'PayPal' : 'Card'),
        processor,
        // Anything that is not plainly live is treated as test: the member is told, never charged unknowingly.
        mode: entry.mode === 'live' ? 'live' : 'test',
        wallets: stringList(entry.wallets),
        also: stringList(entry.also),
        sort,
        legacy: false,
      });
    } else if (family === 'reported_transfer') {
      if (key !== 'zelle') return;
      const instr = isRecord(entry.instructions) ? entry.instructions : {};
      const report = isRecord(entry.report) ? entry.report : {};
      const rehearsal = entry.mode === 'rehearsal' || environment === 'sandbox';
      methods.push({
        kind: 'zelle',
        key,
        label: text(entry.label) ?? 'Zelle',
        rehearsal,
        instructions: {
          // A rehearsal never shows an address, whatever the answer carries.
          recipient: rehearsal ? null : text(instr.recipient),
          name: text(instr.name),
          memoHint: text(instr.memo_hint),
        },
        reportAvailable: report.available === true,
        windowDays: windowDays(report.window_days),
        sort,
      });
    } else if (family === 'instructions') {
      const method = text(entry.method);
      if (!method || !OFFLINE_METHOD_KEYS.includes(method)) return;
      methods.push({ kind: 'instructions', key, label: text(entry.label), method, instructions: instructionMap(entry.instructions), sort });
    }
  });
  return {
    source: 'methods',
    environment,
    sandbox: environment === 'sandbox',
    onlineUnavailable: text(raw.online_unavailable),
    methods: orderMethods(methods),
  };
}

/**
 * Reads the older `app.member_payment_options` and gives the same shape, so the screens have one code path. Nothing is
 * added to what it said: one online processor (the default), then the offline methods in its order, Zelle included as
 * the plain instructions the app has always shown.
 */
export function fromLegacyOptions(raw: unknown): PaymentMethods {
  const r = isRecord(raw) ? raw : {};
  const environment = text(r.environment) ?? 'production';
  const methods: PayMethod[] = [];
  const online = isRecord(r.online) ? r.online : null;
  if (online && (online.processor === 'stripe' || online.processor === 'paypal')) {
    methods.push({
      kind: 'online',
      key: online.processor === 'paypal' ? 'paypal' : 'card',
      label: online.processor === 'paypal' ? 'PayPal' : 'Stripe',
      processor: online.processor,
      mode: online.mode === 'live' ? 'live' : 'test',
      wallets: [],
      also: [],
      sort: 0,
      legacy: true,
    });
  }
  const offline = Array.isArray(r.offline) ? r.offline : [];
  offline.forEach((entry, i) => {
    if (!isRecord(entry)) return;
    const method = text(entry.method);
    if (!method) return;
    methods.push({ kind: 'instructions', key: method, label: null, method, instructions: instructionMap(entry.instructions), sort: i + 1 });
  });
  return { source: 'options', environment, sandbox: environment === 'sandbox', onlineUnavailable: text(r.online_unavailable), methods };
}

export function onlineMethods(list: PaymentMethods | null): OnlineMethod[] {
  return (list?.methods ?? []).filter((m): m is OnlineMethod => m.kind === 'online');
}

export function zelleMethod(list: PaymentMethods | null): ZelleMethod | null {
  return (list?.methods ?? []).find((m): m is ZelleMethod => m.kind === 'zelle') ?? null;
}

/** Everything that is not paid on a provider's page: Zelle and the office's instructions, in the community's order. */
export function otherMethods(list: PaymentMethods | null): (ZelleMethod | InstructionMethod)[] {
  return (list?.methods ?? []).filter((m): m is ZelleMethod | InstructionMethod => m.kind !== 'online');
}

/** The method the member has chosen, or the first online method when none was chosen (or the choice is gone). */
export function chosenOnline(list: PaymentMethods | null, key: string | null): OnlineMethod | null {
  const online = onlineMethods(list);
  return online.find((m) => m.key === key) ?? online[0] ?? null;
}

/** Can the member report a Zelle they sent? Only when the database says so. */
export function canReportZelle(list: PaymentMethods | null): boolean {
  const z = zelleMethod(list);
  return !!z && z.reportAvailable;
}

const NAMES: Record<string, string> = {
  apple_pay: 'Apple Pay',
  google_pay: 'Google Pay',
  venmo: 'Venmo',
  bank_debit: 'Bank account (ACH)',
};

/** "Apple Pay and Google Pay", "A, B and C". Keys this build has no name for are left out. */
export function joinNames(keys: readonly string[]): string {
  const names = keys.map((k) => NAMES[k]).filter((n): n is string => !!n);
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

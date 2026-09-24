/**
 * Pure formatting helpers. Money is integer cents everywhere; it is only
 * turned into dollars here, at the edge.
 */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function groupThousands(n: string): string {
  return n.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * 124000 → "$1,240"; 1299 → "$12.99"; alwaysCents → "$1,240.00".
 * Whole-dollar amounts drop the cents unless asked, matching the prototype.
 */
export function formatCents(cents: number | null | undefined, opts: { alwaysCents?: boolean } = {}): string {
  const value = Math.round(Number(cents ?? 0));
  const negative = value < 0;
  const abs = Math.abs(value);
  const dollars = Math.floor(abs / 100);
  const rem = abs % 100;
  const body = rem === 0 && !opts.alwaysCents ? groupThousands(String(dollars)) : `${groupThousands(String(dollars))}.${String(rem).padStart(2, '0')}`;
  return `${negative ? '-' : ''}$${body}`;
}

/** "$10K" style for compact labels (≥ $1,000 whole thousands). */
export function formatCentsCompact(cents: number): string {
  if (cents >= 100000 && cents % 100000 === 0) return `$${groupThousands(String(cents / 100000))}K`;
  return formatCents(cents);
}

/** "101", "$1,250.5", "12.50" → cents. Returns null when not a positive amount. */
export function parseAmountToCents(input: string): number | null {
  const cleaned = input.replace(/[$,\s]/g, '');
  if (!/^\d+(\.\d{0,2})?$/.test(cleaned)) return null;
  const [whole, frac = ''] = cleaned.split('.');
  const cents = Number(whole) * 100 + Number(frac.padEnd(2, '0'));
  return cents > 0 ? cents : null;
}

/** 'YYYY-MM-DD' → parts, or null. */
export function parseISODate(s: string | null | undefined): { y: number; m: number; d: number } | null {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return null;
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function toISODate(y: number, m: number, d: number): string {
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

/** Add days to a 'YYYY-MM-DD' date (calendar arithmetic, no time zone). */
export function addDays(iso: string, days: number): string {
  const p = parseISODate(iso);
  if (!p) return iso;
  const dt = new Date(Date.UTC(p.y, p.m - 1, p.d + days));
  return toISODate(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

/** Whole days from a to b (both 'YYYY-MM-DD'). */
export function daysBetween(a: string, b: string): number {
  const pa = parseISODate(a);
  const pb = parseISODate(b);
  if (!pa || !pb) return 0;
  return Math.round((Date.UTC(pb.y, pb.m - 1, pb.d) - Date.UTC(pa.y, pa.m - 1, pa.d)) / 86400000);
}

/** Day of week (0 = Sunday) of a 'YYYY-MM-DD' date. */
export function weekdayOf(iso: string): number {
  const p = parseISODate(iso);
  if (!p) return 0;
  return new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay();
}

/** '2026-09-22' → "Tue, Sep 22". */
export function formatDay(iso: string | null | undefined): string {
  const p = parseISODate(iso);
  if (!p || !iso) return '';
  return `${WEEKDAYS[weekdayOf(iso)]}, ${MONTHS[p.m - 1]} ${p.d}`;
}

/** '2026-09-22' → "Sep 22, 2026". */
export function formatLongDate(iso: string | null | undefined): string {
  const p = parseISODate(iso);
  if (!p) return '';
  return `${MONTHS[p.m - 1]} ${p.d}, ${p.y}`;
}

/** '1985-03-14' → "03/14/1985" (US display). */
export function formatDob(iso: string | null | undefined): string {
  const p = parseISODate(iso);
  if (!p) return '';
  return `${pad2(p.m)}/${pad2(p.d)}/${p.y}`;
}

/** "03/14/1985", "3-14-1985" or "1985-03-14" → '1985-03-14', or null if not a real date. */
export function parseDobInput(input: string): string | null {
  const s = input.trim();
  let y: number;
  let m: number;
  let d: number;
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  const us = /^(\d{1,2})[/\-. ]+(\d{1,2})[/\-. ]+(\d{4})$/.exec(s);
  if (iso) {
    y = Number(iso[1]);
    m = Number(iso[2]);
    d = Number(iso[3]);
  } else if (us) {
    m = Number(us[1]);
    d = Number(us[2]);
    y = Number(us[3]);
  } else {
    return null;
  }
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1900 || y > 2100) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return toISODate(y, m, d);
}

export function monthName(m: number, long = false): string {
  return (long ? MONTHS_LONG : MONTHS)[(m - 1 + 12) % 12];
}

export function monthShortUpper(iso: string): string {
  const p = parseISODate(iso);
  return p ? MONTHS[p.m - 1].toUpperCase() : '';
}

/** Postgres time '07:14:00' → "7:14 AM". */
export function formatTimeOfDay(t: string | null | undefined): string {
  if (!t) return '';
  const m = /^(\d{1,2}):(\d{2})/.exec(t);
  if (!m) return t;
  const h = Number(m[1]);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m[2]} ${suffix}`;
}

type ZonedParts = { iso: string; weekday: number; hour: number; minute: number };

/** Break a timestamp into calendar parts in a time zone (falls back to device time). */
export function zonedParts(date: Date, timeZone?: string | null): ZonedParts {
  try {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: timeZone ?? undefined,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
      weekday: 'short',
    });
    const parts: Record<string, string> = {};
    for (const p of fmt.formatToParts(date)) parts[p.type] = p.value;
    const iso = `${parts.year}-${parts.month}-${parts.day}`;
    return { iso, weekday: WEEKDAYS.indexOf(parts.weekday ?? 'Sun'), hour: Number(parts.hour) % 24, minute: Number(parts.minute) };
  } catch {
    // Intl without time-zone support: use the device clock (documented fallback).
    return {
      iso: toISODate(date.getFullYear(), date.getMonth() + 1, date.getDate()),
      weekday: date.getDay(),
      hour: date.getHours(),
      minute: date.getMinutes(),
    };
  }
}

/** Today's date ('YYYY-MM-DD') at the center. */
export function todayAt(timeZone: string | null | undefined, now: Date = new Date()): string {
  return zonedParts(now, timeZone).iso;
}

function hm12(hour: number, minute: number): string {
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}:${pad2(minute)} ${suffix}`;
}

/** Timestamp → "10:00 AM" at the center. */
export function formatTime(ts: string | null | undefined, timeZone?: string | null): string {
  if (!ts) return '';
  const p = zonedParts(new Date(ts), timeZone);
  return hm12(p.hour, p.minute);
}

/** Timestamp → "Sun, Sep 27" at the center. */
export function formatDate(ts: string | null | undefined, timeZone?: string | null): string {
  if (!ts) return '';
  return formatDay(zonedParts(new Date(ts), timeZone).iso);
}

/** Timestamp → "Sun, Sep 27 · 10:00 AM" at the center. */
export function formatDateTime(ts: string | null | undefined, timeZone?: string | null): string {
  if (!ts) return '';
  return `${formatDate(ts, timeZone)} · ${formatTime(ts, timeZone)}`;
}

/** "10:00 AM – 2:00 PM". */
export function formatTimeRange(start: string | null | undefined, end: string | null | undefined, timeZone?: string | null): string {
  if (!start) return '';
  return end ? `${formatTime(start, timeZone)} – ${formatTime(end, timeZone)}` : formatTime(start, timeZone);
}

/** Remaining time until `ts` as "4 days", "5 hours", "12 minutes"; '' when past. */
export function formatTimeLeft(ts: string | null | undefined, now: Date): string {
  if (!ts) return '';
  const ms = new Date(ts).getTime() - now.getTime();
  if (ms <= 0) return '';
  const minutes = Math.floor(ms / 60000);
  if (minutes < 60) return `${Math.max(1, minutes)} minute${minutes === 1 ? '' : 's'}`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} hour${hours === 1 ? '' : 's'}`;
  const days = Math.floor(hours / 24);
  return `${days} days`;
}

/** US numbers: "(713) 555-0142" → "+17135550142". Returns null when not plausible. */
export function toE164(input: string): string | null {
  const trimmed = input.trim();
  const digits = trimmed.replace(/\D/g, '');
  if (trimmed.startsWith('+')) return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return null;
}

/** "+17135550142" → "(713) 555-0142"; other numbers shown as stored. */
export function formatPhone(e164: string | null | undefined): string {
  if (!e164) return '';
  const m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(e164);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : e164;
}

export function isValidEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s.trim());
}

/** Group a one-time code for display while typing: "482917" → "482 917",
 * "48291736" → "4829 1736". Codes are 6–10 digits (a Supabase project setting). */
export function formatOtp(code: string): string {
  const d = code.replace(/\D/g, '').slice(0, 10);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)} ${d.slice(3)}`;
  return d.match(/.{1,4}/g)!.join(' ');
}

export function fullName(p: { first_name: string; last_name: string; preferred_name?: string | null }): string {
  return `${p.preferred_name || p.first_name} ${p.last_name}`.trim();
}

export function firstName(p: { first_name: string; preferred_name?: string | null }): string {
  return p.preferred_name || p.first_name;
}

export function initialOf(name: string): string {
  return name.trim().charAt(0).toUpperCase() || '?';
}

/** Join names as "Priya, Rahul and Anya". */
export function joinNames(names: string[], and = 'and'): string {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} ${and} ${names[names.length - 1]}`;
}

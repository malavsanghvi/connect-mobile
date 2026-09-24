import type { Tables } from './database.types';
import { AppError } from './errors';
import { isValidEmail } from './format';

export type EmailLabel = 'work' | 'other';
export type EmailDraft = { id: string | null; email: string; label: EmailLabel };

/** What to insert, relabel or delete so person_emails matches the drafts. Throws a plain-English error on a bad address. */
export function planEmailChanges(existing: Pick<Tables<'person_emails'>, 'id' | 'email' | 'label'>[], drafts: EmailDraft[], primary: string | null): { insert: { email: string; label: EmailLabel }[]; relabel: { id: string; label: EmailLabel }[]; remove: string[] } {
  const seen = new Set<string>(primary ? [primary.trim().toLowerCase()] : []);
  const kept: EmailDraft[] = [];
  for (const d of drafts) {
    const email = d.email.trim().toLowerCase();
    if (!email) continue;
    if (!isValidEmail(email)) throw new AppError(`"${d.email.trim()}" does not look like an email address.`, 'invalid extra email');
    if (seen.has(email)) continue;
    seen.add(email);
    kept.push({ ...d, email });
  }
  const insert: { email: string; label: EmailLabel }[] = [];
  const relabel: { id: string; label: EmailLabel }[] = [];
  const keepIds = new Set<string>();
  for (const d of kept) {
    const match = existing.find((e) => (d.id && e.id === d.id && e.email.toLowerCase() === d.email) || e.email.toLowerCase() === d.email);
    if (match) {
      keepIds.add(match.id);
      if (match.label !== d.label) relabel.push({ id: match.id, label: d.label });
    } else {
      insert.push({ email: d.email, label: d.label });
    }
  }
  const remove = existing.filter((e) => e.label !== 'primary' && !keepIds.has(e.id)).map((e) => e.id);
  return { insert, relabel, remove };
}


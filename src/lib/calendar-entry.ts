// Calendar entries (app.calendar_entries.metadata): what the member app shows under a date.

/** A calendar entry's metadata (a subscribed calendar adds sub, notes and a secure link). */
export function entryDetails(metadata: unknown): { sub: string | null; notes: string | null; link: string | null } {
  const m = metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? (metadata as Record<string, unknown>) : {};
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
  const link = str(m.link);
  return { sub: str(m.sub), notes: str(m.notes), link: link && /^https:\/\/\S+$/i.test(link) ? link : null };
}

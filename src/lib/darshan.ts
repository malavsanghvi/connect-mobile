// Live darshan (content_items of kind darshan_stream): which stream the member
// app shows. The organization's own stream beats a shared one, a stream marked
// live beats an idle one, one switched off is not shown, and only a secure
// https:// link is ever opened (the database refuses anything else since 0511).

export type DarshanRow = { title: string; media_url: string | null; center_id: string | null; metadata: unknown };
export type Darshan = { title: string; url: string; live: boolean; schedule: string | null };

function meta(row: DarshanRow): Record<string, unknown> {
  return row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata) ? (row.metadata as Record<string, unknown>) : {};
}

export function isSecureStreamUrl(url: string | null | undefined): url is string {
  return typeof url === 'string' && /^https:\/\/\S+$/i.test(url.trim());
}

export function pickDarshan(rows: DarshanRow[], centerId: string): Darshan | null {
  const usable = rows.filter((r) => isSecureStreamUrl(r.media_url) && meta(r).stream_status !== 'off');
  const rank = (r: DarshanRow) => (r.center_id === centerId ? 0 : 2) + (meta(r).stream_status === 'live' ? 0 : 1);
  const best = [...usable].sort((a, b) => rank(a) - rank(b))[0];
  if (!best) return null;
  const m = meta(best);
  return { title: best.title, url: (best.media_url as string).trim(), live: m.stream_status === 'live', schedule: typeof m.schedule === 'string' ? m.schedule : null };
}

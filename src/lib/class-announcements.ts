/**
 * Class announcements: what a Pathshala principal or a class teacher publishes in the portal
 * (`app.class_announcements`) for the families of a class, or for a whole term. Pure (no React Native, no network), so
 * it is unit-tested in src/lib/__tests__/class-announcements.test.ts.
 *
 * Who sees which row is the database's decision: the policy `announcements_parents` (connect-crm 0010) lets a household
 * read the published announcements of the classes, or whole terms, it has an enrollment in. Nothing here widens or
 * narrows that. The author is never read: the app shows no staff names.
 */

import type { Translate } from '../i18n';

/** The columns the app reads from `class_announcements`. */
export type AnnouncementRow = {
  id: string;
  title: string;
  body_md: string;
  published_at: string | null;
  class_id: string | null;
  term_id: string | null;
};

/** Who it is for: one class, or (no class) everyone in the term. A name is null when the database did not give it. */
export type AnnouncementAudience = { kind: 'class'; className: string | null } | { kind: 'term'; termName: string | null };

export type ClassAnnouncement = {
  id: string;
  title: string;
  /** Plain text. The portal says "Plain text; line breaks are kept", so the screen shows it as it is. */
  body: string;
  /** When it was published (an ISO timestamp), shown in the community's time zone. */
  publishedAt: string;
  audience: AnnouncementAudience;
};

function nameOf(names: ReadonlyMap<string, string>, id: string | null): string | null {
  const name = id ? names.get(id)?.trim() : '';
  return name ? name : null;
}

function timeOf(iso: string): number {
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? Number.NEGATIVE_INFINITY : ms;
}

/**
 * The published announcements, newest first. A row without a publish time is a draft and is left out (the query asks
 * only for published ones; this keeps a draft from ever showing). A row for a class is "for that class"; a row with no
 * class is for the whole term ("All of Pathshala"). The text keeps its line breaks, with Windows line ends made plain.
 */
export function buildAnnouncements(rows: readonly AnnouncementRow[], classNames: ReadonlyMap<string, string>, termNames: ReadonlyMap<string, string>): ClassAnnouncement[] {
  const out: ClassAnnouncement[] = [];
  for (const r of rows) {
    if (!r.published_at) continue;
    out.push({
      id: r.id,
      title: r.title.trim(),
      body: r.body_md.replace(/\r\n?/g, '\n').trim(),
      publishedAt: r.published_at,
      audience: r.class_id ? { kind: 'class', className: nameOf(classNames, r.class_id) } : { kind: 'term', termName: nameOf(termNames, r.term_id) },
    });
  }
  // Array.prototype.sort is stable, so two announcements published at the same moment keep the order they came in.
  return out.sort((a, b) => timeOf(b.publishedAt) - timeOf(a.publishedAt));
}

/** "Jainism 6" for a class; "All of Pathshala · Fall 2026" for a whole term (just "All of Pathshala" without the term's name). */
export function audienceLabel(audience: AnnouncementAudience, t: Translate): string {
  if (audience.kind === 'class') return audience.className ?? t('announce.yourClass');
  return audience.termName ? t('announce.allTerm', { term: audience.termName }) : t('announce.all');
}

/**
 * Tenant branding read from `centers.branding` (JSON owned by connect-crm).
 * Keys used by the member app, all optional:
 *   mark_url      square-ish emblem (header 46px, drawer 52px)
 *   logo_url      full lockup (welcome screen); also used as the mark when
 *                 no mark_url is set
 *   wordmark      ["JAIN SOCIETY", "OF HOUSTON"] — the two header lines;
 *                 derived from the center name when absent
 *   dashboard_url public community dashboard (drawer link)
 * The community is the tenant; the product is "Community Connect".
 */

type Obj = Record<string, unknown>;

function asObj(v: unknown): Obj | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : null;
}

function httpUrl(v: unknown): string | null {
  return typeof v === 'string' && /^https?:\/\//i.test(v.trim()) ? v.trim() : null;
}

export type Branding = {
  markUrl: string | null;
  logoUrl: string | null;
  dashboardUrl: string | null;
  wordmark: [string] | [string, string];
};

/**
 * Split a community name into the prototype's two-line wordmark:
 * "Jain Society of Houston" → ["JAIN SOCIETY", "OF HOUSTON"]. Splits before
 * " of " when present, otherwise at the most balanced word break.
 */
export function wordmarkLines(name: string): [string] | [string, string] {
  const clean = name.trim().replace(/\s+/g, ' ');
  if (!clean) return [''];
  const upper = clean.toUpperCase();
  const of = upper.indexOf(' OF ');
  if (of > 0) return [upper.slice(0, of), upper.slice(of + 1)];
  const words = upper.split(' ');
  if (words.length < 3) return [upper];
  let best = 1;
  let bestDiff = Infinity;
  for (let i = 1; i < words.length; i++) {
    const diff = Math.abs(words.slice(0, i).join(' ').length - words.slice(i).join(' ').length);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = i;
    }
  }
  return [words.slice(0, best).join(' '), words.slice(best).join(' ')];
}

export function readBranding(center: { name?: string | null; branding?: unknown } | null | undefined, envDashboardUrl?: string): Branding {
  const b = asObj(center?.branding) ?? {};
  const logoUrl = httpUrl(b.logo_url) ?? httpUrl(b.logo);
  const markUrl = httpUrl(b.mark_url) ?? logoUrl;
  const wm = Array.isArray(b.wordmark) ? b.wordmark.filter((x): x is string => typeof x === 'string' && x.trim().length > 0).map((x) => x.trim()) : [];
  const wordmark: [string] | [string, string] = wm.length >= 2 ? [wm[0], wm[1]] : wm.length === 1 ? [wm[0]] : wordmarkLines(center?.name ?? '');
  return { markUrl, logoUrl, dashboardUrl: httpUrl(b.dashboard_url) ?? httpUrl(envDashboardUrl), wordmark };
}

import { pickableCommunities, searchableCommunities } from '../community';
import { logError, maybe, must } from '../errors';
import { isMissingRpcError } from '../modules';
import { supabase } from '../supabase';

/** A community the member can open (app.find_community / app.community_by_join_code, readable without signing in). */
export type CommunityResult = {
  slug: string;
  name: string;
  shortName: string | null;
  place: string | null;
  sandbox: boolean;
};

function place(city: string | null | undefined, state: string | null | undefined): string | null {
  const parts = [city, state].map((p) => (p ?? '').trim()).filter(Boolean);
  return parts.length ? parts.join(', ') : null;
}

/** Live communities matching a name, city or state. Sandboxes are never listed (join code only). */
export async function findCommunity(query: string): Promise<CommunityResult[]> {
  const rows = must(await supabase.rpc('find_community', { p_query: query.trim() }), 'search for communities');
  return searchableCommunities(rows.map((r) => ({
    slug: r.slug,
    name: r.name,
    shortName: r.short_name,
    place: place(r.city, r.state_region),
    sandbox: r.environment === 'sandbox',
  })));
}

/** A row of the community list or of one community: the five fields the finder shows. */
type PublicRow = { slug: string; name: string; short_name: string | null; state_region: string | null; environment: string };

/**
 * The "choose your organization" list: active communities (app.communities_public_list, connect-crm 0614; no
 * settings). A database from before 0614 is read the old way (the public read of centers). Sandboxes are included
 * only while no live community exists (pickableCommunities).
 */
export async function listCommunities(): Promise<CommunityResult[]> {
  const res = await supabase.rpc('communities_public_list');
  let rows: PublicRow[];
  if (res.error && isMissingRpcError(res.error)) {
    logError('loading the list of organizations: app.communities_public_list is not in this database yet, so the list is read from the table', res.error);
    rows = must(
      await supabase.from('centers').select('slug, name, short_name, state_region, environment').eq('status', 'active').order('name'),
      'load the list of organizations',
    );
  } else {
    rows = must(res, 'load the list of organizations');
  }
  return pickableCommunities(
    rows.map((r) => ({
      slug: String(r.slug),
      name: r.name,
      shortName: r.short_name,
      place: place(null, r.state_region),
      sandbox: r.environment === 'sandbox',
    })),
  );
}

/** The community a join code opens, or null when the code is wrong, replaced or expired. */
export async function communityByJoinCode(code: string): Promise<CommunityResult | null> {
  const rows = maybe(await supabase.rpc('community_by_join_code', { p_code: code }), 'check the join code');
  const r = rows?.[0];
  if (!r) return null;
  return { slug: r.slug, name: r.name, shortName: r.short_name, place: place(null, r.state_region), sandbox: r.environment === 'sandbox' };
}

/**
 * One community through app.community_public / community_public_by_id (connect-crm 0614): the same communities the app
 * could always open, read through the function that shows a guest only the public part. A database from before 0614 has
 * no such function: the table is read the old way (`oldRead`).
 */
async function publicCommunity(
  fn: 'community_public' | 'community_public_by_id',
  args: { p_slug: string } | { p_id: string },
  oldRead: () => PromiseLike<{ data: PublicRow | null; error: unknown }>,
  action: string,
): Promise<PublicRow | null> {
  const res = fn === 'community_public'
    ? await supabase.rpc('community_public', args as { p_slug: string })
    : await supabase.rpc('community_public_by_id', args as { p_id: string });
  if (res.error && isMissingRpcError(res.error)) {
    logError(`${action}: app.${fn} is not in this database yet, so the community is read from the table`, res.error);
    return maybe(await oldRead(), action);
  }
  const rows = maybe(res, action);
  return rows?.[0] ?? null;
}

/**
 * The community with this web name (active or onboarding, sandboxes included). Used for the build's default community
 * (EXPO_PUBLIC_CENTER_SLUG), which must still open when it is a sandbox that search never lists
 * (JSH became one on 2026-09-25). Null when there is no such open community.
 */
export async function communityBySlug(slug: string): Promise<CommunityResult | null> {
  const name = slug.trim().toLowerCase();
  const row = await publicCommunity(
    'community_public',
    { p_slug: name },
    () => supabase.from('centers').select('slug, name, short_name, state_region, environment').eq('slug', name).maybeSingle(),
    'load the suggested community',
  );
  if (!row) return null;
  return { slug: String(row.slug), name: row.name, shortName: row.short_name, place: place(null, row.state_region), sandbox: row.environment === 'sandbox' };
}

/**
 * The community with this id, read the same way (active or onboarding, sandboxes included). Used for the community an
 * event belongs to (a flyer's QR link). Null when there is no such open community.
 */
export async function communityById(id: string): Promise<CommunityResult | null> {
  const row = await publicCommunity(
    'community_public_by_id',
    { p_id: id },
    () => supabase.from('centers').select('slug, name, short_name, state_region, environment').eq('id', id).maybeSingle(),
    "find the event's community",
  );
  if (!row) return null;
  return { slug: String(row.slug), name: row.name, shortName: row.short_name, place: place(null, row.state_region), sandbox: row.environment === 'sandbox' };
}

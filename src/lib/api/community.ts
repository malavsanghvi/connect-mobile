import { searchableCommunities } from '../community';
import { maybe, must } from '../errors';
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

/** The community a join code opens, or null when the code is wrong, replaced or expired. */
export async function communityByJoinCode(code: string): Promise<CommunityResult | null> {
  const rows = maybe(await supabase.rpc('community_by_join_code', { p_code: code }), 'check the join code');
  const r = rows?.[0];
  if (!r) return null;
  return { slug: r.slug, name: r.name, shortName: r.short_name, place: place(null, r.state_region), sandbox: r.environment === 'sandbox' };
}

/**
 * The community with this web name, read like the app's own community (public read of centers:
 * active or onboarding), sandboxes included. Used for the build's default community
 * (EXPO_PUBLIC_CENTER_SLUG), which must still open when it is a sandbox that search never lists
 * (JSH became one on 2026-09-25). Null when there is no such open community.
 */
export async function communityBySlug(slug: string): Promise<CommunityResult | null> {
  const row = maybe(
    await supabase.from('centers').select('slug, name, short_name, state_region, environment').eq('slug', slug.trim().toLowerCase()).maybeSingle(),
    'load the suggested community',
  );
  if (!row) return null;
  return { slug: String(row.slug), name: row.name, shortName: row.short_name, place: place(null, row.state_region), sandbox: row.environment === 'sandbox' };
}

/**
 * Build-time configuration. EXPO_PUBLIC_* values are inlined by the bundler,
 * so each variable must be referenced by its full literal name.
 * See .env.example and README.md.
 */

/**
 * The organization every install made before communities could be chosen belongs to: JSH was the only one. It is NOT a default
 * for a new install (a new install is asked, with no organization suggested); it only keeps an install that signed in before the
 * chooser existed, or that was opened on a link into a screen with nothing chosen, on the community it has always opened.
 */
export const LEGACY_COMMUNITY_SLUG = 'jsh';

/**
 * What EXPO_PUBLIC_CENTER_SLUG means. `buildCommunity` is set only by a build made for ONE organization: the finder then offers
 * "Continue with ..." for it. The shared app leaves it empty and suggests none. `centerSlug` is the community an install with
 * nothing chosen opens in the two legacy cases (signed in already, or a link into a screen): the build's own, else the legacy one.
 */
export function communityDefaults(raw: string | undefined): { buildCommunity: string; centerSlug: string } {
  const buildCommunity = (raw ?? '').trim();
  return { buildCommunity, centerSlug: buildCommunity || LEGACY_COMMUNITY_SLUG };
}

export const env = {
  supabaseUrl: (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').trim(),
  supabaseAnonKey: (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '').trim(),
  /** The organization this build was made for (EXPO_PUBLIC_CENTER_SLUG), or '' in the shared app, which asks "Find your community" and suggests none. */
  buildCommunity: communityDefaults(process.env.EXPO_PUBLIC_CENTER_SLUG).buildCommunity,
  /** The community an install with nothing chosen opens when it is already signed in or was opened on a link into a screen (see LEGACY_COMMUNITY_SLUG). */
  centerSlug: communityDefaults(process.env.EXPO_PUBLIC_CENTER_SLUG).centerSlug,
  /** The web domain whose names open a community ("weaverams.org": jsh.weaverams.org opens JSH, app.weaverams.org lists them). Empty: one address for everyone, as before. */
  memberBaseDomain: (process.env.EXPO_PUBLIC_MEMBER_BASE_DOMAIN ?? '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, ''),
  /** Public community dashboard (drawer link) when centers.branding.dashboard_url is not set. */
  communityDashboardUrl: (process.env.EXPO_PUBLIC_COMMUNITY_DASHBOARD_URL ?? '').trim(),
  /** The Weaver portal that creates online checkouts (/api/payments/intent). Without it, online payment is off. */
  portalUrl: (process.env.EXPO_PUBLIC_PORTAL_URL ?? '').trim().replace(/\/+$/, ''),
} as const;

export type EnvVar = {
  name: string;
  purpose: string;
  required: boolean;
  present: boolean;
};

export function envStatus(): EnvVar[] {
  return [
    {
      name: 'EXPO_PUBLIC_SUPABASE_URL',
      purpose: 'Your Supabase project URL, e.g. https://abcd.supabase.co',
      required: true,
      present: env.supabaseUrl.length > 0,
    },
    {
      name: 'EXPO_PUBLIC_SUPABASE_ANON_KEY',
      purpose: 'The project anon (publishable) key. Never a service-role key.',
      required: true,
      present: env.supabaseAnonKey.length > 0,
    },
    {
      name: 'EXPO_PUBLIC_CENTER_SLUG',
      purpose: 'The one organization this build is made for (optional). Leave it unset for the shared app, which asks "Find your community".',
      required: false,
      present: (process.env.EXPO_PUBLIC_CENTER_SLUG ?? '').trim().length > 0,
    },
    {
      name: 'EXPO_PUBLIC_MEMBER_BASE_DOMAIN',
      purpose: 'Web domain whose names open a community, e.g. weaverams.org (optional; web build only. Unset: one address for everyone).',
      required: false,
      present: env.memberBaseDomain.length > 0,
    },
    {
      name: 'EXPO_PUBLIC_COMMUNITY_DASHBOARD_URL',
      purpose: 'Public community dashboard linked from the menu (optional; centers.branding.dashboard_url wins).',
      required: false,
      present: env.communityDashboardUrl.length > 0,
    },
    {
      name: 'EXPO_PUBLIC_PORTAL_URL',
      purpose: 'Weaver portal address for online payments, e.g. https://jsh.communityconnect.app (optional; without it the Pay sheet says online payment is not set up).',
      required: false,
      present: env.portalUrl.length > 0,
    },
  ];
}

export const isConfigured = envStatus().every((v) => !v.required || v.present);

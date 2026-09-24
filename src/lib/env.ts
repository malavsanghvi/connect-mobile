/**
 * Build-time configuration. EXPO_PUBLIC_* values are inlined by the bundler,
 * so each variable must be referenced by its full literal name.
 * See .env.example and README.md.
 */

export const env = {
  supabaseUrl: (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').trim(),
  supabaseAnonKey: (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '').trim(),
  /** Default center (tenant) slug; JSH is tenant #1. */
  centerSlug: (process.env.EXPO_PUBLIC_CENTER_SLUG ?? '').trim() || 'jsh',
  /** Public community dashboard (drawer link) when centers.branding.dashboard_url is not set. */
  communityDashboardUrl: (process.env.EXPO_PUBLIC_COMMUNITY_DASHBOARD_URL ?? '').trim(),
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
      purpose: 'Center to open (optional, defaults to "jsh").',
      required: false,
      present: (process.env.EXPO_PUBLIC_CENTER_SLUG ?? '').trim().length > 0,
    },
    {
      name: 'EXPO_PUBLIC_COMMUNITY_DASHBOARD_URL',
      purpose: 'Public community dashboard linked from the menu (optional; centers.branding.dashboard_url wins).',
      required: false,
      present: env.communityDashboardUrl.length > 0,
    },
  ];
}

export const isConfigured = envStatus().every((v) => !v.required || v.present);

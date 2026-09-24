import './polyfills';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

import type { Database } from './database.types';
import { env, isConfigured } from './env';
import { sessionStorageAdapter } from './storage';

export type AppClient = SupabaseClient<Database, 'app'>;

function notConfigured(): AppClient {
  // The root layout shows the setup screen when env vars are missing, so no
  // screen should reach this. If one does, fail loudly instead of faking data.
  return new Proxy({} as AppClient, {
    get() {
      throw new Error('Supabase is not configured: set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.');
    },
  });
}

export const supabase: AppClient = isConfigured
  ? createClient<Database, 'app'>(env.supabaseUrl, env.supabaseAnonKey, {
      db: { schema: 'app' },
      auth: {
        storage: sessionStorageAdapter,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    })
  : notConfigured();

// Only refresh tokens while the app is in the foreground (Supabase guidance for native).
if (isConfigured && Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      supabase.auth.startAutoRefresh();
    } else {
      supabase.auth.stopAutoRefresh();
    }
  });
}

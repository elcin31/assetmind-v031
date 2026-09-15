import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim() ?? '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ?? '';

let client: SupabaseClient | null = null;
let configurationError: string | null = null;

if (!supabaseUrl || !supabaseAnonKey) {
  configurationError = 'Authentication is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.';
} else {
  try {
    const url = new URL(supabaseUrl);
    if (url.protocol !== 'https:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
      throw new Error('Supabase URL must use HTTPS outside local development.');
    }

    client = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  } catch {
    configurationError = 'Authentication configuration is invalid. Check the Supabase URL and public key.';
  }
}

if (configurationError) {
  console.error(`[AssetMind Auth] ${configurationError}`);
}

export const supabase = client;
export const supabaseConfigurationError = configurationError;

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase client authenticated via a pre-minted broadcast JWT.
 * Used by /broadcast/[id] when accessed via `?t=<token>` (e.g., headless
 * Puppeteer render on the VPS) instead of a user session cookie.
 */
export function createBroadcastClient(token: string) {
  const client = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    }
  );
  client.realtime.setAuth(token);
  return client;
}

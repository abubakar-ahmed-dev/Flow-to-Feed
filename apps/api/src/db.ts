import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "./config/env.js";

let client: SupabaseClient | null = null;

/**
 * Server-side Supabase client using the secret key.
 * Bypasses RLS — every route must enforce ownership itself.
 * Created lazily so unit tests can import route modules without credentials.
 */
export function supabaseAdmin(): SupabaseClient {
  if (!client) {
    const { url, secretKey } = env.supabase;
    if (!url || !secretKey) {
      throw new Error(
        "SUPABASE_URL and SUPABASE_SECRET_KEY must be set to use the database",
      );
    }
    client = createClient(url, secretKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return client;
}

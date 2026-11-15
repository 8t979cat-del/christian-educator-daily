import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getServiceRoleKey, requireSupabaseEnv } from "@/lib/env";

/**
 * Service-role client. It bypasses row-level security, so it is used ONLY for
 * operations the database cannot let a user do themselves, and only after the
 * caller has been authenticated and authorized in code. Returns null when the
 * key is not configured.
 */
export function createAdminClient() {
  const key = getServiceRoleKey();
  if (!key) return null;
  const { url } = requireSupabaseEnv();
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** Anonymous throwaway client used to re-check a password without touching the user's session cookies. */
export function createStatelessClient() {
  const { url, anonKey } = requireSupabaseEnv();
  return createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

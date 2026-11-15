import { getPublicEnv } from "@/lib/env";

export type SupabaseHealth =
  | { status: "not_configured" }
  | { status: "reachable" | "unreachable"; detail?: string };

/**
 * Checks that the configured Supabase project answers. It calls the public
 * auth health endpoint and never returns keys or response bodies.
 */
export async function checkSupabase(): Promise<SupabaseHealth> {
  const env = getPublicEnv();
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return { status: "not_configured" };

  try {
    const response = await fetch(`${url}/auth/v1/health`, {
      headers: { apikey: anonKey },
      signal: AbortSignal.timeout(4000),
      cache: "no-store",
    });
    return response.ok
      ? { status: "reachable" }
      : { status: "unreachable", detail: `HTTP ${response.status}` };
  } catch (error) {
    return {
      status: "unreachable",
      detail: error instanceof Error ? error.name : "request failed",
    };
  }
}

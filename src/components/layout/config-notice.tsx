import { Alert } from "@/components/ui/feedback";
import { isSupabaseConfigured } from "@/lib/env";

/** Shown on auth pages when the server has no Supabase settings, so a dead form is never mistaken for a bug. */
export function ConfigNotice() {
  if (isSupabaseConfigured()) return null;
  return (
    <Alert tone="info" title="Accounts are not connected on this server" className="mb-6">
      Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local to enable sign-in. See the README.
    </Alert>
  );
}

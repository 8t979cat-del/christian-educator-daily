import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { safeNextPath } from "@/lib/auth/redirect";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Landing point for links in Supabase emails (verify email, reset password).
 * Supports both the PKCE `code` flow and the `token_hash` flow.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const next = safeNextPath(searchParams.get("next"), "/today");
  const failure = NextResponse.redirect(new URL("/login?error=link_invalid", origin));

  if (!isSupabaseConfigured()) return failure;

  const supabase = await createClient();
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  let error: unknown = new Error("missing parameters");
  if (code) {
    ({ error } = await supabase.auth.exchangeCodeForSession(code));
  } else if (tokenHash && type) {
    ({ error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash }));
  }

  if (error) return failure;

  // Verifying a new address: confirm it, then send the person to sign in, where the page
  // says "Email verified." Signing out first means the sign-in page shows instead of
  // skipping straight into the app; after signing in, onboarding continues where it was.
  const verifying = searchParams.get("flow") === "verify" || type === "signup" || type === "email";
  if (verifying) {
    await supabase.auth.signOut();
    const login = new URL("/login", origin);
    login.searchParams.set("verified", "1");
    if (next !== "/today") login.searchParams.set("next", next);
    return NextResponse.redirect(login);
  }
  return NextResponse.redirect(new URL(next, origin));
}

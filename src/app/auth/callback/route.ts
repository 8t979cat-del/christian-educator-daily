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

  const verifying = searchParams.get("flow") === "verify" || type === "signup" || type === "email";
  const toLogin = (param: "verified" | "error", value: string) => {
    const login = new URL("/login", origin);
    login.searchParams.set(param, value);
    if (param === "verified" && next !== "/today") login.searchParams.set("next", next);
    return NextResponse.redirect(login);
  };

  // Supabase reports a bad or expired link by adding error parameters instead of a code.
  const linkError = searchParams.get("error_code") ?? searchParams.get("error");
  if (linkError) return toLogin("error", linkError === "otp_expired" ? "link_expired" : "link_invalid");

  if (verifying && code) {
    // Supabase has already confirmed the address before sending the person here with a code.
    // Exchanging the code for a session needs a cookie from the browser that signed up, so it
    // fails when the link is opened in another browser or a mail app; the address is verified
    // either way. They are sent to sign in, so no session is kept even when the exchange works.
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) await supabase.auth.signOut();
    return toLogin("verified", "1");
  }

  let error: unknown = new Error("missing parameters");
  if (code) {
    ({ error } = await supabase.auth.exchangeCodeForSession(code));
  } else if (tokenHash && type) {
    ({ error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash }));
  }

  if (error) return failure;

  // Verifying with a token hash: confirmed above. Send the person to sign in, where the page
  // says "Verification successful." Signing out first means the sign-in page shows instead of
  // skipping straight into the app; after signing in, onboarding continues where it was.
  if (verifying) {
    await supabase.auth.signOut();
    return toLogin("verified", "1");
  }
  return NextResponse.redirect(new URL(next, origin));
}

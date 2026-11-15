import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getPublicEnv } from "@/lib/env";

/**
 * Runs before every matching request. It (1) refreshes the Supabase session
 * cookie and (2) sends signed-out visitors away from protected pages.
 *
 * This is a convenience and a first line of defence, NOT the security
 * boundary: every page, server action and database table checks permissions
 * again on its own (see src/lib/auth/session.ts and the RLS policies).
 */

const PROTECTED_PREFIXES = [
  "/today",
  "/archive",
  "/devotional",
  "/themes",
  "/library",
  "/resources",
  "/community",
  "/school",
  "/settings",
  "/upgrade",
  "/account-status",
  "/welcome",
  "/pilot",
  "/feedback",
  "/onboarding",
  "/admin",
  "/invite",
  "/reset-password",
];
const GUEST_ONLY = ["/login", "/signup", "/forgot-password"];

const matches = (path: string, prefixes: string[]) =>
  prefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));

export async function proxy(request: NextRequest) {
  const env = getPublicEnv();
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  let response = NextResponse.next({ request });
  let signedIn = false;

  if (url && anonKey) {
    const supabase = createServerClient(url, anonKey, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
        },
      },
    });
    try {
      const { data } = await supabase.auth.getUser();
      signedIn = Boolean(data.user);
    } catch {
      signedIn = false;
    }
  }

  const path = request.nextUrl.pathname;

  const redirectTo = (destination: URL) => {
    const redirect = NextResponse.redirect(destination);
    // Keep any refreshed session cookies on the redirect.
    for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
    return redirect;
  };

  if (!signedIn && matches(path, PROTECTED_PREFIXES)) {
    const login = request.nextUrl.clone();
    login.pathname = "/login";
    login.search = `?next=${encodeURIComponent(path + request.nextUrl.search)}`;
    return redirectTo(login);
  }

  if (signedIn && matches(path, GUEST_ONLY)) {
    const home = request.nextUrl.clone();
    home.pathname = "/today";
    home.search = "";
    return redirectTo(home);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/health|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};

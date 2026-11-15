import "server-only";
import type { User } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { cache } from "react";
import { isSupabaseConfigured } from "@/lib/env";
import { myAccountStatus } from "@/lib/governance/queries";
import { createClient } from "@/lib/supabase/server";
import {
  classifyRoles,
  type AccountRole,
  type PlatformRole,
  type SchoolRole,
} from "./roles";

export type Profile = {
  id: string;
  first_name: string;
  last_name: string;
  display_name: string;
  educational_role: string | null;
  grade_levels: string[];
  subjects: string[];
  denomination: string | null;
  school_affiliation: string | null;
  default_translation: string;
  email_frequency: string;
  notify_assignments: boolean;
  notify_community: boolean;
  notify_product: boolean;
  reminder_enabled: boolean;
  reminder_time: string;
  reminder_days: string;
  show_discussions: boolean;
  share_school_aggregates: boolean;
  onboarding_completed_at: string | null;
};

export type SchoolMembership = {
  schoolId: string;
  schoolName: string;
  role: SchoolRole;
};

export type AccessContext = {
  user: { id: string; email: string; emailVerified: boolean };
  profile: Profile;
  memberships: SchoolMembership[];
  platformRoles: PlatformRole[];
  roles: AccountRole[];
};

/**
 * The signed-in user, validated by Supabase Auth on every call (not just read
 * from a cookie). Null when nobody is signed in or auth is not configured.
 */
export const getAuthUser = cache(async (): Promise<User | null> => {
  if (!isSupabaseConfigured()) return null;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getUser();
    return error ? null : data.user;
  } catch {
    return null;
  }
});

/** Everything needed to make permission decisions for the current request. Null if signed out. */
export const getAccessContext = cache(async (): Promise<AccessContext | null> => {
  const user = await getAuthUser();
  if (!user?.email) return null;

  const supabase = await createClient();
  const [profileResult, membershipResult, platformResult] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
    supabase
      .from("school_memberships")
      .select("role, status, schools(id, name)")
      .eq("user_id", user.id)
      .eq("status", "active"),
    supabase.from("platform_roles").select("role").eq("user_id", user.id),
  ]);

  const profile = profileResult.data as Profile | null;
  if (!profile) return null;

  const memberships: SchoolMembership[] = [];
  for (const row of (membershipResult.data ?? []) as Array<{
    role: SchoolRole;
    schools: { id: string; name: string } | { id: string; name: string }[] | null;
  }>) {
    const school = Array.isArray(row.schools) ? row.schools[0] : row.schools;
    if (school) memberships.push({ schoolId: school.id, schoolName: school.name, role: row.role });
  }

  const platformRoles = ((platformResult.data ?? []) as Array<{ role: PlatformRole }>).map((r) => r.role);

  return {
    user: { id: user.id, email: user.email, emailVerified: Boolean(user.email_confirmed_at) },
    profile,
    memberships,
    platformRoles,
    roles: classifyRoles(memberships, platformRoles),
  };
});

/** Requires a signed-in user. Redirects to sign-in otherwise. */
export async function requireUser(): Promise<User> {
  const user = await getAuthUser();
  if (!user) redirect("/login");
  return user;
}

/**
 * Requires a signed-in user with a verified email and a complete profile.
 * Use at the top of every protected page and server action.
 */
export async function requireAccess(options: { allowIncompleteOnboarding?: boolean; allowSuspended?: boolean } = {}): Promise<AccessContext> {
  const ctx = await getAccessContext();
  if (!ctx) redirect("/login");
  if (!ctx.user.emailVerified) redirect("/verify-email");
  // A suspended or closed account sees only its notice and the appeal form.
  if (!options.allowSuspended && (await myAccountStatus())) redirect("/account-status");
  if (!options.allowIncompleteOnboarding && !ctx.profile.onboarding_completed_at) redirect("/onboarding");
  return ctx;
}

/** Requires membership in the given school with one of the allowed roles. Fails closed with a redirect. */
export async function requireSchoolRole(schoolId: string, allowed: SchoolRole[]) {
  const ctx = await requireAccess();
  const membership = ctx.memberships.find((m) => m.schoolId === schoolId);
  if (!membership || !allowed.includes(membership.role)) redirect("/school?notice=not_allowed");
  return { ctx, membership };
}

/** Requires one of the given platform staff roles. */
export async function requirePlatformRole(allowed: PlatformRole[]) {
  const ctx = await requireAccess();
  if (!ctx.platformRoles.some((role) => allowed.includes(role))) redirect("/today");
  return ctx;
}

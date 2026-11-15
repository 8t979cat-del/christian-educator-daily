/**
 * Role model. Pure functions only, so the rules are unit-tested and can be
 * shared by server actions and UI. The database enforces the same rules in
 * row-level security; these helpers exist for early, friendly errors and for
 * deciding what to show. They are never the only check.
 */

export type SchoolRole = "owner" | "admin" | "faculty" | "staff";
export type PlatformRole = "platform_admin" | "content_editor" | "moderator";

export type AccountRole =
  | "individual_teacher"
  | "school_teacher"
  | "school_administrator"
  | "content_editor"
  | "platform_administrator"
  | "community_moderator";

export const ROLE_LABELS: Record<AccountRole, string> = {
  individual_teacher: "Individual teacher",
  school_teacher: "School teacher",
  school_administrator: "School administrator",
  content_editor: "Content editor",
  platform_administrator: "Platform administrator",
  community_moderator: "Community moderator",
};

export const SCHOOL_ROLE_LABELS: Record<SchoolRole, string> = {
  owner: "Owner",
  admin: "Administrator",
  faculty: "Faculty",
  staff: "Staff",
};

export const PLATFORM_ROLE_LABELS: Record<PlatformRole, string> = {
  platform_admin: "Platform administrator",
  content_editor: "Content editor",
  moderator: "Community moderator",
};

type Membership = { role: SchoolRole; status?: string };

/** The six account roles a person currently holds. A person can hold several. */
export function classifyRoles(memberships: Membership[], platformRoles: PlatformRole[]): AccountRole[] {
  const active = memberships.filter((m) => (m.status ?? "active") === "active");
  const roles: AccountRole[] = [];

  if (active.length === 0) roles.push("individual_teacher");
  if (active.some((m) => m.role === "faculty" || m.role === "staff")) roles.push("school_teacher");
  if (active.some((m) => m.role === "owner" || m.role === "admin")) roles.push("school_administrator");
  if (platformRoles.includes("content_editor")) roles.push("content_editor");
  if (platformRoles.includes("platform_admin")) roles.push("platform_administrator");
  if (platformRoles.includes("moderator")) roles.push("community_moderator");

  return roles;
}

export const isSchoolManager = (role: SchoolRole | undefined): boolean => role === "owner" || role === "admin";

/** Owners may invite any role; administrators may invite faculty and staff only. */
export function canInviteRole(actor: SchoolRole | undefined, invited: SchoolRole): boolean {
  if (actor === "owner") return invited !== "owner";
  if (actor === "admin") return invited === "faculty" || invited === "staff";
  return false;
}

/** Mirrors the membership update policies in the database. */
export function canChangeMemberRole(actor: SchoolRole | undefined, current: SchoolRole, next: SchoolRole): boolean {
  if (actor === "owner") return true;
  if (actor === "admin") {
    return (current === "faculty" || current === "staff") && (next === "faculty" || next === "staff");
  }
  return false;
}

export function canRemoveMember(actor: SchoolRole | undefined, target: SchoolRole): boolean {
  if (actor === "owner") return true;
  if (actor === "admin") return target === "faculty" || target === "staff";
  return false;
}

export const isStaffMember = (platformRoles: PlatformRole[]): boolean => platformRoles.length > 0;

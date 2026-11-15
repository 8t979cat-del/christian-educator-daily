import { describe, expect, it } from "vitest";
import {
  canChangeMemberRole,
  canInviteRole,
  canRemoveMember,
  classifyRoles,
  isSchoolManager,
  type SchoolRole,
} from "@/lib/auth/roles";

describe("classifyRoles", () => {
  it("treats someone with no school as an individual teacher", () => {
    expect(classifyRoles([], [])).toEqual(["individual_teacher"]);
  });
  it("maps school roles", () => {
    expect(classifyRoles([{ role: "faculty" }], [])).toEqual(["school_teacher"]);
    expect(classifyRoles([{ role: "owner" }], [])).toEqual(["school_administrator"]);
    expect(classifyRoles([{ role: "admin" }, { role: "faculty" }], [])).toEqual([
      "school_teacher",
      "school_administrator",
    ]);
  });
  it("ignores inactive memberships", () => {
    expect(classifyRoles([{ role: "owner", status: "removed" }], [])).toEqual(["individual_teacher"]);
  });
  it("adds platform roles", () => {
    expect(classifyRoles([], ["content_editor", "platform_admin", "moderator"])).toEqual([
      "individual_teacher",
      "content_editor",
      "platform_administrator",
      "community_moderator",
    ]);
  });
});

describe("school permission helpers", () => {
  const all: SchoolRole[] = ["owner", "admin", "faculty", "staff"];

  it("only owners and admins manage", () => {
    expect(all.filter(isSchoolManager)).toEqual(["owner", "admin"]);
    expect(isSchoolManager(undefined)).toBe(false);
  });
  it("invitations: owner anyone but owner; admin only faculty/staff; others nothing", () => {
    expect(all.filter((r) => canInviteRole("owner", r))).toEqual(["admin", "faculty", "staff"]);
    expect(all.filter((r) => canInviteRole("admin", r))).toEqual(["faculty", "staff"]);
    expect(all.filter((r) => canInviteRole("faculty", r))).toEqual([]);
    expect(all.filter((r) => canInviteRole(undefined, r))).toEqual([]);
  });
  it("an admin cannot touch owners or other admins, or promote anyone", () => {
    expect(canChangeMemberRole("admin", "owner", "faculty")).toBe(false);
    expect(canChangeMemberRole("admin", "admin", "faculty")).toBe(false);
    expect(canChangeMemberRole("admin", "faculty", "admin")).toBe(false);
    expect(canChangeMemberRole("admin", "faculty", "staff")).toBe(true);
    expect(canChangeMemberRole("faculty", "staff", "faculty")).toBe(false);
  });
  it("removal rules", () => {
    expect(canRemoveMember("owner", "admin")).toBe(true);
    expect(canRemoveMember("admin", "admin")).toBe(false);
    expect(canRemoveMember("admin", "faculty")).toBe(true);
    expect(canRemoveMember("faculty", "staff")).toBe(false);
  });
});

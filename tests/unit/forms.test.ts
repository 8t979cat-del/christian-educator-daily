import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { parseForm, readForm } from "@/lib/auth/form-state";
import { changePasswordSchema, emailSchema, passwordSchema, signUpSchema } from "@/lib/auth/schemas";
import { generateInviteToken, hashToken } from "@/lib/auth/tokens";
import { hashToken as dbHashToken } from "../db/harness";

const fd = (entries: Record<string, string | string[]>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) for (const item of [v].flat()) f.append(k, item);
  return f;
};

describe("schemas", () => {
  it("normalises email", () => {
    expect(emailSchema.parse("  Teacher@Example.COM ")).toBe("teacher@example.com");
    expect(emailSchema.safeParse("nope").success).toBe(false);
  });
  it("enforces password rules", () => {
    expect(passwordSchema.safeParse("short1").success).toBe(false);
    expect(passwordSchema.safeParse("onlyletterslong").success).toBe(false);
    expect(passwordSchema.safeParse("1234567890123").success).toBe(false);
    expect(passwordSchema.safeParse("goodpassword12").success).toBe(true);
  });
  it("requires names at sign up", () => {
    const r = signUpSchema.safeParse({ firstName: " ", lastName: "A", email: "a@b.co", password: "goodpassword12" });
    expect(r.success).toBe(false);
  });
  it("change password rejects mismatch and reuse", () => {
    const base = { currentPassword: "oldpassword12", newPassword: "newpassword34", confirmPassword: "newpassword34" };
    expect(changePasswordSchema.safeParse(base).success).toBe(true);
    expect(changePasswordSchema.safeParse({ ...base, confirmPassword: "x" }).success).toBe(false);
    expect(changePasswordSchema.safeParse({ ...base, newPassword: "oldpassword12", confirmPassword: "oldpassword12" }).success).toBe(false);
  });
});

describe("readForm / parseForm", () => {
  it("never echoes passwords back", () => {
    const { echo } = readForm(fd({ email: "a@b.co", password: "secret12345" }));
    expect(echo).toEqual({ email: "a@b.co" });
  });
  it("collects arrays and booleans", () => {
    const { raw } = readForm(fd({ grades: ["k2", "g35"], on: "on" }), { arrays: ["grades", "subjects"], booleans: ["on", "off"] });
    expect(raw).toMatchObject({ grades: ["k2", "g35"], subjects: [], on: true, off: false });
  });
  it("returns field errors and echoed values", () => {
    const r = parseForm(signUpSchema, fd({ firstName: "", lastName: "A", email: "bad", password: "x" }));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(Object.keys(r.state.fieldErrors ?? {})).toEqual(expect.arrayContaining(["firstName", "email", "password"]));
      expect(r.state.values).toMatchObject({ lastName: "A" });
      expect(JSON.stringify(r.state)).not.toContain('"x"');
    }
  });
});

describe("invitation tokens", () => {
  it("are random and url-safe", () => {
    const a = generateInviteToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(generateInviteToken()).not.toBe(a);
  });
  it("hash identically in app code and the database test helper", async () => {
    const t = generateInviteToken();
    expect(hashToken(t)).toBe(createHash("sha256").update(t).digest("hex"));
    expect(await dbHashToken(t)).toBe(hashToken(t));
  });
});

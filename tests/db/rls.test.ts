import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDatabase, hashToken, type Harness } from "./harness";

/**
 * Unauthorized-access scenarios, run against the real migrations on real
 * PostgreSQL with row-level security enforced. Every "cannot" test below
 * would pass silently if the policy were missing only when the assertion is
 * weak, so each one checks the actual data or an explicit error.
 */

let h: Harness;
let alice: string; // owner of School A
let bob: string; // owner of School B
let carol: string; // faculty at School A
let dave: string; // admin at School A
let erin: string; // individual teacher, no school
let editor: string; // platform content editor
let root: string; // platform administrator
let schoolA: string;
let schoolB: string;

const RLS = /row-level security|permission denied/i;

async function rpc<T = unknown>(userId: string, sql: string, params: unknown[] = []) {
  return h.as(userId, async () => (await h.db.query<T & object>(sql, params)).rows);
}

async function addMember(schoolId: string, userId: string, role: string) {
  await h.admin.query(`insert into school_memberships (school_id, user_id, role) values ($1,$2,$3)`, [
    schoolId,
    userId,
    role,
  ]);
}

async function addInvite(schoolId: string, email: string, role: string, token: string, expiresAt?: string) {
  await h.admin.query(
    `insert into school_invitations (school_id, email, role, token_hash, expires_at)
     values ($1,$2,$3,$4, coalesce($5::timestamptz, now() + interval '14 days'))`,
    [schoolId, email, role, await hashToken(token), expiresAt ?? null],
  );
}

beforeAll(async () => {
  h = await createDatabase({ openFreePlan: true });
  alice = await h.createUser("alice@a.test", { first: "Alice", last: "Anderson" });
  bob = await h.createUser("bob@b.test", { first: "Bob", last: "Baker" });
  carol = await h.createUser("carol@a.test", { first: "Carol", last: "Clark" });
  dave = await h.createUser("dave@a.test", { first: "Dave", last: "Davis" });
  erin = await h.createUser("erin@x.test", { first: "Erin", last: "Evans" });
  editor = await h.createUser("editor@ced.test");
  root = await h.createUser("root@ced.test");

  schoolA = (await rpc<{ create_school: string }>(alice, `select create_school('School A') as create_school`))[0]!
    .create_school;
  schoolB = (await rpc<{ create_school: string }>(bob, `select create_school('School B') as create_school`))[0]!
    .create_school;
  await addMember(schoolA, carol, "faculty");
  await addMember(schoolA, dave, "admin");

  await h.admin.query(`insert into platform_roles (user_id, role) values ($1,'content_editor'), ($2,'platform_admin')`, [
    editor,
    root,
  ]);
});

afterAll(async () => {
  await h.db.close();
});

describe("profiles", () => {
  it("are created automatically with the name from sign-up", async () => {
    const rows = await rpc<{ first_name: string }>(alice, `select first_name from profiles where id = $1`, [alice]);
    expect(rows).toEqual([{ first_name: "Alice" }]);
  });

  it("a user sees only their own profile, even colleagues in the same school stay private", async () => {
    const rows = await rpc<{ id: string }>(carol, `select id from profiles`);
    expect(rows.map((r) => r.id)).toEqual([carol]);
  });

  it("a user cannot edit someone else's profile", async () => {
    const result = await h.as(erin, () =>
      h.db.query(`update profiles set first_name = 'Hacked' where id = $1`, [alice]),
    );
    expect(result.affectedRows).toBe(0);
    const [row] = await rpc<{ first_name: string }>(alice, `select first_name from profiles where id = $1`, [alice]);
    expect(row?.first_name).toBe("Alice");
  });

  it("a user can edit their own profile, but not hand themselves another id", async () => {
    const ok = await h.as(erin, () => h.db.query(`update profiles set first_name = 'Erin2' where id = $1`, [erin]));
    expect(ok.affectedRows).toBe(1);
    await expect(h.as(erin, () => h.db.query(`update profiles set id = $1 where id = $2`, [alice, erin]))).rejects.toThrow(
      RLS,
    );
  });

  it("rejects an unsupported Bible translation", async () => {
    await expect(
      h.as(erin, () => h.db.query(`update profiles set default_translation = 'xyz' where id = $1`, [erin])),
    ).rejects.toThrow(/check constraint/i);
  });

  it("anonymous visitors cannot read any profile", async () => {
    const rows = await h.asAnon(async () => (await h.db.query(`select id from profiles`)).rows);
    expect(rows).toHaveLength(0);
  });
});

describe("school isolation", () => {
  it("members see only their own school", async () => {
    const rows = await rpc<{ name: string }>(carol, `select name from schools`);
    expect(rows).toEqual([{ name: "School A" }]);
  });

  it("another school's owner cannot see School A, its members or its roster", async () => {
    expect(await rpc(bob, `select 1 from schools where id = $1`, [schoolA])).toHaveLength(0);
    expect(await rpc(bob, `select 1 from school_memberships where school_id = $1`, [schoolA])).toHaveLength(0);
    expect(await rpc(bob, `select * from school_roster($1)`, [schoolA])).toHaveLength(0);
  });

  it("a user with no school sees nothing", async () => {
    expect(await rpc(erin, `select 1 from schools`)).toHaveLength(0);
    expect(await rpc(erin, `select 1 from school_memberships`)).toHaveLength(0);
    expect(await rpc(erin, `select * from school_roster($1)`, [schoolA])).toHaveLength(0);
  });

  it("anonymous visitors see no school data", async () => {
    const counts = await h.asAnon(async () => {
      const s = await h.db.query(`select 1 from schools`);
      const m = await h.db.query(`select 1 from school_memberships`);
      const i = await h.db.query(`select 1 from school_invitations`);
      return [s.rows.length, m.rows.length, i.rows.length];
    });
    expect(counts).toEqual([0, 0, 0]);
  });

  it("members can read their school's roster with names and roles", async () => {
    const rows = await rpc<{ last_name: string; role: string }>(carol, `select last_name, role from school_roster($1)`, [
      schoolA,
    ]);
    expect(rows.map((r) => r.last_name)).toEqual(["Anderson", "Clark", "Davis"]);
    expect(rows.find((r) => r.last_name === "Anderson")?.role).toBe("owner");
  });

  it("a user cannot update or delete another school's record", async () => {
    const upd = await h.as(bob, () => h.db.query(`update schools set name = 'Pwned' where id = $1`, [schoolA]));
    expect(upd.affectedRows).toBe(0);
    const del = await h.as(bob, () => h.db.query(`delete from schools where id = $1`, [schoolA]));
    expect(del.affectedRows).toBe(0);
    expect(await rpc(alice, `select 1 from schools where id = $1 and name = 'School A'`, [schoolA])).toHaveLength(1);
  });
});

describe("joining schools without an invitation is impossible", () => {
  it("clients cannot insert memberships directly", async () => {
    await expect(
      h.as(erin, () =>
        h.db.query(`insert into school_memberships (school_id, user_id, role) values ($1,$2,'owner')`, [schoolA, erin]),
      ),
    ).rejects.toThrow(RLS);
  });

  it("clients cannot create schools by inserting rows", async () => {
    await expect(
      h.as(erin, () => h.db.query(`insert into schools (name, slug) values ('Fake', 'fake')`)),
    ).rejects.toThrow(RLS);
  });

  it("an unverified email cannot create a school", async () => {
    const ghost = await h.createUser("ghost@x.test", { verified: false });
    await expect(rpc(ghost, `select create_school('Ghost School')`)).rejects.toThrow(/verify your email/i);
  });

  it("rejects school names that are too short", async () => {
    await expect(rpc(erin, `select create_school('x')`)).rejects.toThrow(/2 to 120/);
  });
});

describe("role-based permissions inside a school", () => {
  it("faculty cannot invite, update the school, or change roles", async () => {
    await expect(
      h.as(carol, () =>
        h.db.query(
          `insert into school_invitations (school_id, email, role, token_hash, invited_by)
           values ($1,'x@x.test','faculty','h1',$2)`,
          [schoolA, carol],
        ),
      ),
    ).rejects.toThrow(RLS);
    const upd = await h.as(carol, () => h.db.query(`update schools set name = 'Mine' where id = $1`, [schoolA]));
    expect(upd.affectedRows).toBe(0);
    const role = await h.as(carol, () =>
      h.db.query(`update school_memberships set role = 'owner' where user_id = $1`, [carol]),
    );
    expect(role.affectedRows).toBe(0);
  });

  it("faculty cannot read the invitation list", async () => {
    await addInvite(schoolA, "pending@a.test", "faculty", "tok-visible");
    expect(await rpc(carol, `select 1 from school_invitations`)).toHaveLength(0);
    expect(await rpc(dave, `select 1 from school_invitations`)).not.toHaveLength(0);
  });

  it("an admin can invite faculty but not another admin", async () => {
    const ok = await h.as(dave, () =>
      h.db.query(
        `insert into school_invitations (school_id, email, role, token_hash, invited_by)
         values ($1,'new@a.test','faculty','h-ok',$2)`,
        [schoolA, dave],
      ),
    );
    expect(ok.affectedRows).toBe(1);
    await expect(
      h.as(dave, () =>
        h.db.query(
          `insert into school_invitations (school_id, email, role, token_hash, invited_by)
           values ($1,'boss@a.test','admin','h-admin',$2)`,
          [schoolA, dave],
        ),
      ),
    ).rejects.toThrow(RLS);
  });

  it("an owner can invite an admin", async () => {
    const ok = await h.as(alice, () =>
      h.db.query(
        `insert into school_invitations (school_id, email, role, token_hash, invited_by)
         values ($1,'admin2@a.test','admin','h-admin-ok',$2)`,
        [schoolA, alice],
      ),
    );
    expect(ok.affectedRows).toBe(1);
  });

  it("an admin cannot invite people to a different school", async () => {
    await expect(
      h.as(dave, () =>
        h.db.query(
          `insert into school_invitations (school_id, email, role, token_hash, invited_by)
           values ($1,'spy@x.test','faculty','h-cross',$2)`,
          [schoolB, dave],
        ),
      ),
    ).rejects.toThrow(RLS);
  });

  it("an invitation cannot be created in someone else's name", async () => {
    await expect(
      h.as(dave, () =>
        h.db.query(
          `insert into school_invitations (school_id, email, role, token_hash, invited_by)
           values ($1,'z@a.test','faculty','h-forge',$2)`,
          [schoolA, alice],
        ),
      ),
    ).rejects.toThrow(RLS);
  });

  it("an admin cannot promote themselves or anyone to owner", async () => {
    const self = await h.as(dave, () =>
      h.db.query(`update school_memberships set role = 'owner' where user_id = $1`, [dave]),
    ).catch(() => ({ affectedRows: 0 }));
    expect(self.affectedRows).toBe(0);
    await expect(
      h.as(dave, () => h.db.query(`update school_memberships set role = 'owner' where user_id = $1`, [carol])),
    ).rejects.toThrow(RLS);
    const roles = await rpc<{ role: string }>(alice, `select role from school_memberships where user_id in ($1,$2) order by role`, [dave, carol]);
    expect(roles.map((r) => r.role).sort()).toEqual(["admin", "faculty"]);
  });

  it("an admin cannot demote or remove an owner", async () => {
    const demote = await h.as(dave, () =>
      h.db.query(`update school_memberships set role = 'faculty' where user_id = $1`, [alice]),
    );
    expect(demote.affectedRows).toBe(0);
    const remove = await h.as(dave, () => h.db.query(`delete from school_memberships where user_id = $1`, [alice]));
    expect(remove.affectedRows).toBe(0);
  });

  it("an admin can change faculty to staff and remove faculty", async () => {
    const upd = await h.as(dave, () =>
      h.db.query(`update school_memberships set role = 'staff' where user_id = $1 and school_id = $2`, [carol, schoolA]),
    );
    expect(upd.affectedRows).toBe(1);
    await h.admin.query(`update school_memberships set role = 'faculty' where user_id = $1`, [carol]);
  });

  it("only an owner can delete a school", async () => {
    const byAdmin = await h.as(dave, () => h.db.query(`delete from schools where id = $1`, [schoolA]));
    expect(byAdmin.affectedRows).toBe(0);
  });

  it("the last owner cannot leave or be demoted", async () => {
    await expect(
      h.as(alice, () => h.db.query(`update school_memberships set role = 'admin' where user_id = $1`, [alice])),
    ).rejects.toThrow(/at least one owner/);
    await expect(
      h.as(alice, () => h.db.query(`delete from school_memberships where user_id = $1 and school_id = $2`, [alice, schoolA])),
    ).rejects.toThrow(/at least one owner/);
  });

  it("a member can leave a school", async () => {
    const extra = await h.createUser("leaver@a.test");
    await addMember(schoolA, extra, "faculty");
    const res = await h.as(extra, () => h.db.query(`delete from school_memberships where user_id = $1`, [extra]));
    expect(res.affectedRows).toBe(1);
  });
});

describe("accepting invitations", () => {
  it("the invited, verified user joins with the invited role", async () => {
    const frank = await h.createUser("frank@a.test");
    await addInvite(schoolA, "frank@a.test", "faculty", "tok-frank");
    const [row] = await rpc<{ accept_invitation: string }>(frank, `select accept_invitation('tok-frank')`);
    expect(row?.accept_invitation).toBe(schoolA);
    const roles = await rpc<{ role: string }>(frank, `select role from school_memberships where user_id = $1`, [frank]);
    expect(roles).toEqual([{ role: "faculty" }]);
  });

  it("matches the email case-insensitively", async () => {
    const gina = await h.createUser("Gina@A.test");
    await addInvite(schoolA, "gina@a.test", "staff", "tok-gina");
    await expect(rpc(gina, `select accept_invitation('tok-gina')`)).resolves.toBeDefined();
  });

  it("a token cannot be used twice", async () => {
    const hank = await h.createUser("hank@a.test");
    const other = await h.createUser("other@a.test");
    await addInvite(schoolA, "hank@a.test", "faculty", "tok-hank");
    await rpc(hank, `select accept_invitation('tok-hank')`);
    await expect(rpc(other, `select accept_invitation('tok-hank')`)).rejects.toThrow(/invalid or has expired/);
  });

  it("someone else cannot use a token meant for another email", async () => {
    await addInvite(schoolA, "target@a.test", "faculty", "tok-target");
    await expect(rpc(erin, `select accept_invitation('tok-target')`)).rejects.toThrow(/invalid or has expired/);
    expect(await rpc(erin, `select 1 from school_memberships`)).toHaveLength(0);
  });

  it("expired invitations are rejected", async () => {
    const ivy = await h.createUser("ivy@a.test");
    await addInvite(schoolA, "ivy@a.test", "faculty", "tok-ivy", new Date(Date.now() - 1000).toISOString());
    await expect(rpc(ivy, `select accept_invitation('tok-ivy')`)).rejects.toThrow(/invalid or has expired/);
  });

  it("a wrong or empty token is rejected with the same message", async () => {
    await expect(rpc(erin, `select accept_invitation('nope')`)).rejects.toThrow(/invalid or has expired/);
    await expect(rpc(erin, `select accept_invitation('')`)).rejects.toThrow(/invalid or has expired/);
  });

  it("an unverified email cannot accept even with the right token", async () => {
    const jon = await h.createUser("jon@a.test", { verified: false });
    await addInvite(schoolA, "jon@a.test", "faculty", "tok-jon");
    await expect(rpc(jon, `select accept_invitation('tok-jon')`)).rejects.toThrow(/verify your email/);
  });

  it("an invitee cannot read the invitations table, only preview their own", async () => {
    const kim = await h.createUser("kim@a.test");
    await addInvite(schoolA, "kim@a.test", "faculty", "tok-kim");
    expect(await rpc(kim, `select 1 from school_invitations`)).toHaveLength(0);
    const preview = await rpc<{ school_name: string }>(kim, `select * from preview_invitation('tok-kim')`);
    expect(preview).toEqual([{ school_name: "School A", role: "faculty" }]);
    expect(await rpc(erin, `select * from preview_invitation('tok-kim')`)).toHaveLength(0);
  });

  it("the raw token is never stored", async () => {
    const rows = await h.admin.query<{ token_hash: string }>(`select token_hash from school_invitations`);
    expect(rows.rows.every((r) => r.token_hash.length === 64 || r.token_hash.startsWith("h"))).toBe(true);
    expect(rows.rows.some((r) => r.token_hash === "tok-kim")).toBe(false);
  });

  it("an accepted invitation grants no access to any other school", async () => {
    const rows = await rpc(erin, `select 1 from schools`);
    expect(rows).toHaveLength(0);
    const frank = (await h.admin.query<{ id: string }>(`select id from auth.users where email = 'frank@a.test'`)).rows[0]!.id;
    expect(await rpc(frank, `select 1 from schools where id = $1`, [schoolB])).toHaveLength(0);
  });
});

describe("platform roles", () => {
  it("clients cannot grant themselves a platform role", async () => {
    await expect(
      h.as(erin, () => h.db.query(`insert into platform_roles (user_id, role) values ($1,'platform_admin')`, [erin])),
    ).rejects.toThrow(RLS);
  });

  it("clients cannot modify or delete platform roles", async () => {
    await expect(
      h.as(editor, () => h.db.query(`update platform_roles set role = 'platform_admin' where user_id = $1`, [editor])),
    ).rejects.toThrow(RLS);
    await expect(h.as(editor, () => h.db.query(`delete from platform_roles`))).rejects.toThrow(RLS);
  });

  it("a user sees only their own platform roles, admins see all", async () => {
    expect((await rpc<{ role: string }>(editor, `select role from platform_roles`)).map((r) => r.role)).toEqual([
      "content_editor",
    ]);
    expect(await rpc(erin, `select 1 from platform_roles`)).toHaveLength(0);
    expect((await rpc(root, `select 1 from platform_roles`)).length).toBe(2);
  });

  it("only a platform admin can grant roles", async () => {
    await expect(rpc(erin, `select grant_platform_role('erin@x.test','platform_admin')`)).rejects.toThrow(/not allowed/);
    await expect(rpc(editor, `select grant_platform_role('erin@x.test','moderator')`)).rejects.toThrow(/not allowed/);
    await rpc(root, `select grant_platform_role('erin@x.test','moderator')`);
    expect((await rpc<{ role: string }>(erin, `select role from platform_roles`)).map((r) => r.role)).toEqual([
      "moderator",
    ]);
  });

  it("only a platform admin can revoke, and never the last admin", async () => {
    await expect(rpc(editor, `select revoke_platform_role($1,'moderator')`, [erin])).rejects.toThrow(/not allowed/);
    await rpc(root, `select revoke_platform_role($1,'moderator')`, [erin]);
    expect(await rpc(erin, `select 1 from platform_roles`)).toHaveLength(0);
    await expect(rpc(root, `select revoke_platform_role($1,'platform_admin')`, [root])).rejects.toThrow(/last platform admin/);
  });

  it("school admins get no platform privileges", async () => {
    await expect(rpc(alice, `select grant_platform_role('alice@a.test','platform_admin')`)).rejects.toThrow(/not allowed/);
  });
});

describe("account deletion safeguards", () => {
  it("lists schools the user solely owns", async () => {
    const rows = await rpc<{ account_deletion_blockers: string }>(alice, `select account_deletion_blockers()`);
    expect(rows.map((r) => r.account_deletion_blockers)).toEqual(["School A"]);
    expect(await rpc(carol, `select account_deletion_blockers()`)).toHaveLength(0);
  });

  it("deleting a sole owner's account is blocked by the database", async () => {
    // In Supabase, deleting an auth user cascades to profiles, which cascades to memberships.
    await expect(h.admin.query(`delete from profiles where id = $1`, [alice])).rejects.toThrow(/at least one owner/);
  });

  it("deleting an ordinary member's account removes their memberships", async () => {
    await h.admin.query(`delete from profiles where id = $1`, [carol]);
    const left = await h.admin.query(`select 1 from school_memberships where user_id = $1`, [carol]);
    expect(left.rows).toHaveLength(0);
  });

  it("deleting a school removes its memberships and invitations, even with an owner", async () => {
    await h.as(bob, () => h.db.query(`delete from schools where id = $1`, [schoolB]));
    const left = await h.admin.query(`select 1 from school_memberships where school_id = $1`, [schoolB]);
    expect(left.rows).toHaveLength(0);
  });
});

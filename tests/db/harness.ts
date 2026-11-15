import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";

/**
 * Real PostgreSQL (PGlite) with just enough of Supabase emulated to exercise
 * the actual migrations and row-level security policies:
 *   - auth.users and auth.uid() (reads request.jwt.claim.sub like Supabase)
 *   - the anon and authenticated roles with Supabase's default table grants
 * Migrations are applied from supabase/migrations unchanged.
 */
export async function createDatabase(opts: { openFreePlan?: boolean; strictGovernance?: boolean; launchDefaults?: boolean } = {}) {
  const db = new PGlite();

  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create schema auth;
    create table auth.users (
      id uuid primary key default gen_random_uuid(),
      email text unique,
      email_confirmed_at timestamptz,
      raw_user_meta_data jsonb not null default '{}'
    );
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    grant usage on schema auth to anon, authenticated;
    grant usage on schema public to anon, authenticated;
    -- Supabase grants everything on new public objects to these roles by default.
    alter default privileges in schema public grant all on tables to anon, authenticated;
    alter default privileges in schema public grant all on functions to anon, authenticated;
    alter default privileges in schema public grant all on sequences to anon, authenticated;
  `);

  const dir = join(process.cwd(), "supabase", "migrations");
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    await db.exec(readFileSync(join(dir, file), "utf8"));
  }

  const uid = () => crypto.randomUUID();

  async function createUser(
    email: string,
    opts: { verified?: boolean; first?: string; last?: string } = {},
  ): Promise<string> {
    const id = uid();
    await db.query(
      `insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
       values ($1, $2, $3, $4)`,
      [
        id,
        email,
        opts.verified === false ? null : new Date().toISOString(),
        JSON.stringify({ first_name: opts.first ?? "Test", last_name: opts.last ?? email.split("@")[0] }),
      ],
    );
    return id;
  }

  // Older suites test features that are not about billing, and use old dates and free users.
  // Opening the free plan keeps them about what they test; billing.test.ts uses the real defaults.
  if (opts.openFreePlan) {
    await db.exec(`
      update plan_features set enabled = true, limit_value = null
        where plan_key = 'free' and feature_key in ('devotional_archive_days', 'create_groups', 'archive_advanced_search');
      update plan_features set limit_value = null where plan_key = 'free' and feature_key = 'bookmarks_limit';`);
  }

  // Older suites are not about the covenant or group review. They run with those two gates off;
  // governance.test.ts passes strictGovernance to test the real defaults.
  if (!opts.strictGovernance) {
    await db.exec(`
      update governance_settings set value = 'false' where key = 'covenant_required';
      update community_settings set value = 'false' where key = 'group_requires_approval';`);
  }

  // Production starts with every interactive feature CLOSED (migration 0009). Older suites test what the features do,
  // so they open them; launch.test.ts passes launchDefaults to test the closed starting state and the safety gate.
  if (!opts.launchDefaults) {
    await db.exec(`
      update community_settings set value = 'true' where key in (
        'public_discussions_enabled', 'prayer_contributions_enabled', 'prayer_acknowledgements_enabled', 'groups_enabled',
        'group_creation_enabled', 'group_posting_enabled', 'group_invitations_enabled', 'school_administration_enabled',
        'paid_subscriptions_enabled');`);
  }

  /** Runs the callback as a signed-in user, with row-level security enforced. */
  async function as<T>(userId: string, fn: () => Promise<T>): Promise<T> {
    await db.exec(`set role authenticated`);
    await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [userId]);
    try {
      return await fn();
    } finally {
      await db.exec(`reset role`);
      await db.query(`select set_config('request.jwt.claim.sub', '', false)`);
    }
  }

  /** Runs the callback as an anonymous visitor. */
  async function asAnon<T>(fn: () => Promise<T>): Promise<T> {
    await db.exec(`set role anon`);
    try {
      return await fn();
    } finally {
      await db.exec(`reset role`);
    }
  }

  /** Privileged setup, bypassing row-level security (like the service role). */
  const admin = db;

  return { db, admin, createUser, as, asAnon };
}

export type Harness = Awaited<ReturnType<typeof createDatabase>>;

/** Hash an invitation token exactly as the database does. */
export async function hashToken(token: string): Promise<string> {
  const bytes = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

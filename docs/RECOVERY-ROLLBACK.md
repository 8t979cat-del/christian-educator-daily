# Recovery and rollback procedures

Backups and restores were **not rehearsed** in this build (there is no live project). Treat everything here as a plan to be rehearsed, not a proven procedure.

## 1. Quick stops (seconds, no deploy)

These are the first tools to reach for. All are in **Admin → Launch**, require a platform administrator, and take effect immediately. Nothing is deleted.

| Problem | Do this |
|---|---|
| Something is going wrong in discussions | Switch off **Public devotional discussions** |
| A prayer-related concern | Switch off **Prayer contributions** and/or **Prayer acknowledgements** |
| A concern inside groups | Switch off **Group posting**, then **Groups** if needed. Existing groups stay readable by members |
| Unwanted new groups or invitations | Switch off **Creating groups** / **Group invitations** |
| Billing trouble | Switch off **Paid subscriptions**; checkout closes. Existing subscriptions continue |
| One person | Suspend them from the moderation screens |
| The whole pilot | Set the pilot status to **closed** (Admin → Pilot): pilot access ends at once |
| One school | Set the school's stage to **declined**: its codes are revoked and its pilot license stops |

Closing is always allowed. Opening an interactive feature again is refused until community safety readiness is complete.

## 2. Application rollback

The application is stateless. To roll back a bad release, redeploy the previous good deployment in the host (Vercel: Deployments → the last good one → Promote / Instant Rollback). Do not roll back across a database migration without reading section 3.

## 3. Database changes

Migrations are forward-only. There are no down scripts, deliberately: a down migration that drops tables destroys data.

- **Before** every production migration: confirm a recent backup exists, and ideally take a manual backup or note the point-in-time.
- **If a migration fails midway:** each file runs inside the migration tool's transaction; confirm nothing was partially applied (`supabase migration list`). Fix forward with a new numbered migration.
- **If a migration was applied and is wrong:** write a new migration that corrects it. Use `create or replace function` for logic, and never edit an already-applied file.
- Restoring a backup is the last resort for data damage, not for code mistakes.

## 4. Restoring data

1. Decide the target time: the last moment before the damage.
2. Restore to a **new** Supabase project (point-in-time or the latest daily backup). Do not restore over production first.
3. Check the restored copy: sign in as a test administrator, spot-check devotionals, groups and the audit log.
4. Point the application at it (change the two Supabase variables and the service key), or copy only the damaged tables back with care.
5. Re-issue sessions: users sign in again. Check the Stripe webhook still reaches the app and that Stripe's event log has no gap (Stripe retries failed events for days; replay any missed ones from the Stripe dashboard).
6. Write down what happened in the audit notes, and tell affected schools plainly.

**Rehearsal (do before launch):** restore the latest staging backup into a scratch project, run `select count(*)` on a few tables, and sign in. Record the time it took.

## 5. Specific situations

- **Leaked secret:** rotate it at the source (Supabase, Stripe, the cron secret, the error-report token), update the host's secret store, redeploy, and check the audit log and Stripe for unexpected activity. A leaked service-role key is a full-database compromise: treat as an incident.
- **Wrong person given a code or owner role:** revoke the code (Admin → Pilot), remove the member from the school page, and check the school's group memberships.
- **Content published by mistake:** retract or unpublish it from Admin → Devotionals; discussions attach only to live content, so they close with it.
- **Stripe webhook failing:** check `/api/stripe/webhook` responses in the host logs. A 400 is a bad signature or payload (check the secret); a 5xx makes Stripe retry, which is what you want while the cause is fixed.
- **Retention job not running:** check the cron configuration and that `CRON_SECRET` matches. Retention can also be run from Admin → Audit and retention.

## 6. Who decides

Name, now, the person with authority to (a) switch features off, (b) close the pilot, (c) restore from backup, and a deputy. This document cannot choose them for you.

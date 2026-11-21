# Production deployment guide

**Status: prepared, not performed.** Nothing in this guide has been run against a live Supabase project, Stripe account, domain or host. Every step below needs a person's explicit approval before it is done. Do not skip the "Stop and ask" lines.

Hosting is **assumed to be Vercel** (the repository never pinned a host; `vercel.json` carries the daily retention cron). Any Node host works if you replace the cron step and keep the same environment variables.

## 0. Three environments, kept apart

| | Development | Staging | Production |
|---|---|---|---|
| `APP_ENV` | `development` | `staging` | `production` |
| Supabase project | local or a throwaway | its own project | its own project |
| Stripe | test keys | **test** keys | **live** keys, only after approval |
| Real people | no | internal testers only | the approved pilot |
| Env file template | `.env.example` | `.env.staging.example` | `.env.production.example` |

Never point staging at the production database. Never put live Stripe keys anywhere except production's secret store. The environment check (below) refuses a test key in production and a live key anywhere else.

## 1. Secrets

- Secrets live only in the host's secret store (Vercel project settings) and your password manager. They are never committed; `.env.staging` and `.env.production` are git-ignored.
- `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `CRON_SECRET` and `ERROR_REPORT_TOKEN` are server-only. Only `NEXT_PUBLIC_*` names reach the browser; the check flags any public name that looks like a secret.
- Generate `CRON_SECRET` with `openssl rand -hex 32` (at least 32 characters).
- Rotate any key that was ever pasted into chat, a ticket or a screenshot.

## 2. Environment variables

| Name | Where | Notes |
|---|---|---|
| `APP_ENV` | all | `development`, `staging` or `production` |
| `NEXT_PUBLIC_SITE_URL` | all | https and not localhost in staging/production |
| `NEXT_PUBLIC_SITE_TIMEZONE` | all | IANA name; defaults to `America/Los_Angeles` (Pacific Time); decides when "today" changes |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | all | the anon key is public by design; RLS protects data |
| `SUPABASE_SERVICE_ROLE_KEY` | server | required in production (webhook, retention) |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | server | **leave blank until live billing is approved** |
| `CRON_SECRET` | server | required in production; also authorizes the detailed health report |
| `ERROR_REPORT_URL`, `ERROR_REPORT_TOKEN` | server | https endpoint of your error service; required in production |

Verify a file before using it. The check prints names and verdicts, never values:

```
node --env-file=.env.production scripts/check-env.mjs     # or: npm run check:env
```

It exits non-zero on any error. The same check is shown (names only) on **Admin → Launch**.

## 3. Database

Apply migrations **in order**, to staging first: `0001` through `0009` in `supabase/migrations/`. Each is written to run once on a fresh database.

```
supabase link --project-ref <STAGING-REF>
supabase db push
```

Then repeat for production. **Stop and ask** before the first production push: it is a one-way step for that environment.

After migrating:

1. Sign up the first person, then follow README "First platform administrator" to grant `platform_admin`.
2. Confirm the 9 launch switches are all off (Admin → Launch). They are off by default. Direct messaging cannot be enabled at all.
3. Confirm Row Level Security is on for every table (the test suite checks this, but also look in the Supabase dashboard).

## 4. Authentication (Supabase dashboard)

- **Site URL** = your production URL. **Redirect URLs** = `https://YOUR-DOMAIN/auth/callback` and the staging equivalent. Remove localhost from production.
- **Confirm email** must be on. The pilot requires a verified address.
- **Password policy:** enable leaked-password protection and a sensible minimum length.
- **Rate limits:** keep Supabase's defaults or tighter.
- **Custom SMTP (required before real users):** Supabase's built-in sender is for testing and is heavily rate-limited. Configure a real transactional provider (your school's or a service such as Postmark, Resend or SES), a verified sending domain with SPF, DKIM and DMARC, and a real "from" address. Test sign-up, password reset and email-change from a normal inbox, including spam folder placement. **The application sends no email itself**; Supabase auth email is the only transactional email in this release.

## 5. Domain and HTTPS

- Add the domain in the host, set the DNS records it gives you, and wait for the certificate.
- Redirect `http` to `https` and the bare domain to one canonical host.
- The app already sends HSTS and a strict Content Security Policy (see `next.config.ts`). After the first deploy, open the site and look for CSP violations in the browser console; fix before inviting anyone.
- Confirm `NEXT_PUBLIC_SITE_URL` exactly matches the live address.

## 6. Payments (leave closed for the pilot)

The pilot does **not** need Stripe. Pilot schools get a time-limited school license from their access code, and the `paid_subscriptions_enabled` switch keeps checkout closed. To open paid plans later, and only with explicit approval:

1. In Stripe **live** mode create the products and prices (see README "Stripe setup").
2. Add the live keys to production's secret store; re-run the environment check.
3. Add the webhook endpoint `https://YOUR-DOMAIN/api/stripe/webhook` and its signing secret.
4. Run one real, small, refundable purchase yourself in production and watch the subscription appear. Refund it.
5. Only then switch **Paid subscriptions** on in Admin → Launch.

## 7. Error monitoring and logging

- Server errors are reported through `src/instrumentation.ts` to `ERROR_REPORT_URL` as a sanitized JSON post: error name, short message, digest, path without the query string, method and release. No cookies, bodies, emails or user ids. At most 20 reports a minute.
- Point it at any HTTPS collector (a Sentry-compatible relay, a webhook into your chat). If you prefer a vendor SDK, add it later; this endpoint is deliberately vendor-neutral.
- Structured logs (`src/lib/ops/log.ts`) write one JSON line per event to the host's log stream and redact keys that look like secrets, emails, bodies, prayers or notes.
- Verify by deliberately causing a server error on staging and confirming the report arrives.

## 8. Health and cron

- `GET /api/health` returns only `{"status":"ok"}` (200) or `{"status":"degraded"}` (503) to the public. With `Authorization: Bearer $CRON_SECRET` it adds environment and database details. Point your uptime monitor at the public form.
- `vercel.json` schedules `/api/cron/retention` daily; Vercel adds the bearer header from `CRON_SECRET` automatically. Confirm one run in the logs and in Admin → Audit.

## 9. Backups and recovery

See **docs/RECOVERY-ROLLBACK.md**. In short: enable Supabase backups for the production project (point-in-time recovery needs a paid tier), and **rehearse one restore into a scratch project before launch**. An untested backup is not a backup.

## 10. Performance

- Pages are server-rendered on demand; common reads use indexed queries, and a test asserts every foreign key has an index.
- Before launch run Lighthouse on `/`, `/today` and a presentation page on a mid-range phone and a school-grade laptop. Record the numbers. They were not measured in this build environment.
- Keep the Vercel function region next to the Supabase region.

## 11. Go / no-go checklist (run on staging, then production)

- [ ] `npm test`, `npm run typecheck` and `npm run build` pass on the exact commit.
- [ ] `check:env` passes for that environment; no test key in production.
- [ ] Migrations 0001–0009 applied; first administrator created.
- [ ] Custom SMTP verified end to end.
- [ ] Error report received from a deliberate staging error.
- [ ] Backup enabled and one restore rehearsed.
- [ ] Legal documents (terms, privacy notice, consent for adults) reviewed by counsel and published. **This was open item H-04 in the audit and is not done.**
- [ ] Admin → Launch: every community safety item and sign-off complete, content readiness has no blocking items.
- [ ] A named human has approved production deployment in writing.

**Stop and ask** before: the first production migration, adding live Stripe keys, switching any community feature on, and inviting any real person.

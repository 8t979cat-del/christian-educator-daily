# Final launch assessment

Date of assessment: 14 November 2026. Scope: preparation for a controlled production launch and a founding-school pilot.

## Verdict

**Prepared, not launched. Not production-ready.** Everything that could be built and tested without live services has been. A pilot with three to five invited Christian schools becomes reasonable **only after the gates below are cleared by people**, not by software. Deployment, live billing and real invitations were **not** done and need explicit approval.

Deploying the application would not mean the business is validated. Nothing here shows that schools want this, will use it or will pay for it. That is what the pilot is for, and its first honest result may be "not yet".

## Evidence

| Check | Result |
|---|---|
| Automated tests (real PostgreSQL engine, real migrations) | 562 passing in 19 files; 36 are new for launch and pilot |
| Deliberate breakage of four key gates (readiness gate, messaging lock, prayer-acknowledgement gate, access-code throttle) | each caught by a failing test; the migration was restored and the suite is green |
| Strict TypeScript | clean |
| Production build | succeeds |
| Dependency audit | 0 known vulnerabilities |
| Browser gate on public pages (axe, WCAG 2.2 A/AA rules, CSP, reflow, reduced motion) | passed |
| Classroom presentation script | passed (10 slides, print to PDF, swipe, presenter sync) |
| Environment check | catches a test Stripe key and a weak secret in production; refuses non-zero |
| New routes signed out | redirect to sign-in |

## Features implemented

- **Feature switches** for every item you listed except that direct messaging has no switch at all: it cannot be enabled. Nine switches, all off by default, each enforced in the database and independently reversible. Opening an interactive one is refused until safety readiness is complete.
- **Community safety readiness**: automatic checks (a human moderator; covenant required) plus eight recorded human sign-offs; audited.
- **Content readiness**: fourteen-day schedule, author credits, grade labels, verified Scripture licences, prayer-prompt sign-off.
- **Founding-school pilot**: pilots with dates; schools as prospects until agreement is recorded; hashed, single-display access codes with limits, expiry and throttling; controlled enrollment; a time-limited school license that ends by date; interest and conversion tracking.
- **Pilot dashboard**: all ten measures you listed, as totals only, hidden for small groups, no scoring, no private prayers, no group text.
- **Feedback**: in-app survey, bug report, feature request, triage screen, retention.
- **Educator onboarding**: `/welcome` tour, covering all eight topics you named.
- **Operations**: environment check, redacting logger, sanitized error reporting, minimal health endpoint, retention cron configuration, separate environment templates.
- **Documentation**: deployment, administration, onboarding, moderation, pilot setup (with survey, interview guide and review process), privacy and retention, troubleshooting, recovery and rollback, limitations, backlog.

## Features deferred

Email from the application; invitation emails; urgent-report paging; self-service data export and deletion; school-level dashboards for school admins; pilot data export; direct messaging (never in this release); student accounts; paid plans for the pilot. See docs/BACKLOG.md.

## Readiness by area

**Deployment: not started (by instruction).** Configurations and a deployment guide exist. No host, domain, certificate, project or secret has been created. Hosting (Vercel) is an assumption.

**Security: good in the code and database, unproven in operation.** Row-level security and function permissions are tested; secrets are kept out of the browser and logs; the environment check refuses dangerous combinations; headers and CSP are set. Not done: a live penetration test, a secrets-rotation drill, verifying CSP on the real domain.

**Privacy: not ready.** Controls are built (aggregate-only analytics, private prayers, screened student names, retention). But there is **no terms of use, privacy notice or adult consent flow (audit H-04)**, no self-service export or deletion, and retention periods are unreviewed defaults. This is the largest blocker, and it needs counsel.

**Community moderation: ready to be made ready.** The gate, tools and guide exist. Nothing is true until you name moderators, write the escalation and response expectations, rehearse the controls on staging, and record the sign-offs. Urgent reports do not page anyone, so a human routine for that must exist.

**Content: not ready.** Only AI-drafted sample devotionals exist. Real, theologically reviewed, human-written devotionals must be scheduled fourteen days ahead, and every Scripture translation's licence confirmed with its publisher. The Launch page measures the schedule, not the quality.

**Billing: deliberately closed.** Pilot schools do not need Stripe. Checkout is closed by a switch and by missing live keys. Billing has never run against Stripe, even in test mode, from here. Run a full test-mode checkout on staging before ever opening it.

**Pilot onboarding: ready to rehearse.** Codes, enrollment, dates, license, metrics, feedback, tour and orientation exist and are tested at the database level. The signed-in screens have not been seen in a browser against a live backend.

## What was not verified

Live Supabase, live Stripe, domain/HTTPS, SMTP delivery, error collector, backups and restores, load and device performance, screen-reader use, signed-in screens in a browser, and anything legal. See docs/KNOWN-LIMITATIONS.md.

## Recommended next steps, in order

1. **Counsel**: terms, privacy notice, adult consent; confirm retention and school data terms. (Clears H-04.)
2. **Content**: commission and review the first 14+ devotionals; confirm Scripture licences.
3. **Staging**: create the staging Supabase project; apply migrations; custom SMTP; error collector; test-mode Stripe checkout; rehearse backup restore; run a signed-in browser pass with real accounts (including axe on signed-in pages and one screen-reader pass).
4. **People**: name two moderators; write escalation and response expectations; rehearse the moderation controls; record the sign-offs.
5. **Approval**: a named person approves, in writing, production deployment.
6. **Production, narrowly**: deploy; leave every switch off; verify health, errors, retention.
7. **Pilot, carefully**: invite one school you already have a relationship with; record its agreement; hand out codes; open reading and the classroom first, then discussions, then prayer, then groups, a week apart, watching the queue.
8. **Learn**: run the weekly feedback review; decide, with evidence, whether to continue, change or stop.

## Approvals this work did *not* take

No irreversible production change was made. No live billing was activated. No real user was invited. No school was assumed to have agreed. Direct messaging remains locked off.

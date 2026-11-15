# Pre-launch security, privacy, accessibility and quality audit

Audit date: 14 November 2026. Scope: the whole platform as built through migrations 0001–0007 plus this audit's fixes (0008).
Nothing was deployed. Direct messaging was **not** enabled; it was locked off (M-04).

## 1. Recommendation

| Question | Answer |
|---|---|
| Any **Critical** defect open? | **No.** None was found. |
| Any **High** defect open? | **One, and it is not a code defect:** H-04, there is no Terms of Service, Privacy Notice or signup consent (section 4). It needs counsel, so I did not write it. |
| Ready for a **controlled pilot**? | **Yes, conditionally**: invite-only, adult educators only, after the launch gates G1–G8 in section 11 are met. G1 (legal documents) and G2 (a real Supabase and Stripe test-mode run) are hard blockers. |
| Ready for **production / general availability**? | **No, and this report does not say it is.** Several things could not be verified from this environment (section 10), and legal compliance cannot be established by automated tests. |

The three High code defects found (H-01 to H-03) are fixed, each with a regression test that was shown to fail when the fix was removed.

## 2. What was and was not tested

**Run, and passing:** 512 automated tests (database, billing, webhook route, content, reader, presentation, forms); strict TypeScript; a production `next build`; 0 known vulnerabilities in dependencies (`npm audit`, production and dev); a browser gate (`npm run verify:quality`) over the public pages at desktop, phone and 320px widths with axe-core against WCAG 2.2 A/AA rules, CSP-violation watching, reflow, reduced motion, skip-link and focus-indicator checks; the classroom-presentation script (`npm run verify:present`: 10 slides, print to PDF, swipe, presenter sync).

**Not verified, and why** (also in section 10): nothing was run against a live Supabase project or Stripe account; signed-in screens were not rendered in a browser (no backend), so axe was **not** run on them; no screen reader was used; backup and restore were not exercised; real load was not generated; legal compliance cannot be tested.

How the database was tested: every migration runs in an in-process Postgres (PGlite) with row-level security on, and test code calls it as a particular user or as an anonymous visitor, the way a hostile client could, bypassing the app's own server actions. That harness simulates Supabase's `auth.uid()` and roles; **it is not Supabase.** Gate G2 exists to close that gap.

## 3. Functional testing report

| Area | Result | Evidence |
|---|---|---|
| Daily devotional loading, archive, search, Scripture display (licensed translations only) | Pass | `reader.test.ts`, `cms.test.ts`, `content.test.ts`, `reader` unit tests |
| Reflection and prayer sections, discussion question, application | Pass | content tests; classroom script |
| Classroom presentation mode (slides, text size, theme toggle, print, tablet swipe, presenter window) | Pass | `verify:present`, `present.test.ts` |
| Bookmarks, collections, teacher resources, premium locks and teasers | Pass | `billing.test.ts`, `reader.test.ts` |
| Registration, login, password recovery, account settings, account deletion | Pass at the form, redirect and database level | `forms.test.ts`, `redirect.test.ts`, `roles.test.ts`, `rls.test.ts`. The pages load and are accessible when signed out; the signed-in settings pages were **not** browser-tested. |
| Mobile responsiveness | Pass on public pages (375px, 320px) after M-02 | `verify:quality` |
| Existing features after community and billing were added | Pass | full suite, 512 tests; the 459 earlier tests all still pass unchanged apart from the intended changes below |
| Production build and type check | Pass | `next build`, `tsc --noEmit` |

Existing tests that had to change, and why: governance tests now pass `accept_covenant(version, true)` (H-02); the community test that posts text naming a student pauses the new screening trigger for its one setup insert (H-01); the DM data-model test sets the dormant flag by direct SQL because the application can no longer do so (M-04). No test was weakened to make a defect pass.

## 4. Prioritized defect list

Severity: Critical = lets someone read or change what they must not, or breaks money; High = breaks a stated promise or leaves a serious privacy gap; Medium = real but contained or defence-in-depth; Low = polish or minor exposure.

| ID | Sev | Finding | Status |
|---|---|---|---|
| H-01 | High | The screening for email, phone, links and **named students** ran only in server actions. Anyone calling the database API directly could post identifiers of students. | **Fixed** (0008 triggers on contributions, replies, group posts and group comments, on insert and on edit; SQL and TypeScript rules checked against each other in a parity test) |
| H-02 | High | The community is for adults but nothing asked or recorded it. | **Fixed**: accepting the covenant now requires and records an 18+ confirmation, enforced in the database. An acceptance without it does not count. |
| H-03 | High (privacy) | When a devotional stopped being live (unpublished, archived, or locked after a downgrade), its contributions became invisible to their authors, and because row-level security applies the select policy to a delete's WHERE clause, authors **could not delete or edit their own prayers and replies**. Only deleting the whole account removed them. | **Fixed**: authors can always see and delete their own rows; editing still needs a live devotional. |
| H-04 | High (launch) | No Terms of Service, Privacy Notice, or consent step at signup. Prayer text can reveal religious belief and sometimes health or family details. | **Open, by design.** I cannot safely author legal text. Gate G1. |
| M-01 | Medium | No Content-Security-Policy or HSTS. | **Fixed in part**: CSP (no framing, no plugins, `form-action` limited, connections limited to this site and the configured Supabase project), HSTS, COOP and a stricter Permissions-Policy added and verified in a browser with no violations. **Open:** `script-src` still has `'unsafe-inline'` (Next.js hydration scripts); a per-request nonce is the follow-up. User text is never rendered as HTML (no `dangerouslySetInnerHTML` anywhere), so this is a second layer, not the first. |
| M-02 | Medium (WCAG 1.4.10) | `/login`, `/signup` and `/forgot-password` scrolled sideways at 320px: the shared `Alert` text column had no `min-w-0`. | **Fixed** (also the upgrade notice). The browser gate now fails if any public page scrolls at 320px. |
| M-03 | Medium | About 20 foreign keys on tables that grow with use had no index (for example `group_comments.group_id`), slowing cascading deletes and several RLS lookups. | **Fixed** (0008 indexes; a test now fails if a new foreign key lacks one unless it is on the small staff-attribution allowlist). |
| M-04 | Medium | A platform administrator could switch on `direct_messages_enabled` from the moderation page, enabling database endpoints that have no safety design and no interface. | **Fixed**: the RPC refuses to enable it, the toggle is replaced by a note, and the key is out of the action's allowed list. |
| M-05 | Medium | **Edits are not rate limited** and not checked for duplicates (inserts are). A person could edit one contribution repeatedly. Screening still applies on every edit. | **Open.** Low abuse value; add a per-user edit limit before wide launch. |
| M-06 | Medium | No error monitoring or alerting is wired up (a placeholder comment in the error boundary). | **Open.** Gate G4. |
| M-07 | Medium | A member who is removed from a group, or whose group is suspended, cannot delete their own posts there until the group acts; account deletion does remove them. This is arguably correct (the group owns the moderation record) but it is a choice to make deliberately. | **Open, product decision.** |
| M-08 | Medium (privacy) | When a person deletes their account, reports about their words keep a text snapshot (365 days, then cleared) so moderators can still act. The link to the person is removed. | **By design, documented.** Must be stated in the Privacy Notice. |
| L-01 | Low | `/api/health` is public and reveals whether the database is reachable. | Open. Acceptable for uptime checks; consider returning only `ok` publicly. |
| L-02 | Low | The internal `/styleguide` is public and linked from the footer; axe finds repeated unnamed landmarks there. | Open. Remove from the public footer or name the regions. |
| L-03 | Low | Pure helper functions (`has_platform_role`, `has_school_role` and trigger functions) are executable by anonymous callers. They read nothing for an anonymous user and are needed by policies. A test pins the list. | Accepted. |
| L-04 | Low | At 320px **with** 200% text, `/` and `/verify-email` scroll by 42px and 19px. WCAG tests reflow and text resize separately, and each passes alone. | Open. |
| L-05 | Low | Screening is a heuristic (it cannot recognise every identifying detail), by design. | Documented; reporting and moderation back it up. |

## 5. Security audit findings

**Public community.** Verified in the database, not just the app (`audit.test.ts`): a contribution needs a live, readable devotional (null, invented, draft, scheduled, archived and plan-locked ids all refused); authors cannot change `user_id`, `devotional_id`, `kind` or any moderation column; others (including moderators and administrators) cannot edit or delete another person's rows through the tables; replies cannot go onto private, hidden or blocked contributions or be forged as another author; anonymous visitors are refused on every community table and function; an unverified email cannot take part; a restricted person cannot post, reply, acknowledge or write in a group, and the restriction lifts when it expires; bursts of posts and replies hit the rate limit and a repeat of the same words is refused; hostile strings (`<script>`, SQL, huge input, search operators) are stored inertly and searched safely, and are escaped on output because nothing is rendered as HTML.

**Prayer.** One acknowledgement per person (duplicates are no-ops), none on your own prayer, none on private prayers, none on reflections; direct inserts into the acknowledgements table only succeed where the same checks pass; anonymous prayers expose neither the author nor who prayed, to other users, moderators or administrators; blocking hides a person's prayers from the blocker only; authors edit and delete their own; ordering is by time only, a test reads the function source and refuses any ordering by counts. No ranking, leaderboard or engagement metric exists, and platform analytics are aggregate only.

**Private groups.** Outsiders, platform administrators, moderators, editors and school administrators of other groups cannot read posts, comments, rosters or acknowledgements by id, table, function or guessed URL, and a group they cannot see behaves as non-existent. They cannot write into a group, attach a comment to another group's post, or impersonate a member. Private groups cannot be joined by request or found in the directory. Removal ends access at once; a suspended group is closed; deletion removes everything. School groups are walled from other schools. A group report goes to the group first and does not reach platform staff unless escalated; the reporter is not shown to the group.

**Direct messaging.** Off by default; every endpoint, table and function refuses; ordinary educators, moderators **and platform administrators** cannot turn it on (M-04).

**Billing and licensing.** Clients cannot write subscriptions, grants, plan features or customers, call `billing_apply_event`, or grant themselves a plan. Premium content is closed to free users through tables, search and community. Existing billing tests cover upgrade and downgrade, trials, cancellation to period end, expiry without a job, failed renewal with grace, signature verification (tampered body, timestamp, wrong or empty secret, replay, rotation), idempotent replays, out-of-order events, retry on a 5xx, seat assignment and limits, and strict school isolation. The webhook reads the raw body, verifies before parsing, and returns 5xx only when a retry can help.

**Other code review.** No HTML sinks; no hardcoded secrets (the secret scan found none); the service key is used only on server routes; the cron route uses a constant-time secret check and does nothing if unconfigured; the auth callback validates `next` against open redirects; logs contain error codes, not request bodies or card data; the Stripe client does not echo keys.

## 6. Privacy and youth-protection review

This section describes how the software behaves. **It is not legal advice and does not establish compliance.**

- **Adults only.** No student account type exists in either role enum (tested). Community writes need a verified email, the covenant, and now an 18+ confirmation, all enforced in the database. Student-facing features are not built; before any are, see the considerations below.
- **Data minimisation.** Profiles hold a name and settings; no birth date, location or phone; no third-party analytics, advertising or tracking scripts are loaded (checked); platform analytics are aggregate only; school engagement totals are suppressed until enough people are counted, and school administrators see totals, not an individual's private activity, and cannot see private prayers or unrelated groups.
- **Consent.** The covenant is recorded with its version and the adult confirmation. **There is no Terms or Privacy Notice and no consent record at signup (H-04).** Marketing email consent does not exist because no marketing email exists.
- **Account deletion.** Verified: deleting an account removes contributions, replies, acknowledgements, group content and memberships, saved state, covenant records, restrictions and the profile; deletion is blocked while the person holds an active subscription, or is the only owner of a school or group, so nothing is orphaned. Reports keep a de-linked snapshot for moderation (M-08).
- **Retention** (settings, adjustable by a platform administrator, run by the protected cron route): report snapshots 365 days after closing, moderation snapshots 730, audit log 730, Stripe event log 400, usage counters 800. Backups are outside the application: Supabase's backup retention applies and deleted data can persist there until it ages out; this must be disclosed. **Not verified (G3).**
- **Sensitive prayer content.** Prayers are written for other educators to read, so a reminder is shown on the composer; student names, contact details and links are now blocked in the database; people can post privately or anonymously; anonymous authorship is hidden even from staff through the API. Free text can still contain private details the heuristics cannot detect; moderation and reporting handle that. Prayer text may reveal religious belief and sometimes health or family information, which many privacy laws treat as sensitive.
- **Logging.** Application logs record error codes, not bodies. Staff actions go to an audit log with an expiry. Real log retention depends on the host and has not been configured.
- **Third parties (processors to disclose and sign terms with):** Supabase (database, auth, email), Stripe (payments; checkout is Stripe-hosted, which keeps card data off the platform), the hosting provider, and whatever email provider is configured. No others are used.
- **School data isolation.** Tested in both directions for rosters, seats, subscriptions, assignments, tools and groups.

**Legal and contractual considerations to take to counsel** (not an exhaustive or authoritative list): a Terms of Service and Privacy Notice; data-processing agreements with Supabase and Stripe and a subprocessor list; school contracts and data-processing terms (and school procurement often requests an accessibility conformance report); US children's and student privacy law **if** student features are ever added (COPPA, FERPA and its "school official" arrangements, state student-privacy statutes and their contract requirements); GDPR/UK GDPR if EU or UK people sign up (lawful basis, explicit consent for religious-belief data, data-subject requests, international transfer terms); CCPA/CPRA for California residents; email-sending rules; accessibility obligations (ADA, Section 508 for public schools); Bible translation licence terms (handled per translation in the CMS, and each licence must be verified by a person); and the mandatory-reporting and safeguarding duties some church and school contexts carry when someone discloses harm in a prayer or group.

## 7. Accessibility report (toward WCAG 2.2 AA)

Automated and browser results (public pages only: home, classroom demo, pricing, login, signup, forgot/reset password, verify email, styleguide):

| Check | Result |
|---|---|
| axe-core, WCAG 2.0/2.1/2.2 A and AA tags, desktop and phone | **0 violations** on every real page; 1 moderate best-practice finding on the internal styleguide (L-02) |
| Keyboard: first tab stop is "Skip to main content"; 25 further tab stops per page; no trap | Pass |
| Visible focus indicator on every tab stop | Pass |
| Reduced motion (`prefers-reduced-motion`) | Pass: no element animates or transitions |
| Reflow at 320px (WCAG 1.4.10) | Pass after M-02 |
| Text resize to 200% at desktop width | Pass: no horizontal scroll |
| Mobile (375px, touch) | Pass |
| Classroom projector readability | Pass in `verify:present`: type scales with the larger-text control (36px to 43px tested), light and dark themes, large touch targets, slides split rather than shrunk |
| Colour contrast | axe's contrast rules pass on the pages rendered, in the default theme. Dark theme and the classroom themes were not separately run through axe. |
| Form labels and errors | Components are built with labels, described-by errors and an announced `role="alert"` message; verified in code and by axe on the login and signup forms. |

**Not verified:** every signed-in screen (community composer and replies, groups, moderation, billing and upgrade, school tools, admin) was not rendered in a browser and not run through axe; no screen reader (NVDA, VoiceOver, TalkBack) was used; focus management after submitting a form or opening a dialog on signed-in pages was reviewed in code, not tested; subscription checkout happens on Stripe's hosted page, whose accessibility is Stripe's. Automated tools find only part of the real problems, so passing here is a floor. Gate G6 asks for a manual pass before the pilot.

## 8. Performance and reliability

Shape tests (`tests/db/performance.test.ts`, 20,000-plus rows seeded), on an in-process database that shows query design, not production capacity: a page of a 6,000-item discussion, deep keyset pages, search, the prayer filter, a thread of 4,000 replies and a group with 3,000 posts and 4,000 comments are all served in bounded pages in well under the test limits; the busy-discussion query is index-backed (verified with `EXPLAIN`); foreign-key index coverage is enforced by a test (M-03). Pages in the browser loaded in under 200 ms locally with no backend.

Reliability already covered by tests: webhook retries and duplicates are safe, events that arrive out of order cannot roll state back, unmatched events fail loudly and succeed on retry, content-publishing transitions are checked against the same table in the database and the app, and expiry needs no scheduled job.

**Not verified:** concurrent load on a hosted database, connection limits, cold starts, CDN behaviour, network interruptions in the browser, publishing failure recovery against a real host, **backup and restore**, error monitoring (M-06).

## 9. Fixes completed

Migration `0008_security_hardening.sql`: screening triggers (H-01), adult confirmation (H-02), own-row visibility and edit rule (H-03), DM lock (M-04), 21 indexes (M-03). Application: adult checkbox and server validation, moderation page, `next.config.ts` security headers (M-01), `Alert` and upgrade-notice reflow (M-02), footer status link no longer prefetched as a page (it left a request hanging). New: `tests/db/audit.test.ts` (48 tests), `tests/db/performance.test.ts` (5), `scripts/verify-quality.cjs` (`npm run verify:quality`; needs Playwright and axe-core available, which are not project dependencies).

Regression tests proved by mutation: removing the screening triggers fails 3 tests; ignoring the adult flag fails 1; removing the own-row policies fails 1; allowing the DM switch fails 1.

## 10. Remaining risks

1. No real-backend run: Supabase's real JWT and PostgREST layer, Stripe's real signatures and dashboards, email delivery, and cron scheduling are unverified. The test harness is faithful but is not them.
2. H-04: no legal documents or signup consent.
3. Backups, restore and log retention unverified; deleted data may persist in backups.
4. Signed-in accessibility not tested in a browser or with assistive technology.
5. CSP still permits inline scripts (M-01).
6. No error monitoring or alerting (M-06).
7. Edits are not rate limited (M-05); screening is heuristic (L-05); moderator capacity and response time are an organisational risk the software cannot solve.
8. Load behaviour at scale is untested.
9. Content and licensing: every Bible translation licence and every devotional's originality must be verified by a person before publishing.

## 11. Launch readiness checklist

**Before a controlled pilot (invite-only, adult educators):**

- [ ] **G1** Terms of Service and Privacy Notice reviewed by counsel, linked from signup and the footer, acceptance recorded; pilot participants agree in writing. *(blocker)*
- [ ] **G2** Deploy to a staging Supabase and Stripe **test mode**: run migrations 0001–0008; run the whole signup, verify, covenant, post, group, upgrade, downgrade, cancel, failed-payment and school-seat path by hand; replay Stripe CLI webhooks, including a duplicate and an out-of-order one; confirm row-level security under real JWTs. *(blocker)*
- [ ] **G3** Confirm point-in-time backups are on; do one restore drill and record the time it took.
- [ ] **G4** Add error monitoring and an uptime check on `/api/health`; decide who is paged.
- [ ] **G5** Set `CRON_SECRET`, the Stripe keys and webhook secret, the site URL and HTTPS; schedule the daily retention call; keep `covenant_required` and `group_requires_approval` on (they are the defaults).
- [ ] **G6** Manual keyboard and screen-reader pass of the signed-in flows (composer, groups, moderation, upgrade) and run `npm run verify:quality` plus axe on them.
- [ ] **G7** Name the moderators, agree a response time and an escalation route for disclosures of harm, and have the covenant text approved by the ministry.
- [ ] **G8** Re-run `npm test`, `npm run typecheck`, `npm run build`, `npm audit`, `npm run verify:quality` and `npm run verify:present` on the exact release build.

**Before general availability:** nonce-based CSP; edit rate limit; load test on the hosted stack; accessibility conformance report if schools ask for one; decide M-07; review L-01 and L-02; counsel sign-off on student-privacy terms before any student-facing feature is designed; a separate safety design before direct messaging is ever considered.


---

**Update after the launch-preparation milestone (migration 0009).** L-01 is reduced: the public health response is only `ok` or `degraded` (it still reveals, in one word, whether the database answered); details need the cron bearer token. H-04 (legal documents) remains **open**. See `docs/LAUNCH-ASSESSMENT.md`.

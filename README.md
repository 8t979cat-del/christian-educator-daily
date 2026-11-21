# Everyday Devotional: 180 Days

(Formerly "Christian Educator Daily". The repository and package keep the old name.)

Application foundation for the Christian Educator Daily platform: Next.js (App Router), TypeScript, Tailwind CSS v4 and Supabase.

## Status

**Current state: prepared for a controlled launch and founding-school pilot; not deployed, not production-ready.** Built: foundation, accounts, devotional CMS, reader experience, classroom presentation, community, billing and school licensing, governance, a security/QA audit, and now launch readiness and a pilot program (migration `0009`). Nothing has been deployed, no live billing is active, and no real user has been invited. Start with `docs/LAUNCH-ASSESSMENT.md`.

The older milestone notes below describe the accounts milestone and are kept for reference.

Accounts (this milestone):

- Register by email, verify email, sign in and out, reset and change password, edit profile, notification preferences, delete account
- Onboarding: name, educational role, grade levels, subjects, school affiliation, denomination (optional), Bible translation, notifications
- Six roles. Individual teacher, school teacher and school administrator come from school membership. Platform administrator, content editor and community moderator come from the `platform_roles` table.
- School organizations: an administrator creates a school, invites teachers by email address, and teachers accept through a single-use link
- Authorization in three layers: `src/proxy.ts` redirects signed-out visitors, server pages and actions re-check with `requireAccess` / `requireSchoolRole` / `requirePlatformRole`, and Postgres row-level security enforces it in the database

Not built yet: classroom mode, billing, **invitation emails** (the invitation link is shown to the administrator to copy and send), community and the moderation queue (the moderator role exists but has no features yet).

## Getting started

Requires Node.js 20.9 or newer.

```bash
npm install
cp .env.example .env.local   # then edit; the app runs with it blank
npm run dev                  # http://localhost:3000
```

Other scripts: `npm run typecheck`, `npm test`, `npm run build`, `npm start`.

## Environment

All variables are documented in `.env.example`. `.env.local` is git-ignored. Never commit real keys.
Variables are validated in `src/lib/env.ts`. With the Supabase variables blank the app still renders, and `GET /api/health` reports `supabase: not_configured`.

## Database and Supabase setup

Apply the migrations in order (`supabase db push`): `0001_foundation.sql`, `0002_accounts_and_permissions.sql`, `0003_devotional_cms.sql`. **None has been run against a live Supabase project.** 0002 and 0003 are exercised against real Postgres (PGlite) by the test suite. 0003 replaces the empty placeholder `devotionals` and `topics` tables from 0001.

In the Supabase dashboard:

1. Authentication > Providers > Email: enable, and turn **Confirm email** on.
2. Authentication > URL Configuration: set Site URL to `NEXT_PUBLIC_SITE_URL` and add `<site>/auth/callback` to the redirect allow-list.
3. Set `SUPABASE_SERVICE_ROLE_KEY` on the server only. It is needed for account deletion and for showing staff emails on `/admin`.
4. Supabase's built-in email sender is rate-limited; configure custom SMTP before real use.

### First platform administrator

There is deliberately no sign-up path to staff roles. After creating your account, run once in the SQL editor:

```sql
insert into platform_roles (user_id, role)
select id, 'platform_admin' from auth.users where email = 'you@example.com';
```

After that, administrators grant and revoke staff roles at `/admin`. The last administrator cannot be removed.

## Devotional content management

Editors (platform role **content editor** or **platform administrator**) work under `/admin`:

| Page | Purpose |
| --- | --- |
| `/admin/devotionals` | Search and filter every devotional by status and category |
| `/admin/devotionals/new`, `/admin/devotionals/[id]` | Rich-text editor, workflow buttons, history |
| `/admin/devotionals/[id]/preview` | Exactly what readers will see, including the licensing fallback |
| `/admin/themes`, `/admin/themes/[id]` | Weekly themes: five devotionals, Monday to Friday, published together |
| `/admin/translations` | Per-translation licensing records (administrators edit; editors read) |

Readers (any signed-in user) get `/today` and the searchable `/archive`.

**Fields.** Title, date, weekly theme, daily topic, Scripture reference, translation, Scripture text (only where licensed), reflection, prayer, discussion question, practical application, intended audience, grade levels, educational category (one of five contexts), one of the fifteen content categories, author, and status. "Editorial status" is draft, in review or approved; "publication status" is unpublished, scheduled, published or archived. Both come from the single six-value `status` so they can never disagree.

**Workflow.** Draft, In review, Approved, Scheduled, Published, Archived.

```
draft -> in_review -> approved -> scheduled -> published -> archived -> (restore) draft
                 \-> draft   \-> published (publish now)
```

Saving never publishes. Every rule below is enforced in Postgres, not just in the interface:

- Only `transition_devotional()` can change status. Clients have no `UPDATE` privilege on the status, approval or publication columns.
- Moving to review or beyond requires every required field to be filled in.
- An author cannot approve their own devotional (a platform administrator may).
- Editing approved or scheduled content returns it to draft for re-approval. Published content may be corrected in place, and every earlier version is kept.
- Every transition is logged with who, when and an optional note.
- One devotional can be scheduled or live per calendar day.
- Archived content is read-only until restored to draft. Archived means withdrawn from readers; the archive page lists published devotionals only.
- Readers see only live content (published, or scheduled and past its time). This does not depend on a background job: `publish_due_devotionals()` only keeps the recorded status accurate, and runs whenever an editor opens the devotionals list. Call it from a scheduled job as well if you want exact `published_at` values without anyone visiting.
- "Today" and scheduled times use `NEXT_PUBLIC_SITE_TIMEZONE`.

**Weekly themes.** A theme has a Monday start date and holds one devotional per weekday. "Publish the week" needs exactly five approved devotionals and then publishes them together: days that have already started go live now, later days are scheduled for midnight on their own date. It can be undone for upcoming days.

**Scripture licensing.** Text is stored and shown only for translations whose record says so. WEB, KJV and ASV are seeded as public domain. NIV, ESV, NLT, NASB, CSB and NKJV are seeded as **reference only**. A platform administrator can record a licence (with the attribution it requires) to allow a translation's text, and can withdraw it, which immediately removes stored text for that translation. The database refuses to store text for a translation that does not allow it, so the editor, the API and direct SQL all hit the same rule. Reference-only passages are shown as a reference plus a link to read the passage on Bible Gateway. The licence page records terms that staff enter; it is not legal advice. Confirm each translation's terms with its publisher before enabling it.

**Rich text** is stored as a restricted JSON document (paragraphs, headings, bold, italic, lists, quotes), never as HTML. The server rebuilds every document from an allow-list, and it is rendered as React elements, so pasted scripts, links, images and code cannot be stored or run.

**Search.** `search_devotionals()` is full-text (stemming and ranking over title, topic, reference, category and body), with filters for category, grade band, theme and date range, and paging. It runs with the caller's permissions, so readers cannot find unpublished content however they ask.

**Sample content.** `supabase/seed/001_patience_week.sql` adds one original week, "Patience in the Classroom", for 16 to 20 November 2026. It loads as five **unreviewed drafts**, drafted by an AI assistant as starting material. Nothing is published, and an editor must review, edit and approve it. Scripture text is included only for the four public-domain KJV passages; Friday cites the NIV by reference only. Load it with the service role or SQL editor: `psql "$DATABASE_URL" -f supabase/seed/001_patience_week.sql`.

## Daily devotional experience

What a signed-in teacher sees:

- **Today** (`/today`, the first screen after login): date, weekly theme and day, title, Scripture reference, a reflection preview, **Read devotional**, **Present to class**, a one-tap completed toggle, the prayer prompt, the discussion question, a Mon–Fri week strip with completion marks, and a search box. If nothing is published for today it shows the latest earlier devotional and says so.
- **Devotional page** (`/devotional/[id]`): six numbered sections (Today's theme, Scripture, Reflection, Prayer, Think about it, Put it into practice), previous/next navigation (never past today), bookmark, mark completed, share, print, and private notes that autosave. Print hides all app chrome and the notes.
- **Present to class** (`/devotional/[id]/present`): full-screen slides (title, Scripture, reflection, discussion, practice, prayer). Arrow keys/space/swipe to move, `F` full screen, `Esc` exits, text size and light/dark toggles (remembered in the browser). Personal notes are never shown.
- **Archive** (`/archive`): keyword search, Scripture reference search (`Galatians 6` matches that chapter exactly, and `John 3` does not return `1 John 3`; a bare book name or word is a keyword search), filters, a **Saved** tab, and completed/saved markers. **Weekly themes** at `/themes` and `/themes/[id]` (days not yet live show "Coming Wednesday").
- **Daily reminder** (Settings): see limits below.

Data: migration `0004_reader_experience.sql` adds `devotional_user_state` (bookmark, completion, note; private to each user by row-level security, tested against admins and editors too) and reminder preferences on `profiles`. Migration `0003` now also stores `scripture_book` / `scripture_chapter` for exact reference search.

### Honest limits

- **Reminders are a calendar file, not notifications.** Settings produces a recurring `.ics` event (floating local time, with an alarm) that the teacher adds to their own calendar. There is no email or push delivery yet, and the interface says so.
- **Sharing** sends a link (Web Share or copy). Recipients need an account; licensed Scripture text is never included in the share.
- Bible text still appears only for translations flagged `text_allowed`; otherwise the reference and a Bible Gateway link.
- The seeded devotionals are AI-drafted originals that a human editor has not reviewed.
- Not verified: everything signed-in has run only against PGlite (real Postgres in WASM), not a live Supabase project; the signed-in pages have not been exercised end to end in a browser. Only the unauthenticated pieces (reader sections and print rendering on `/styleguide`) and route protection were checked in a browser or with curl. Migrations 0003 and 0004 have not been applied to a hosted database.

## Classroom presentation mode

One click from the dashboard ("Present to class") opens a full-screen, distraction-free presentation of the day's devotional. The click itself asks the browser for full screen, so there is no second step.

**Slides**, in order: weekly theme, devotional title, the Scripture passage, reflection, discussion question, practical application, closing prayer. Teachers choose which to show (Settings, or `S`).

**Scripture:** the full authorized passage is displayed from the devotional, with no copy and paste. Long passages are split between verses (never mid-word) across as many slides as needed so the type stays large, and the text is auto-fitted to the screen. Reference and translation name can be hidden; a small copyright or public-domain notice always stays with the text. If a translation's text is not licensed for display, the slide shows the reference and "Open your Bible", and the text is never sent to the browser.

**Controls:** arrows, Space, PageUp/PageDown (works with slide clickers), Home/End, swipe on touch screens, Back/Next buttons, progress dots, `+`/`-` or A-/A+ for text size, `F` full screen, `B` blank the screen, `N` notes, `S` settings, `Esc` closes a panel, leaves full screen, then exits. Controls fade out after 3 seconds so only the slide remains. The screen is kept awake where the browser allows.

**Look:** four backgrounds (White, Cream, Dark, High contrast), all at least 7:1 contrast (checked in tests). "Younger students" mode uses larger type, friendlier headings and shorter slides.

**Presenter notes:** the teacher's private note on the devotional. Hidden by default, with a warning that a mirrored screen shows them. For a projector, open the **presenter window** (Settings), a second window with the current slide, the next slide, notes, a timer and controls. Drag the class screen to the projector and keep the presenter window on the laptop. The two windows talk through the browser (BroadcastChannel), so they must be on the same computer and browser.

**Print / PDF:** "Print slides, or save as PDF" prints one slide per landscape page, black on white. It uses the browser's print dialog, so PDF means "Save as PDF" there. There is no server-side PDF generator.

Settings are remembered per browser (localStorage), not per account.

**Testing.** `tests/unit/present.test.ts` covers splitting, pagination (no text lost, reordered or repeated), settings and contrast. `npm run verify:present` (with the app running on port 3111) is a browser simulation using Playwright against the public demo at `/classroom-demo`: nine screen sizes from a 390 px phone to 2560x1440, three Scripture lengths (up to 1 Corinthians 13, about 1,750 characters) at two text sizes; launch in one click; keyboard, swipe, blanking, settings, young-students mode, reference-only translation, presenter-window sync, and a PDF export check (page count, landscape, full text present).

**Limits.** The simulation drives the public demo with sample content, not a signed-in session, because there is no live Supabase project. The signed-in route (`/devotional/[id]/present`) is built on the same component and its access guards were checked with curl only. Real projectors, clickers and Chromebooks have not been tried. Full-screen on launch depends on the browser allowing it (iPhone Safari does not support it for pages). Named landscape print pages work in Chromium browsers; others may print the slides in portrait.

## Community: Reflect Together and private groups

**Principle.** Content initiates conversation. Scripture grounds it. Community grows through shared reflection and prayer. There is no public feed, no standalone public post, no trending, no streaks and no engagement ranking.

### Two environments
| | Public devotional community | Private groups |
|---|---|---|
| Where | "Reflect Together" on each published devotional | `/community/groups/...` |
| Who writes | Verified educators, as responses to that devotional only | Active members, original posts allowed |
| Who reads | Verified educators (single entitlement check `community_entitled()`) | Members only |
| Enforced by | `devotional_id NOT NULL` + RLS requiring a live devotional | Membership predicates in RLS and read functions |

Migration: `supabase/migrations/0005_community.sql` (one file; reuses `profiles`, `schools`, `devotionals`, `platform_roles`, `set_updated_at`, and the invitation/token pattern from 0002).

### Tables (spec name, where it lives)
`community_contributions` and `contribution_replies` (public); `prayer_acknowledgements`; `contribution_reports` (covers all content types); `community_groups`; `group_memberships` (roles owner/moderator/member); `group_moderators` (view over memberships); `group_posts`, `group_comments`; `group_invitations`, `group_join_requests`; `moderation_actions` (append-only log); `moderation_appeals`; `community_restrictions`; `user_blocks`; `community_settings` (feature flags); `community_rate_events`; `direct_conversations`, `direct_messages` (flagged off). Also `profiles.show_discussions`.

### Permissions matrix
| Action | Reader | Author | Group member | Group moderator | Group owner | Platform moderator | Platform admin |
|---|---|---|---|---|---|---|---|
| Read public discussion | yes | yes | yes | yes | yes | yes (+ hidden) | yes (+ hidden) |
| Post public reflection/prayer/question/encouragement | yes | | | | | yes | yes |
| Edit/delete own contribution | | yes | | | | | |
| Hide public content | | | | | | yes (not own) | yes (not own) |
| Read a private group | | | yes | yes | yes | **no** | **no** |
| Post/comment in a group | | | yes (active) | yes | yes | no | no |
| Hide a group member's post | | | | yes (members only) | yes (anyone but self) | only after escalation | only after escalation |
| Remove/pause a group member | | | | members only | anyone but self | | |
| Edit settings, change roles, delete group | | | | | yes | | |
| Suspend a whole group | | | | | | yes | yes |
| Restrict a person (pause/ban) | | | | | | yes (not staff) | yes (not staff) |
| Resolve appeals | | | | | | yes (not own decision) | yes |
| Change feature flags | | | | | | | yes |

Nobody can moderate their own content or resolve a report they filed. Every row above is enforced in the database, not just the UI.

### Prayer behaviour
A prayer is a stored type, with optional title and visibility: shared with name, shared anonymously, or private (only you). Before sharing a prayer others can read, the composer shows a reminder (no student, family or colleague details) which must be acknowledged. "I prayed for this" is a quiet toggle that shows a plain count on that prayer. Nobody, including the author, can see who prayed (acknowledgements are readable only by the person who made them). You cannot acknowledge your own prayer, a private or hidden one, or a non-prayer. Lists are chronological; there is no sort by acknowledgements anywhere. Anonymous means anonymous at the API level: the author column cannot be selected by clients (column privileges) and read functions return no author for anonymous prayers; anonymous prayers cannot be blocked (that would identify the author by elimination).

### Group privacy and membership
Private groups do not appear anywhere and answer "not found" to non-members. Discoverable groups appear in the directory with name, description and purpose only; no members, counts or content. Joining a discoverable group is by request, approved by a leader; private groups are by emailed invitation (token hash only stored, tied to a verified email, 14-day expiry). A school-linked group admits only members of that school. Platform staff cannot read private group content; a group report reaches them only when a group leader escalates it, or automatically when the group owner is the one reported. Owners must hand over ownership before leaving a non-empty group; an emptied group is deleted.

### Moderation, reporting, appeals
Reporting is by reason (not "I disagree"), one report per person per item, with a snapshot kept so deletion cannot erase evidence. Moderators hide (reversible), warn, dismiss, restrict or suspend; they never hard-delete, and the author always sees the reason in Community notices. Respectful theological disagreement is explicitly not a violation (dismissal leaves no mark). Anyone can appeal within 30 days; a different moderator reviews it (a platform administrator may when no one else is available); overturning restores the content, membership or access. Repeat violations are counted from the last 180 days of hide/warn/restrict actions that were not overturned, and are shown to moderators; nothing is automatic. Blocking hides a person's content from you and ends messaging; they are not told.

### Abuse prevention
Database rate limits (per hour and per day, `P0429`) on contributions, replies, posts, comments, reactions, reports, invitations, join requests, appeals, blocks and group creation; duplicate-text refusal within 10 minutes; length limits as check constraints; app-layer screening (`src/lib/community/screening.ts`) blocks emails, phone numbers, links and obvious "my student <Name>" disclosures in public text. **This screening is heuristic and will miss things**; reporting and moderation are the real safeguards. Output is rendered as plain text by React (no raw HTML). Schedule `select purge_community_rate_events();` daily.

### Feature flags (`community_settings`, platform admin only, UI at `/community/moderation?tab=settings`)
`public_discussions_enabled` (on), `groups_enabled` (on), `group_creation` (`verified` | `school_admins` | `staff`), `max_groups_owned_per_user` (3), `direct_messages_enabled` (**off, and the application cannot turn it on in this release**). Each teacher can also hide "Reflect Together" in Settings; reading, printing and classroom presentation never depend on it.

### Messaging
Group conversation is the supported channel. One-to-one messaging is modelled and permissioned in the database only (shared active group, no block, neither person restricted, flag on; emails and phone numbers are never exposed) and has **no user interface**. The application refuses to enable the flag (migration 0008); a future release must do so deliberately, after its own safety design.

### Routes
`/community` hub; `/community/covenant`; `/community/groups` (directory); `/community/groups/new`; `/community/groups/[id]` (+ `/members`, `/settings`, `/moderation`); `/community/invite/[token]`; `/community/notices` (notices, appeals, blocks); `/community/moderation` (reports, appeals, restrictions, settings; platform moderators); and the "Reflect Together" section on `/devotional/[id]` (filters `r_kind`, search `r_q`, sort `r_sort`, cursor `r_ts`/`r_id`).

### Local testing
```bash
npm install
VITE_CONFIG_NATIVE_IGNORE_WARNING=true npx vitest run      # includes tests/db/community.test.ts (real migrations on PGlite)
npx tsc --noEmit && npm run build
```
With a Supabase project: apply migrations through `0005_community.sql`; create two verified accounts; make one a moderator (`insert into platform_roles (user_id, role) values ('<uuid>','moderator')`); open a published devotional, post as one account, report/hide/appeal across the two.

### Not built / needs your attention
- Not exercised against a live Supabase project or in a signed-in browser (none exists in this environment). The database logic is tested on PGlite; UI was verified by type check, production build, route-protection checks and a visual/keyboard check of the components with sample data.
- No email or push notifications (invitation links are copied by hand; people learn of moderation in Community notices).
- No 1:1 messaging UI; no pinned posts; no ban lists beyond removal; no automatic hiding; no relevance sorting; public discussion is attached to devotionals only (the model can be extended to other published resources).
- Deleting an account deletes that person's contributions, replies and reactions (reports about them keep a snapshot).
- Entitlement is "verified email" today; subscription billing is intentionally not started. Change `community_entitled()` when it is.
- Schedule `purge_community_rate_events()`; decide your `group_creation` policy before launch.

## Subscriptions, premium features and school licensing

**Plans** (Free Educator, Educator Plus, School License) are rows in `plans`, `features` and `plan_features`; prices are rows in `plan_prices`. Nothing about what a plan includes, how long a grace period lasts or what a price is lives in code. A platform administrator edits all of it at `/admin/billing`, and changes apply immediately.

**Entitlements are decided in the database.** `has_feature(key)` / `feature_limit(key)` compute from subscription rows that only the server (service role) can write. Premium devotionals and the older archive are hidden by the row-level policy on `devotionals`, so a client that bypasses the app still cannot read them. Advanced search filters, bookmark limits, collections, resources, group creation and the school tools are enforced the same way. The UI only mirrors these answers; it never grants access.

**Community is never paywalled.** Reading, posting reflections/prayers/questions/encouragement, acknowledging prayers and joining groups need no plan. Only *creating* a group needs Educator Plus (or a school license for school groups). Standalone public posting stays impossible on every plan. Payment does not lift restrictions, hide moderation decisions or open private groups.

**Payments** use Stripe through a small REST client (`src/lib/billing/stripe.ts`). Checkout, the customer portal, interval changes, seat changes and cancel-at-period-end all *start* a change at Stripe. State only changes when `/api/stripe/webhook` receives a signed event: the signature and timestamp are verified (`signature.ts`), then `billing_apply_event()` applies it atomically, idempotently (event id) and in order (stale events are ignored). An event that cannot be matched yet returns 500 so Stripe retries.

### Lifecycle

| Situation | What happens |
|---|---|
| Free → paid | Webhook creates the subscription; features switch on. Trial offered once per account/school. |
| Individual expires or cancels | Access runs to the end of the paid period (+ configurable slack). Then premium features stop. Bookmarks, notes, collections, writing and groups are kept; only creating new premium things is blocked. |
| Payment fails | `past_due`: access continues for `past_due_grace_days` (default 7) with an in-app notice, then stops. Paying restores it at once. |
| School cancels / lapses | Faculty lose school-licensed features after the period; school tools lock but their data is kept and returns on renewal. Members keep everything personal. |
| Renewal after expiry | A new subscription restores access and the preserved school data. |
| Faculty member leaves | Seat is released. Their reflections, prayers, notes, bookmarks and completion history are untouched and unreadable to administrators. School-owned groups they led pass to another school administrator; they leave school groups. |
| Out of seats | New members join without a seat and see a notice; administrators see "more members than seats". |
| Seats reduced | The longest-held seats stay; the rest are over the limit (premium paused, nothing deleted) until seats are released or added. |
| Several organizations | A person's plans are the union of their individual plan and every licensed school seat. |

### Privacy

Nothing here sells or shares prayer, reflection or group content, and no advertising profile is built. School analytics (`school_engagement`) return combined completion totals only, only when at least `analytics_min_group` (default 5) people are counted, only for people who have not opted out (Settings), and never touch prayers, reflections, notes, bookmarks or group activity.

### Environment variables

`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` (both required for checkout), plus the existing `SUPABASE_SERVICE_ROLE_KEY` (the webhook writes with it). See `.env.example`.

### Stripe setup (external)

1. In Stripe, create products and recurring prices: Educator Plus monthly and annual; School License monthly and annual (per seat, quantity-based).
2. Apply migration `0006_billing.sql`.
3. Sign in as a platform administrator, open `/admin/billing`, paste each Stripe price id and press "Save and read amount from Stripe", then tick "Offer this price".
4. Add a webhook endpoint `https://YOUR-SITE/api/stripe/webhook` for: `checkout.session.completed`, `customer.subscription.created|updated|deleted`, `invoice.paid`, `invoice.payment_failed`, `invoice.finalized`. Put its signing secret in `STRIPE_WEBHOOK_SECRET`.
5. Stripe > Settings > Billing > Customer portal: enable payment-method updates, invoice history and (optionally) cancellation. Enable receipt emails.
6. Locally: `stripe listen --forward-to localhost:3000/api/stripe/webhook` prints a `whsec_` secret; use `stripe trigger` or a test checkout (card 4242 4242 4242 4242; 4000 0000 0000 0341 fails renewals).

### Not verified or deferred

Verified by tests: the migration, every entitlement rule, webhook application, signature checking, and the route. **Not verified live:** calls to Stripe and Supabase, because neither is reachable from the build environment; run a Stripe test-mode checkout end to end before going live. Deferred on purpose: email notifications (notices are in-app; Stripe sends receipts), the "enhanced group organization tools" themselves (the entitlement flag exists), tax/invoicing details beyond Stripe's, and per-user seat self-service. Same-second Stripe events cannot be ordered beyond their timestamp.

## Editorial administration, moderation and platform governance

Migration `0007_governance.sql` extends the editorial, community and billing systems rather than adding parallel ones.

- **Editorial**: unpublish (published to approved, reason required), contributors and credits, per-devotional discussion controls (open, closed, off) and a pinned editorial question.
- **Moderation**: urgent safety reports and an escalation path to administrators, thread controls (lock replies, stop acknowledgements on one prayer), prayer-aware report queue, moderation history, account suspension and termination with appeals.
- **Groups**: creation review (pending, approved, declined), metadata-only group overview, administrator ownership transfer, role assignment and deletion (audited), school-admin management of their own school's groups without content access, comment locks.
- **Covenant**: must be accepted before a first contribution; versioned.
- **Accountability**: append-only audit log, retention rules with a daily job (`/api/cron/retention`, `CRON_SECRET`), aggregate-only platform analytics.

Read [docs/ADMINISTRATION.md](docs/ADMINISTRATION.md) for the roles and permissions matrix, administrator and moderator guide, analytics definitions, retention periods and the decisions that need human review before launch.

## Pre-launch audit

Migration `0008_security_hardening.sql` and `docs/QA-AUDIT.md` record the security, privacy, accessibility and quality audit: the prioritized defect list, what was fixed (screening now enforced in the database, an 18+ confirmation with the covenant, authors can always delete their own words, security headers, 320px reflow, foreign-key indexes, direct messaging locked off), what could not be verified here, and the launch checklist. **Read its recommendation before inviting anyone**: a controlled adult-only pilot is conditional on the gates listed there, chiefly legal documents and a run against a real Supabase and Stripe test account. It does not claim legal compliance.

Browser checks for the public pages: build and start the app, then `npm run verify:quality` (axe, CSP violations, 320px reflow, reduced motion, keyboard) and `npm run verify:present`. They need Playwright and axe-core available; neither is a project dependency.

## Tests

`npm test` runs Vitest. `tests/db` applies the real migrations to an in-process Postgres and tries unauthorized access as different users: reading or writing another school's data, self-joining a school, accepting an invitation addressed to someone else, a member promoting themselves, an editor touching roles, and more. `tests/db/cms.test.ts` covers the CMS: who can write, what readers can see, every workflow rule, licensing, weekly themes, search, and that the sample content loads and passes the real workflow. Parity tests keep the TypeScript workflow table, category list and required-field check identical to the database. `tests/db/governance.test.ts` covers the covenant gate, discussion controls, group review, the private-group and private-prayer boundaries for staff and school administrators, urgent escalation, account status, the audit log, aggregate-only analytics, retention, contributors, unpublishing and a role-by-tool permissions matrix. `tests/db/audit.test.ts` is the adversarial pass: it attacks the public community, prayers, private groups, billing tables, school isolation, account deletion and the disabled messaging endpoints the way a hostile client could, plus regression tests for each fixed defect; `tests/db/performance.test.ts` seeds large threads and checks query shape and foreign-key indexes. `tests/unit` covers role helpers, redirect safety, validation, rich-text sanitizing, Scripture reference parsing, time-zone conversion and token hashing.

## Structure

```
src/app/(marketing)   public pages and layout
src/app/(app)         signed-in pages inside the shell
src/app/(auth)        login, signup, reset, verify, onboarding, invitations
src/app/actions       server actions (all authorization re-checked here)
src/lib/auth          roles, schemas, session guards
src/proxy.ts          session refresh and route protection
tests                 database policy tests and unit tests
src/app/api/health    health check route
src/components/ui     design-system components
src/components/layout navigation and page layouts
src/lib               env, Supabase helpers, site config
supabase/migrations   SQL migrations
```

## Notes

- Fonts use a system stack with a serif fallback. Self-host Source Serif 4 (for example with `next/font/local`) when the brand identity is final.
- Known limits: no invitation or review-request emails yet; no image uploads; one editor at a time per devotional (last save wins); the Library page is still a placeholder (the Archive does the searching); Scripture text is pasted by editors, with no Bible API; devotionals are visible to signed-in users only, not to anonymous visitors; account deletion is refused while you are the only owner of a school that still has other members; auth flows were not exercised against a live Supabase project.


## Launch and founding-school pilot (migration 0009)

- **Switches** (all off by default): public discussions, prayer contributions, prayer acknowledgements, groups, group creation, group posting, group invitations, school administration, paid subscriptions. Direct messaging cannot be enabled. Each switch is enforced in the database, not just hidden in the UI. Opening an interactive switch is refused until **community safety readiness** is complete (a human moderator, covenant required, and recorded sign-offs). Admin: `/admin/launch`.
- **Pilot:** pilots with start/end dates, schools that are *prospects* until an agreement is recorded, hashed single-display access codes, a time-limited school license that expires by date, totals-only metrics, interest and conversion tracking. Admin: `/admin/pilot`. Educators: `/pilot`.
- **Feedback:** in-app survey, bug report and feature request (`/feedback`), triage at `/admin/feedback`.
- **Onboarding:** `/welcome` tour after profile setup.
- **Operations:** `APP_ENV`, `npm run check:env`, sanitized error reports, structured redacting logs, a minimal public `/api/health`, `vercel.json` retention cron, `.env.staging.example` and `.env.production.example`.

New environment variables: `APP_ENV`, `ERROR_REPORT_URL`, `ERROR_REPORT_TOKEN`, `CRON_SECRET` (now required in production).

### Documents

`docs/LAUNCH-ASSESSMENT.md` (read first) · `docs/DEPLOYMENT.md` · `docs/ADMIN-GUIDE.md` · `docs/ADMINISTRATION.md` · `docs/MODERATION-GUIDE.md` · `docs/EDUCATOR-ONBOARDING.md` · `docs/PILOT-SETUP.md` · `docs/PRIVACY-RETENTION.md` · `docs/TROUBLESHOOTING.md` · `docs/RECOVERY-ROLLBACK.md` · `docs/KNOWN-LIMITATIONS.md` · `docs/BACKLOG.md` · `docs/QA-AUDIT.md`

## Reading levels and classroom slides (migration 0010)

`0010_reading_levels.sql` adds `devotionals.levels`: an optional version of the reflection, discussion question, practical application and prayer for each age band (K–2, 3–5, 6–8, 9–12). The existing text columns are the standard version; a band without its own version, or a field left empty in it, uses the standard text. Every band shares the day's Scripture and theme. Editing a band's text after approval returns the devotional to draft, like any other content change, and keeps a revision.

- **Editor:** the devotional form has a Reading levels section with one tab per band.
- **Classroom mode:** the teacher chooses the reading level once, in Settings or the presenter window; it is remembered on that computer. Slides are sized by the real screen: a section continues onto another slide only when its text would otherwise fall below a legibility floor (about 1/22 of the screen height). The theme and title share one opening slide, and the practical step and prayer share the closing slide when they fit, so a typical day is five slides on a projector.
- **Home page:** the "Become a founding school" button emails `FOUNDING_CONTACT_EMAIL` (see `.env.example`). Without it, the page says founding places are by invitation. There is no pricing page during the pilot; `/pricing` redirects to the founding-schools section.

## Public today's devotional, AI tools and class comments (migrations 0011 and 0012)

- **Today's devotional without signing in.** The home page shows the most recent live, free devotional of the past week with a simple presenter (Back, Next, text size, full screen). `public_today_devotional()` (0011) is the only thing signed-out visitors can read: standard text only, never reading-level versions, and Scripture text only where the translation's licence allows. Reading levels, notes, editing and the presenter window need an account. Signed-in visitors who open `/` go straight to `/today`.
- **Email verification** ends on the sign-in page with "Email verified." In the Supabase dashboard, add `<NEXT_PUBLIC_SITE_URL>/auth/callback` to Authentication → URL Configuration → Redirect URLs. If it is missing, Supabase sends people to the home page instead; the proxy now forwards such links to the callback, but the allow-list entry is the proper fix.
- **Devotional comments** ("Reflect Together") are removed from devotional pages and Settings for launch. The component and its database switch remain.
- **AI teaching tools** (Educator Plus and school licences; plan feature `ai_tools`, 40 requests per teacher per day, 0012). Set `ANTHROPIC_API_KEY` on the server. In classroom mode, **Edit** lets a teacher change the reflection, question, practical step and prayer, **re-level with AI** for the chosen reading level, show the result on the class screen, and **save my version** (private to them, one per devotional and level). **Write** (`/create`) builds a new devotional from topics chosen on a topic web; AI chooses a passage of at most 12 verses and its text comes from the bundled public-domain KJV (`data/kjv.json`), never from the AI. All AI text is a draft the teacher reviews before the class sees it. Requests use `claude-opus-5-5` with structured output and the server-side refusal fallback.
- **Class comments (trial).** A Settings switch in classroom mode, off by default, for signed-in teachers. The teacher types what a student said, picks an emoji (or ends with "post comment with smiley emoji"), and it appears beside the slide. Comments are screened for names and contact details, never saved, and gone when the presentation closes. There is no microphone input yet: recording students needs counsel's review first.


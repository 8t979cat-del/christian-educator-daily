# Known limitations

Plain statements of what is not done or not verified. Read before any decision to launch.

## Not verified (could not be, from the build environment)

1. **Nothing has run against a live Supabase project, Stripe account, domain or host.** Database behavior is tested against a real PostgreSQL engine (PGlite) with the real migrations; services are not.
2. **Signed-in screens were built and type-checked but not exercised in a browser** against a live backend with real accounts, including the new Launch, Pilot, Feedback, Welcome and pilot pages.
3. **Backups and restore are untested.** No rehearsal has been done.
4. **Email.** The application sends none. Supabase auth email is the only transactional email and depends on custom SMTP being configured and tested (not done).
5. **Error monitoring** is a vendor-neutral HTTPS post that has not been received by any collector.
6. **Performance** was not measured under load or on target devices. No Lighthouse numbers.
7. **Accessibility** was reviewed in the audit and by automated checks, not by a screen reader on real devices in this build.

## Open from the audit

- **H-04 (High): no terms of use, privacy notice or adult consent flow.** Needs counsel. Without it the platform should not be opened to real people.
- Other open items are listed in docs/QA-AUDIT.md.

## Product limits

- **Devotional content.** Only AI-drafted sample content exists. The pilot needs human-written, theologically reviewed devotionals scheduled 14 days ahead. The Launch page measures the schedule, not the quality.
- **Reading levels are in classroom mode only.** The personal reading view (`/devotional/[id]`) shows the standard text. Band versions are optional per field; nothing requires every band to be written before publishing.
- **AI tools are unproven with real teachers.** The AI was never called from the build environment (no key); its request shape and error handling are covered by tests with a stand-in. AI-written text has no theological review beyond the teacher's own; it is labelled as a draft and never replaces published content. Cost depends on use (daily limit: 10 requests per teacher; roughly 2–3 US cents each).
- **Class comments** have no microphone input and are not shared with the presenter window.
- **Scripture licensing.** Each translation's terms must be confirmed with its publisher by a person; the app only records that someone did.
- **Moderation is human and manual.** Nothing pages anyone. Urgent reports do not alert. Email notices to people whose content is hidden are not sent.
- **Sign-offs are attestations.** The software cannot tell whether a rehearsal really happened.
- **Pilot invitations are not sent by the system.** Invitations are your letters; codes are passed on by hand.
- **Paid subscriptions** are gated by a switch in the application (Stripe cannot be gated in the database). Live billing has never been run. Seat management for pilot schools is by seat limit only.
- **Pilot analytics** are totals. Small pilots (fewer than five enrolled) hide people-level numbers on purpose, so very small schools see little.
- **No self-service data export or deletion.** See docs/PRIVACY-RETENTION.md.
- **No direct messaging, no student accounts, no feeds or leaderboards**, by design.
- **One language, one timezone setting** per deployment.
- **Hosting is an assumption** (Vercel). Another host needs its own cron and secret handling.
- **Rate limits** are per account, not per network address.

## Operational

- The first administrator is created by hand (README).
- Cross-pilot comparisons and exports of pilot data are not built; use the dashboard figures.
- Retention periods are defaults awaiting counsel.

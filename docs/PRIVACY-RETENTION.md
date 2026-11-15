# Privacy and data retention summary

**This is an engineering summary, not a privacy notice and not legal advice.** It has not been reviewed by counsel. A real privacy notice, terms of use and consent flow for adult educators are still required (open audit item H-04). Do not describe the platform as compliant with any law or standard.

## Who the platform is for

Adult educators. There are **no student accounts**, no student-to-adult messaging, and no direct messaging at all in this release. Students may be present only at the projector.

## What is collected

- **Account:** email, name, role, optional school and teaching details, notification preferences, last-active date.
- **Reading:** bookmarks and saved items; counts of page opens as totals (no per-person trail beyond last-active).
- **Community (when switched on):** the posts, prayers, replies, acknowledgements and group content a person chooses to write, with visibility (named, anonymous, private); reports and moderation records.
- **Pilot:** access-code redemptions, school membership, interest answers, feedback submissions.
- **Billing (later):** Stripe holds payment details; this system keeps customer and subscription identifiers and event records, never card numbers.
- **Technical:** structured logs and sanitized error reports (no cookies, bodies, emails or ids).

## What is deliberately not collected or shown

Student names or data (the platform screens for names and asks people not to post them); any per-person spiritual or engagement score; private prayers in analytics; private group text in analytics; and who reported a post.

## Who can see what

| Data | Visible to |
|---|---|
| Profile | the person; limited name to others where they post |
| Private prayer | the author only |
| Anonymous prayer | shown without name; moderators can see the author when acting on a report |
| Public reflection | signed-in people who can see that devotional |
| Group content | group members and platform moderators acting on reports |
| Group roster | members; platform administrators (audited) |
| Pilot dashboard | platform administrators, totals only |
| Feedback | the sender and platform administrators |

## Retention

Automatic, daily (`/api/cron/retention`); periods are settings on Admin → Audit and retention. Defaults are starting points to be confirmed with counsel and school contracts.

| Data | Default | Action |
|---|---|---|
| Quoted text in closed reports | 365 days | cleared; record kept |
| Quoted text in moderation records | 730 days | cleared; record kept |
| Audit log | 730 days | deleted |
| Stripe event log | 400 days | deleted |
| Usage counters (global and per school) | 800 days | deleted |
| Settled feedback (done or declined) | 730 days | deleted |
| Pilot code attempts | 1 day | deleted |
| Rate-limit events | 2 days | deleted |

Open reports and open feedback are never auto-deleted. Posts, groups and accounts have **no automatic expiry**.

## Not built

- Self-service export and deletion of a person's data. There is no such feature yet; today deletion would be an administrator task with a developer's help.
- A defined policy for what happens to a person's posts when they leave.
- Data processing agreements, school data-sharing terms, parental-consent logic (not needed while students have no accounts), and a cookie notice review.
- A tested restore (see recovery guide).

## Before the pilot

Decide, with counsel: what privacy notice and terms adults accept; where data is hosted and whether that matters to your schools; how long to keep each category; how a person can request deletion; and who answers questions.

# Administration, moderation and governance

This guide is for the people who run Christian Educator Daily: administrators, editors, moderators, and school leaders. It describes what each role can do, how the tools work, and what is **not** done for you. Everything below is enforced in the database (migration `0007_governance.sql` and earlier); hiding a button on a page is a courtesy, never the rule.

## 1. Roles and permissions

There are three kinds of role. Platform roles are granted by a platform administrator. School roles belong to one school. Group roles belong to one group.

| Role | Kind | Granted by |
|---|---|---|
| Platform administrator | platform | another administrator (the last one can never be removed) |
| Content editor | platform | a platform administrator |
| Community moderator | platform | a platform administrator |
| School administrator (owner or admin) | school | the school owner |
| Group owner | group | whoever creates or is handed the group |
| Group moderator | group | the group owner |
| Ordinary educator | none | verified email and onboarding |

### Permissions matrix

`Yes` = allowed. `Own` = only their own. `Meta` = names, status, counts and roles only, never content. `No` = refused by the database.

| Capability | Platform admin | Content editor | Moderator | School admin | Group owner | Group moderator | Educator |
|---|---|---|---|---|---|---|---|
| Create/edit devotionals, drafts, themes, scripture references | Yes | Yes | No | No | No | No | No |
| Submit for review, approve (not own work*), schedule, publish | Yes | Yes | No | No | No | No | No |
| **Unpublish** (reason required), archive | Yes | Yes | No | No | No | No | No |
| Manage contributors and credits | Yes | Yes | No | No | No | No | No |
| Translation licence records | Yes | No | No | No | No | No | No |
| Publish educator/faculty resources | Yes | Yes | No | No | No | No | No |
| Open / close / turn off a devotional's discussion | Yes | Yes | Yes | No | No | No | No |
| Pin an editorial discussion question | Yes | Yes | No | No | No | No | No |
| Lock replies / stop acknowledgements on one thread | Yes | Yes | Yes | No | No | No | No |
| See the public report queue, hide/restore public content | Yes | No | Yes | No | No | No | No |
| Review private-group reports | Only when escalated or the owner is reported | No | Same | No | Own group | Own group | No |
| Hide/remove posts inside a group | No | No | No | No | Yes | Yes | Own |
| Remove or pause group members | No | No | No | No | Yes | Yes | No |
| Lock comments on a group post | No | No | No | No | Yes | Yes | No |
| Restrict a person's community access | Yes | No | Yes | No | No | No | No |
| **Suspend or close an account** | Yes | No | No | No | No | No | No |
| Review appeals (not their own decision**) | Yes | No | Yes | No | No | No | Own |
| Review group creation requests | Yes | No | Yes | No | No | No | No |
| See all groups' name, status, owner, size | Meta | No | Meta | Own school only | Own | Own | No |
| See a group's members and roles | Yes (audited) | No | No | No | Own | Own | Member |
| Read a private group's posts | **No** | No | **No** | **No** | Yes | Yes | Member |
| Transfer group ownership | Any group | No | No | School groups | Own | No | No |
| Delete a group | Any group (reason) | No | No | School groups | Own | No | No |
| Read private prayers | **No** | No | **No** | **No** | No | No | Own |
| Handle an escalated urgent case | Yes | No | Pass up | No | No | No | No |
| Platform analytics | Yes | No | No | No | No | No | No |
| School aggregate metrics (5+ people, opt-in) | No (uses platform analytics) | No | No | Own school | No | No | No |
| Audit log | Read | No | No | School membership changes, own school | No | No | No |
| Change settings, retention, covenant version | Yes | No | No | No | No | No | No |

\* An author cannot approve their own devotional unless they are a platform administrator.
\** The person who took an action does not review its appeal, unless they are an administrator and no one else is available.

The matrix is tested: `tests/db/governance.test.ts` calls each tool as each role and checks the result.

### What roles deliberately cannot do

- **No role reads a private group's posts by being a role.** Platform staff and school administrators see group metadata. Private-group content reaches platform moderators only when a group leader escalates a report, when the group owner is the person reported, or when a member marks a report urgent.
- **No role reads a private prayer.** A prayer marked private is visible to its author only. It is not counted in analytics.
- **School administrators never see prayers or group conversations.** They see aggregate completion counts when at least five opted-in members are counted.
- A platform administrator cannot suspend themselves or another staff member; remove staff roles first.

## 2. Editorial administration

Open **Admin → Devotionals**. The workflow is draft → in review → approved → scheduled/published → archived.

- **Save draft / submit for review / approve or request changes**: a reviewer who "requests changes" returns the devotional to draft with a note the author reads.
- **Schedule** sets a future publication time. **Publish now** goes live at once.
- **Unpublish** (published → approved) takes it away from readers immediately. A reason is required and appears in the history. The discussion is kept but hidden while it is down. Republish from approved.
- **Archive** is for outdated content. It leaves readers and stays in the record.
- **History** shows every change of state, who made it, when, and any note. Edits are kept as revisions.
- **Scripture**: record the reference. The text is stored and shown only when the translation's licence record permits it (Translations page, administrators only). Reference-only translations show the citation and a link.
- **Discussion** (card on the devotional page): Open, Closed (readable, no new contributions) or Off (hidden from readers). Set a **pinned question** for the top of Reflect Together.
- **Credits** (card on the devotional page): attach authors, contributors and reviewers from **Admin → Contributors**. They appear under the published devotional.
- **Resources** (educator and faculty resources) are published from **Admin → Resources** by editors.

## 3. Moderation

Open **Community → Moderation** (moderators and administrators).

Tabs: **Reports**, **Appeals**, **Groups**, **Discussions**, **Restrictions**, **History**, and for administrators **Escalations** and **Settings**.

### Principles

1. Respectful disagreement is not misconduct. Dismiss reports about convictions, denominations, or hard questions.
2. Hide, don't delete. Hiding is reversible; the author is told why and can appeal for 30 days.
3. Be proportionate: warning → hide → temporary restriction → removal of community access → account suspension → account termination.
4. See only what you need. You see the reported words, the reason, the author's name and recent moderation record. You do not see private prayers, private groups' other content, or anyone's email.
5. Say why. Every decision requires a note the person will read.

### Handling a report

1. Read the quoted words and the reporter's note.
2. Choose **Dismiss**, **Hide it** or **Send a warning**, with a note.
3. If the thread is heated, **Lock replies**. If a prayer is being used abusively, **stop acknowledgements** on that prayer.
4. For repeated problems, **Restrict this person** (pause for days, or remove community access until lifted).
5. For serious cases, administrators can **Suspend or close the account**. This blocks the whole account; the person sees only a notice and an appeal form.

### Prayers

Prayer is its own contribution type. Reports on prayers are marked. Hide a prayer when it names or could identify a student, or shares sensitive details about a third party; remove harassment or exploitation. A prayer that is long, unusual, or theologically different is not a violation. Authors can edit or delete their own prayers at any time, even in a closed discussion. Prayers are ordered by time only; the "I prayed" count is a plain number on each prayer and is never used to rank anything.

### Urgent safety concerns and escalation

Anyone can tick **This is an urgent safety concern** when reporting. Urgent reports go to the top of the queue and reach platform moderators even from a private group.

A moderator who believes there is a credible threat, a risk of harm, or a child at risk uses **Pass to a platform administrator**. The administrator decides what to do under your organization's safeguarding policy and records what was done in **Escalations**.

> **This is a record-keeping and routing tool. It does not call anyone, it does not monitor around the clock, and it is not an emergency service.** The interface tells readers to contact local emergency services for immediate danger. Before launch, decide who is on call, how quickly urgent reports are read, and who contacts authorities or a school safeguarding lead.

### Appeals and membership disputes

Any moderation decision against a person (hidden content, a warning, a restriction, removal or pause in a group) can be appealed within 30 days. The Appeals tab lists them. Overturning a decision undoes it (restores hidden content, lifts the restriction, returns a removed member to the group). A membership dispute is simply an appeal of a group removal.

### Account suspension and termination

Administrators only, from a report. A suspension lasts a set number of days and then ends by itself. A termination lasts until an administrator restores it. Both record a reason the person reads, and can be appealed. A successful appeal restores the account. The account is locked at the application layer; the person's sign-in still works so they can read the notice and appeal.

### Groups

- **Review**: new groups by ordinary educators wait in **Groups → Waiting for review** while the "Review new groups before they open" setting is on. Approve, or decline with a reason the owner reads. Groups created by school administrators and by platform staff open at once.
- **Manage** (administrators): see a group's members and roles (each look is audited), transfer ownership, assign a group moderator, or delete the group with a reason.
- **Suspend** a group from a report that raised the concern; reopen it from Settings.
- **School administrators** manage only their own school's groups: from **My School → School groups and activity log** they can hand a group to another member or delete it. They cannot read it.

## 4. School administration

School owners and administrators (**My School**) manage faculty accounts and invitations, roles, seats and billing, shared assignments and collections, and see aggregate completion metrics (shown only when at least five opted-in members are counted). Changes to school membership are recorded in the school's activity log, visible to its administrators.

## 5. Analytics (platform administrators)

**Admin → Analytics** shows totals only:

| Metric | Definition |
|---|---|
| Active educators | Distinct people who loaded the app on a day / within 7 / within 30 days. Stored as one date per person, overwritten daily. |
| Readership, presentation usage | Daily counts of devotional page opens and presentation opens. Counters only; no person is recorded. A person reloading counts again. |
| Contributions by type | Public and anonymous contributions created in the period, by kind. Private prayers and private notes are not counted. |
| Group participation | Active and pending groups, groups with activity, post and comment counts. |
| Aggregate prayer acknowledgements | One total. Never per person, per prayer, or ranked. |
| School subscriptions | By status, plus licensed seats in use. |
| Trial conversion | Of trials that ended in the period, the share now paying. |
| Retention | Of subscriptions older than 30 days, the share still active. |
| Moderation | Reports by reason and outcome, urgent count, median hours to resolve, open appeals and restrictions. |

There are no spiritual scores, streak rankings, leaderboards, or per-person engagement measures anywhere in the product.

## 6. Audit log

Administrative actions are written to an append-only log that no signed-in role can modify: changes to staff roles, community, governance and billing settings, plans, features and prices, entitlement grants, resources, school membership, contributors and credits, discussion controls, group approvals, ownership changes, deletions and member lookups, account status changes, escalations, and retention runs. Each entry has the actor, the roles they held at the time, the time, and the details (for changes, the old and new values). Moderation decisions themselves are in the moderation history (**Moderation → History**).

Changes made by server jobs with no signed-in person (for example the payment webhook) are intentionally not in this log; payment events are kept in their own table.

## 7. Data retention

Set on **Admin → Audit and retention**. Defaults (starting points, not legal advice):

| Data | Default | What happens |
|---|---|---|
| Quoted text in closed reports | 365 days | Replaced with a placeholder; the report record is kept |
| Quoted text in moderation records | 730 days | Cleared; the action record is kept |
| Audit log | 730 days | Deleted |
| Payment event log | 400 days | Deleted |
| Usage counters | 800 days | Deleted |
| Rate-limit events | 2 days | Deleted |

Retention runs when `/api/cron/retention` is called with `Authorization: Bearer $CRON_SECRET` (set up a daily schedule in your host), or from the button on the page. Open reports are never cleared.

## 8. Community covenant

The covenant is at **Community → Community covenant**. A person must accept the current version before their first public contribution, prayer acknowledgement, reply, group post or group comment. Reading is never blocked. Raising the version (Audit and retention → Covenant version) asks everyone to accept it again.

## 9. Decisions that need human review before launch

These are policy and legal choices the software cannot make for you. Each is configurable, but none should be left at its default without a decision.

1. **Who staffs moderation and how fast.** Name the moderators and a backup. State a response time for ordinary reports and for urgent ones. Nothing in the product pages the team.
2. **Emergency and safeguarding procedure.** Who acts on an escalated threat or a child-safety concern, whom they contact, and what is recorded. Legal obligations (mandatory reporting, school-specific duties) vary by place; get advice. The tool only records and routes.
3. **Covenant wording and version.** Have your pastoral, legal and school leaders approve the text in `src/lib/community/covenant.ts` before launch. Decide whether a wording change warrants re-acceptance.
4. **Group review default.** Review is on by default (safer, slower). Decide whether to keep it, who reviews, and whether school groups should open without review.
5. **Retention periods.** Confirm the defaults with counsel, and with any school contracts that dictate how long student-adjacent data may be kept. Decide whether closed-report quotes should be cleared sooner.
6. **Terminated accounts.** Decide whether a terminated person may still delete or export their data, and how they reach support. The notice page offers only an appeal and sign-out.
7. **What moderators see.** Moderators see an author's real name (first and last) with a report. Decide whether names should be shown at all, or only after a first review.
8. **Platform administrator access to group rosters.** Administrators can see who is in any group (audited). Decide whether that is acceptable, and who may hold the role.
9. **Billing for suspended accounts.** A suspended or terminated subscriber is not automatically refunded or cancelled. Decide the policy.
10. **Appeals.** Thirty days and a different reviewer is the default. Decide who hears appeals when the moderation team is very small.
11. **Prayer content guidance.** Review the reminder text shown before sharing a prayer with legal and safeguarding advisers.
12. **Analytics.** Confirm that counting page opens and the last-active date is consistent with your privacy notice and any school data agreements.
13. **Scripture licensing.** Each translation's terms must be confirmed with its publisher before text is stored or shown.

## 10. Not verified or not built

- Row-level security, permissions and workflows are tested against a real PostgreSQL engine (PGlite) with the real migrations. They have **not** been run against a live Supabase project.
- The administration screens compile and build, and the data they call is tested, but they have not been exercised end to end in a browser against a live backend with real accounts.
- Email notices to people whose content is hidden or whose account is restricted are not sent; they see the notice in the app.
- Urgent reports do not page anyone.
- Supabase's own auth ban is not set on suspension; the lockout is enforced by the application and the database's community rules.

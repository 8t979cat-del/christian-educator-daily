# Administrator guide (launch and pilot)

For platform administrators. Everyday editorial, role and audit tasks are in **docs/ADMINISTRATION.md**; this guide covers what was added for launch and the pilot.

## The three screens you will use

- **Admin → Launch** (`/admin/launch`): readiness, switches and configuration.
- **Admin → Pilot** (`/admin/pilot`): pilots, schools, access codes, the dashboard.
- **Admin → Feedback** (`/admin/feedback`): surveys, bug reports and ideas.

## Launch readiness

The page has four parts.

1. **Community safety.** Automatic items (a human moderator exists; the covenant is required) and **sign-offs**. A sign-off is you recording, in a sentence, what was done and by whom: covenant reviewed, moderation tested, escalation procedure, response expectations, privacy guidance, suspension procedure, legal documents. It stores your name and the date. It is a human attestation, not a test the software ran. Withdraw one at any time and the gate closes again.
2. **Content.** Whether the next 14 days have approved, scheduled devotionals; authors credited; grade-level labels present; every Bible translation in use has a recorded licence check; prayer prompts signed off. "Blocking" items must be resolved before launch; "advisory" items should be.
3. **Feature switches.** Nine independent switches. All start **off**.
4. **Configuration.** Environment verdicts (names only).

### Opening a feature

Switch on only after readiness is complete, one feature at a time, starting with the smallest circle: for example discussions on one approved devotional's worth of content, then prayer contributions, then acknowledgements, then groups. Watch the moderation queue between steps. Switching **off** is always allowed and immediate.

The database enforces this. A person who calls the database directly still cannot post to a feature that is off, and cannot switch an interactive feature on while readiness is incomplete. **Direct messaging cannot be switched on** in this release.

| Switch | Controls |
|---|---|
| Public devotional discussions | Reflections, questions, encouragement on approved devotionals |
| Prayer contributions | Sharing a prayer request |
| Prayer acknowledgements | "I prayed" |
| Private educator groups | Master switch for groups |
| Creating groups | Starting a group |
| Group posts and comments | Writing in groups |
| Group invitations | Inviting people to a group |
| School administration | Educators self-creating a school (staff-created pilot schools are unaffected) |
| Paid subscriptions | Opens checkout (needs live Stripe, which needs approval) |

## Roles for launch

Name at least **two** moderators (one primary, one backup) before opening anything. Grant the role from Admin → Staff. Give `platform_admin` to as few people as possible; administrators can see group rosters (audited).

## Scheduling content

Devotionals move through draft, review, approved, scheduled and published, with a different person approving than wrote. Keep **14 days** ahead. The Launch page shows the count. Check each Scripture translation's licence under Admin → Translations before its text is shown.

## Routine, once live

- **Daily:** moderation queue; urgent reports first.
- **Weekly:** feedback review (see the pilot guide); content calendar; pilot dashboard.
- **Monthly:** audit log skim; confirm the retention job ran; review who holds staff roles.

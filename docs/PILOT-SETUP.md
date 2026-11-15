# Founding-school pilot: setup guide

The pilot is for **three to five Christian schools**. **No school is assumed to have agreed.** The system treats every school as a *prospect* until a person records that it agreed and how; nothing about a prospect works until then.

## How it fits together

- A **pilot** has a name, a start and end date, and a status (planning, active, closed). It is the only thing that gives access, and the access ends on its date on its own.
- A **pilot school** moves through: prospect → invited → agreed → active → completed (or declined). "Agreed" requires a note of at least ten characters saying how it agreed ("signed letter from the head, received 12 Nov"). The database refuses to create the school account or any code without it.
- A school's people join with **access codes**: 12 characters, shown once, stored only as a hash, with a limited number of uses and an expiry that cannot pass the pilot's end. An **owner** code is single-use and makes that person the school's owner (a second one makes an administrator). A **faculty** code can be used by several people.
- While the pilot is active and in its dates, an agreed school gets a time-limited school license with the seat limit you set. It is **not** a subscription and creates none. A real paid subscription always takes precedence.
- Redeeming is throttled: eight wrong attempts in an hour stops further tries for that hour.
- Declining a school revokes its codes. Closing the pilot ends access at once.

## Step by step (all approvals first)

1. **Decide** whom to invite and who will contact them. Prepare the invitation outside the app: a short letter explaining the pilot, what it is, the dates, that it is free, and what you ask in return (feedback). **Do not email anyone from this system yet; it does not send invitations.**
2. **Admin → Pilot → Create a pilot** (stays in *planning*; nobody has access).
3. **Add each prospective school** as a prospect with the contact's name.
4. When a school **agrees**, set its stage to *agreed* and write how it agreed. Then **create the school account**.
5. **Create an owner code** for the head of school's chosen administrator, and a **faculty code** sized to the staff. Send each person their code by a private channel.
6. Make sure the Launch page is complete (readiness, content) before **activating the pilot**.
7. Switch on community features gradually (see the administrator guide), only with moderators ready.
8. Hold a 30-minute **administrator orientation** call: the educator guide's section 7, how to hand out codes, student privacy, how to report and where feedback goes.
9. Run the **weekly feedback review** (below).
10. Two weeks before the end, talk about what comes next. The in-app note shows days remaining; it never pressures anyone.

## Subscription conversion

On each school: conversion stage (none → interested → proposal sent → converted / declined) plus a note. Educators and administrators may record their interest from the Pilot page (a note of interest only; nothing is bought). The dashboard shows interest and paid counts. Do not create a paid subscription except through the normal billing flow and only after live billing has been approved.

## Dashboard: what it shows and does not

Shows totals: invited by email, codes issued and redeemed, enrolled, activated (profile complete), active in the last 7 days, devotional sessions, classroom presentation opens, public contributions by type, replies, acknowledgements given, group posts and comments, educators in a group, moderation reports about pilot content, interest, paid conversion, and feedback counts.

Does not show: individual names, any ranking or score, private prayers (not counted at all), or any group message text. Figures about people appear only when at least five educators are enrolled. Counts are per school per day.

## Feedback

### Weekly review process

1. Once a week, 30 minutes, the product owner and a pilot contact open Admin → Feedback.
2. Read **new** items. Set status, priority and theme for each; add a note.
3. Bugs: blocking first. Anything that stops a class lesson is fixed or worked around the same week.
4. Cluster ideas by theme (ease of use, classroom presentation, devotional quality, time saved, community usefulness, prayer interactions, group participation, willingness to pay).
5. Choose at most three changes for the coming week; mark them *planned*. Tell the people who asked.
6. Look at the survey averages (shown once five or more have answered) and the willingness answers. Be honest about small numbers.

### Teacher survey (in the app, about three minutes)

Seven statements rated 1–5 (skip any): easy to find and use what I needed; classroom presentation worked for my room; devotionals were good enough to use as written; it saved me time; discussions were useful; praying with others felt appropriate and welcome; private groups were useful. Then: *Would your school pay for something like this?* (yes / maybe / no / not sure), and *What is the one thing we should change first?*

### School administrator interview guide (30–40 minutes, by call)

Open: thank them; explain this is to learn, not to sell; ask permission to take notes.

1. Tell me about how your teachers begin the day with devotions today. What do you use? What do you wish were easier?
2. Who decided to try this, and what did you hope it would do?
3. Walk me through how the rollout went. Where did people get stuck? (codes, sign-in, email)
4. What did teachers actually use? What did they skip? Why do you think so?
5. Classroom presentation: how often, on what screens, any trouble?
6. Devotional quality: faithful to Scripture? Appropriate for your grades? What would you change or add? Anything that did not fit your tradition?
7. Time: roughly how much preparation time did this save, if any?
8. Community: did teachers use discussions, prayer or groups? Were they safe and welcoming? Any concerns about privacy or student information?
9. Moderation: did anyone feel unsafe or uncomfortable? Did you feel you could trust how it was handled?
10. If this cost money, what would be reasonable? Who would decide and when? What would you compare it with? (Do not suggest a number first.)
11. What would make you recommend it to another school, or not?
12. What is the one thing we must fix before you would use it again?

Close: ask whether they are willing to be contacted again; thank them.

### Bug reports and feature requests

Educators use **Feedback** at the top of any page. A bug report records the page path (not the full address), a severity and your words; a feature request records a title and text. Entries are private to the sender and the administrators. The form refuses student names and limits submissions to eight an hour and thirty a day.

## What can go wrong

See docs/TROUBLESHOOTING.md and docs/RECOVERY-ROLLBACK.md.

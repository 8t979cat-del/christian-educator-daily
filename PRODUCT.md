# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

**Primary user: the classroom teacher.** A teacher at a Christian school who leads a short devotional with their class, typically to open the school day. They use the product at the front of a room, projecting from a shared school laptop or Chromebook, often on a slow school network, with students watching. Their job is to get today's devotional on screen quickly and lead it with confidence, at a reading level that fits their students' ages.

**Buyer: the school administrator.** The administrator usually buys for the whole school and hands out accounts, mainly to teachers, for the daily classroom devotional. They decide whether the school adopts the product, so they evaluate it before any teacher uses it.

There are no student accounts. Students see the devotional only through the teacher's projected presentation.

## Product Purpose

Everyday Devotional: 180 Days gives a Christian school one devotional for every day of the school year (180 days). Teachers present it in class at a reading level suited to their students. Success means a teacher can open and lead the day's devotional in about a minute, every day, without preparation or improvising. It also means founding schools adopt the product and keep using it.

## Positioning

The product is a structured school-year sequence of 180 days. Each day is written at several K–12 reading levels on the same Scripture and theme, and is built to be presented in class. That differs from a general devotional app, a sermon-slide library or a personal Bible-reading plan: the unit is "today's devotional for my class at my students' level", not content a teacher has to find, adapt or rewrite.

## Operating Context

- **Daily classroom ritual.** The teacher opens today's devotional, chooses their students' age band, and presents it full-screen, moving forward with arrow keys or a presentation clicker. It has to work on projectors, shared school laptops, Chromebooks and slow networks.
- **Daily structure** (as built): weekly theme, title, Scripture passage, reflection, discussion question, a practical "put it into practice" step and a closing prayer. The teacher chooses which sections to show.
- **School purchase and rollout.** An administrator creates a school account, invites teachers and gives them access. The founding-school pilot uses access codes, a time-limited school licence, and interest and conversion tracking (see `docs/PILOT-SETUP.md`).
- **Launch stage.** The product is prepared but not deployed (see `docs/LAUNCH-ASSESSMENT.md`). Launch is a controlled pilot with three to five invited founding schools.

## Capabilities and Constraints

- **Multiple reading levels, one day.** Each day's devotional shares one Scripture passage and theme, written in a separate version for each age band. The teacher picks their band. The bands in code are K–2, 3–5, 6–8 and 9–12 (`grade_levels`). Today the code only tags a devotional with the bands it suits and has a single "simplified for younger students" presentation switch. It does not yet model a separate version per band for one day.
- **Adjustable text size.** Required in reading and presentation. Presentation currently offers five size steps (0.8× to 1.9×).
- **Presentation uses as few slides as possible.** This is a binding constraint. The current presentation logic splits long Scripture and long text across several slides for back-of-room legibility (the verification script produced 10 slides for a sample devotional). Future work should minimise the slide count while keeping text readable from the back of a classroom.
- **Launch scope is classroom only.** For the founding-school pilot, the product is the classroom devotional and the school setup around it (accounts, school membership, teacher access). These features are built but are **out of the launch pitch and stay switched off**: the teacher's private devotional reading, faculty resources and meeting guides, the educator community (groups, discussion, prayer requests) and billing. Direct messaging cannot be enabled at all.
- **Technical:** Next.js (App Router), TypeScript, Tailwind CSS v4, Supabase with row-level security; nine feature switches, all off by default. Hosting on Vercel is assumed, not confirmed.
- **Open decisions:** pricing and plans; whether the 180-day sequence is fixed in order or can be rearranged by schools; how teachers select a band (per class, per account or per session).

## Brand Commitments

- **Name:** Everyday Devotional: 180 Days. This is a full rename. "Christian Educator Daily", which appears throughout the code, docs and marketing copy, is retired and should be replaced.
- **Personality (from the user):** classroom-friendly, warm, clean, calm, scholarly, inspirational.
- **Avoid:** preachy, overly holy, dry, overstimulating, overly artistic.

## Evidence on Hand

- **Devotional content:** only AI-drafted sample devotionals exist. No real, theologically reviewed devotionals have been written yet, and Scripture translation licences are unconfirmed. Do not present sample content as the real curriculum.
- **Customers and proof:** none. No school has agreed to the pilot, and there are no testimonials, logos, usage figures or case studies. Do not fabricate any.
- **Pricing:** not set. The pricing page currently says pricing is coming soon.
- **Verified quality:** public pages passed an automated WCAG 2.2 A/AA check (axe), reflow and reduced-motion checks. The presentation theme colours are tested at 7:1 contrast or better (`src/lib/content/present.ts`). Signed-in screens have not been checked in a browser against a live backend.
- **Existing brand assets:** a logo component (`src/components/layout/logo.tsx`), built under the old name.

## Product Principles

1. **Today, in a minute.** The daily path from opening the app to a devotional on the projector should be immediate and need no preparation.
2. **Right for the age in the room.** Every day should land for K–2 as well as for 9–12. The reading level is part of the product, not an afterthought.
3. **Fewer slides, still legible.** Keep the devotional on as few screens as possible while staying readable from the back of the room. A teacher shouldn't have to click through fragments.
4. **Invitational, not preachy.** Warm and thoughtful, with scholarly grounding in Scripture. Never moralising or performatively holy.
5. **Earn the school's trust honestly.** Win founding schools with what's real: privacy, no student accounts, and no inflated claims, proof or content that doesn't exist yet.

## Accessibility & Inclusion

- WCAG 2.2 AA is the baseline for all pages. Presentation colours meet 7:1 (AAA).
- Students across K–12, including young and early readers, see projected text. Text size must be adjustable, and the youngest levels need larger type and simpler language.
- Presentation must be readable from the back of a classroom on low-quality projectors, and controllable by keyboard or clicker.
- It must work on shared school devices (Chromebooks) and slow school networks.

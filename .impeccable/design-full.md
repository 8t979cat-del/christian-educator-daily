---
name: Everyday Devotional
description: A classroom workbook for every school day; an edtech lesson page meets the Bible on ruled paper.
colors:
  parchment: "#f8f6f0"
  surface: "#ffffff"
  ink: "#1d2433"
  muted: "#4e5668"
  line: "#dde3ec"
  line-strong: "#687286"
  brand: "#2350cc"
  brand-hover: "#1a3ea3"
  brand-soft: "#e9eefc"
  rubric: "#b42318"
  gilt: "#f2b23a"
  gold-ink: "#7a4d00"
  gold-soft: "#fdf3dc"
  ruling: "#d5e0f3"
  margin: "#efb0a8"
  danger: "#b3261e"
  danger-soft: "#fbeae8"
typography:
  display:
    fontFamily: "Literata, Iowan Old Style, Georgia, serif"
    fontSize: "2.75rem"
    fontWeight: 600
    lineHeight: "4rem"
    letterSpacing: "-0.01em"
  headline:
    fontFamily: "Literata, Iowan Old Style, Georgia, serif"
    fontSize: "2.4rem"
    fontWeight: 600
    lineHeight: 1.25
  title:
    fontFamily: "Lexend, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: "2rem"
  scripture:
    fontFamily: "Literata, Iowan Old Style, Georgia, serif"
    fontSize: "1.4rem"
    fontWeight: 400
    lineHeight: "2rem"
  body:
    fontFamily: "Lexend, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.6
  reading:
    fontFamily: "Literata, Iowan Old Style, Georgia, serif"
    fontSize: "1.125rem"
    fontWeight: 400
    lineHeight: "2rem"
  label:
    fontFamily: "Lexend, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
    lineHeight: 1.4
rounded:
  step: "0.5rem"
  control: "0.625rem"
  card: "1rem"
  pill: "9999px"
spacing:
  ruling: "2rem"
  card-sm: "1.25rem"
  card-md: "1.5rem"
  margin-gutter: "4rem"
  section: "3.5rem"
  section-lg: "5rem"
components:
  button-primary:
    backgroundColor: "{colors.brand}"
    textColor: "{colors.surface}"
    rounded: "{rounded.control}"
    padding: "0 20px"
    height: "44px"
  button-primary-hover:
    backgroundColor: "{colors.brand-hover}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.brand}"
    rounded: "{rounded.control}"
    padding: "0 20px"
    height: "44px"
  button-secondary-hover:
    backgroundColor: "{colors.brand-soft}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.brand}"
    rounded: "{rounded.control}"
  lesson-card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
    padding: "{spacing.card-sm}"
  card-soft:
    backgroundColor: "{colors.brand-soft}"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
  step-tab-current:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.brand}"
    rounded: "{rounded.step}"
    height: "44px"
  step-tabs-track:
    backgroundColor: "{colors.parchment}"
    rounded: "{rounded.control}"
  date-chip:
    backgroundColor: "{colors.brand-soft}"
    textColor: "{colors.brand}"
    rounded: "{rounded.pill}"
    typography: "{typography.label}"
  check-badge:
    backgroundColor: "{colors.gold-soft}"
    textColor: "{colors.gold-ink}"
    rounded: "{rounded.pill}"
    size: "24px"
---

# Design System: Everyday Devotional

## Overview

**Creative North Star: "The Classroom Workbook"**

Each school day is a lesson page in a workbook: a friendly edtech course page set on bright paper with faint blue ruling and a red margin line, with the Bible written onto those lines in a book serif. The interface speaks in Lexend, a face built for reading fluency, with confident classroom blue for anything you can press. Scripture, titles and devotional text are set in Literata, so the Word reads like a printed book on the workbook page.

The system is clean and calm rather than ornamental. Colour is functional and sparse: blue means "act here" or "you are here", gold means "done" or "progress", and Bible red appears only on verse numbers. Surfaces are white lesson cards with friendly rounded corners and soft blurred shadows, lifted slightly off warm workbook paper. Density is moderate: generous section spacing on the marketing page, tight 2rem line rhythm on the ruled sheets.

The world deliberately replaces an earlier hymnal-and-letterpress costume, and refuses the generic SaaS landing page (centred hero, card grid, dark call-to-action band). It reads as a classroom material, not a church bulletin and not a startup.

**Key Characteristics:**
- Workbook paper: 2rem blue ruling with a red margin line, and text that sits on the rules; the large title gets its own 4rem title ruling.
- Two faces with clear jobs: Lexend for the interface and small headings, Literata for titles, Scripture and devotional text.
- Classroom blue for actions, links and the current step; gold for progress and done; Bible red only for verse numbers.
- The four-step lesson (Read, Talk, Do, Pray) as the recurring structure, with rounded stroke icons.
- Friendly rounded controls (0.625rem) and cards (1rem), soft blurred shadows only.

## Colors

A bright, mostly neutral paper palette with one action blue, one progress gold and one sacred red, each held to a single job.

### Primary
- **Classroom Blue** (brand): primary buttons, links, the current lesson step, the active progress dot, the focus ring, the logo tile, step icons. Darkens to **Pressed Blue** (brand-hover) on hover; **Blue Wash** (brand-soft) is the tint behind date chips, margin step icons and hover states of secondary and ghost controls.

### Secondary
- **Star-chart Gold** (gilt): completed lesson steps, completed days in the week, earlier progress dots, the gold ribbon in the logo. A fill only; never text on paper.
- **Gold Ink** (gold-ink): gold as legible text and check marks, always on **Gold Wash** (gold-soft), which also backs the "180 days" note.

### Tertiary
- **Bible Red** (rubric): verse numbers in Scripture on the reading page. The projector themes carry their own `verse` colour (#a01c14 on white, #9a1a12 on paper, #ffa094 on navy, #ffe14d in high contrast), each held at 7:1.

### Neutral
- **Workbook Paper** (parchment): the page background, the step-tab track, small topic pills.
- **Clean Leaf** (surface): lesson cards, the app bar, the footer, alternating full-width bands, and the background under ruled sheets.
- **Ink Navy** (ink): body text and headings.
- **Pencil Grey** (muted): secondary text, captions, teacher tips.
- **Faint Rule** (line): card borders, dividers, inactive dots and step numbers.
- **Strong Rule** (line-strong): higher-contrast borders where a control edge must meet 3:1.
- **Ruling Blue** (ruling): the workbook's horizontal lines and the connector between the four steps.
- **Margin Pink** (margin): the vertical margin line on workbook sheets, nothing else.
- **Alert Red** (danger) with **Alert Wash** (danger-soft): destructive actions and error messages only.

### Named Rules
**The Red-Letter Rule.** Bible red is for verse numbers and nothing else. Errors use danger; the margin line uses its own pale pink.

**The Gold Star Rule.** Gold marks progress and completion: done steps, done days, earlier dots, check marks in benefit lists. It never marks an action.

**The Blue Means Here Rule.** Classroom blue marks what you can press and where you are now. Do not spend it on decoration.

## Typography

**Display Font:** Literata (with Iowan Old Style, Georgia)
**Body Font:** Lexend (with ui-sans-serif, system-ui)

**Character:** Lexend is round, open and plainly classroom; Literata is a warm screen-reading book serif that gives Scripture and titles the weight of a printed Bible without costume. Both are self-hosted variable fonts so they load on school networks that block font services.

### Hierarchy
- **Display** (Literata 600, 1.75rem on a 2rem line on phones, 2.75rem on a 4rem line from md): the day's devotional title on ruled paper, written on the 4rem title ruling from md.
- **Headline** (Literata 600, 1.875rem to 2.4rem, line-height 1.25): section headings on the marketing page and page titles.
- **Title** (Lexend 600, 1.25rem on a 2rem line): lesson part titles (Scripture, Reflection), step names, card headings at 1.125rem.
- **Scripture** (Literata 400, 1.25rem to 1.4rem on a 2rem line): passages on the reading page, with superscript verse numbers at 0.6em in Bible red.
- **Reading** (Literata 400, 1.125rem on a 2rem line, max 36rem): reflection, practice and prayer text; the discussion question is set larger (1.4rem) and balanced.
- **Body** (Lexend 400, 1rem, line-height 1.6): interface copy, descriptions, lists.
- **Label** (Lexend 600, 0.875rem): chips, step tabs, captions, the "Slide 2 of 5" count.

### Named Rules
**The Two Jobs Rule.** Lexend does the interface; Literata carries the Word and the day's title. Never set Scripture in Lexend or buttons in Literata.

**The No Kicker Rule.** No small label line above a heading. Context (date, week, step) sits in chips and progress dots beside or above the title row, not as letter-spaced capitals.

## Layout

Content sits in a centred container. The home page opens with today's lesson sheet beside a 19rem "why schools use it" panel on large screens (`minmax(0,1fr) 19rem`, gap 2rem), stacking below on phones. Following sections alternate full-width bands of paper and white, separated by faint rules, with 3.5rem vertical padding growing to 5rem from md. Text blocks hold to about 42rem; two-column sections split 5:7.

Ruled sheets follow a strict 2rem vertical rhythm. Three paper treatments exist: **workbook paper** (2rem blue ruling, each rule 1.8rem into its band just under the baseline, plus the red margin line), **title lines** (a 4rem ruling for the large title from md, each rule at 3.05rem just under its baseline; the block is always a whole number of 2rem bands tall so the 2rem ruling continues below it), and **margin only** (the red margin line without ruling, for sheets whose text does not keep to the grid). The margin line sits at 0.625rem on phones and 2.75rem from 40rem; text on a sheet starts at 4rem from the left on wider screens and 1.25rem on phones, with the step icon centred in the margin. The reading page is a single column up to 48rem, widening to a two-column layout with a 17rem side card at lg.

Touch targets are at least 44px everywhere (buttons, nav links, step tabs).

### Named Rules
**The On-the-Lines Rule.** Text on ruled paper keeps to the 2rem grid (the large title takes 4rem on its own title ruling, in whole 2rem bands), paragraphs are indented rather than spaced, and every rule sits just under a baseline. A block that cannot keep the grid (the inline presenter, a card) clears the ruling with a solid white panel instead of letting lines cross glyphs; a sheet whose text does not keep the grid uses the margin line alone.

## Elevation & Depth

Depth is gentle and layered: white lesson cards lifted a little off warm paper with soft, blurred, slightly dropped shadows. Bands and the paper/white alternation do most of the structural work; shadows only say "this is a sheet you work on".

### Shadow Vocabulary
- **Card** (`0 1px 2px rgb(29 36 51 / 0.06), 0 6px 16px -4px rgb(29 36 51 / 0.1)`): lesson cards, ruled sheets, the presenter frame, the current step tab, today's day in the week.
- **Lift** (`0 2px 4px rgb(29 36 51 / 0.06), 0 12px 28px -8px rgb(29 36 51 / 0.18)`): raised states and overlays.
- **Blue press** (`0 2px 6px -1px rgb(35 80 204 / 0.45)`): under primary buttons only; it collapses on press as the button moves down 1px.

### Named Rules
**The Soft Shadow Rule.** Every shadow is blurred. No zero-blur offset shadows, no hard outlines standing in for elevation.

## Shapes

Friendly, rounded classroom materials. Controls take 0.625rem corners; cards and sheets take 1rem; step tabs inside their track take 0.5rem so they nest. Chips, step numbers, progress dots, check badges and margin icons are full circles or pills. Borders are 1px faint rules; the four-step path uses 2px blue rings around its icons. Icons are rounded strokes (1.75 weight, round caps and joins), including book, chat, target and pray. The logo is an open Bible on a 9-unit-rounded blue tile with a gold ribbon.

## Components

### Buttons
Clear and confident, like a classroom app.
- **Shape:** gently rounded (0.625rem), Lexend 600, gap 0.5rem for an icon.
- **Primary:** classroom blue with white text, the blue press shadow; 44px high with 20px side padding, or 52px with 28px at large size.
- **Hover / Focus:** darkens to pressed blue; pressed moves down 1px and drops the shadow. Focus is a 3px classroom-blue outline at 2px offset (gold on dark).
- **Secondary:** white with blue text and a pale blue border (#b8c6ea), turning to a blue border on a blue wash on hover. Used for Sign in, Back/Next, text size and the founding-school link.
- **Ghost:** blue text, no border, blue wash on hover. **Danger:** alert red with white text.

### Chips
- **Date chip:** blue wash pill with blue Lexend 600 label and a sun or calendar icon.
- **Step tag:** an inline, non-wrapping paper-coloured pill with muted Lexend 500 text (Read, Talk, Do, Pray) that leads the part's heading, so it never wraps away from the title; on phones it carries a small blue step icon.
- **Topic pills:** paper-coloured pills with muted text.
- **Week progress:** five 10px dots (gold for days done, blue with a soft blue ring for today, faint rule for later days) always followed by the visible text "Day n of 5".
- **Reading-level chip:** solid blue pill with white label (K–2, 9–12).

### Cards / Containers
- **Corner Style:** 1rem.
- **Background:** white on paper; a blue-wash tone and a solid blue tone exist for emphasis.
- **Shadow Strategy:** the Card shadow (see Elevation).
- **Border:** 1px faint rule.
- **Internal Padding:** 1.25rem, or 1.5rem to 2rem for large cards.

### Navigation
A sticky white app bar (95% opacity with a light blur), 64px tall, with the wordmark at left and Lexend 500 links in pencil grey that take blue text on a blue wash on hover; Sign in is a secondary button. On phones the links fold into a disclosure menu under a 44px menu button. The footer is white with muted links that turn blue and underline on hover, and the Scripture source line in Literata italic.

### Lesson Step Tabs (signature)
The four steps of every lesson, Read, Talk, Do, Pray, as a four-column tab strip on a paper-coloured track. The current step is a white tab with blue text, the card shadow and a blue numbered circle; steps already passed show a gold circle with a check; later steps show a grey number. On phones the number gives way to the step's icon. Each tab jumps the presenter to that part of the devotional.

### Workbook Sheet (signature)
A white sheet with 2rem blue ruling and a red margin line, 1rem corners and the card shadow. On the reading page each lesson part opens with a Lexend heading led by its step tag, then a muted teacher tip, then Literata text on the lines. From sm the step icon sits as a 2rem blue-wash medallion centred in the margin column; on phones the icon moves into the step tag instead. Today's lesson on the home page uses the same sheet for the date row (date chip, week theme, dots and "Day n of 5"), the title on its title ruling, and the reference, with the inline presenter pasted on as a clear white panel.

### Inline Presenter
A 16:9 slide frame with the card shadow and a 4px progress bar along its bottom edge, set in Literata from the projector theme. Controls below: Back, Next, slide count, A− / A+, and the primary "Present full screen". Projector themes are White, Paper, Classroom navy and High contrast, each tested at 7:1.

### Week Strip and Four-Step Path
The sample week shows five day cards: done days with a gold check, today outlined in blue with the card shadow, later days grey. The four-step path is a row of 48px circles with a 2px blue ring, joined by a ruling-blue line.

## Do's and Don'ts

### Do:
- **Do** set every line on a ruled sheet to the 2rem grid, or give the block a solid white panel that clears the ruling.
- **Do** use classroom blue for actions, links, the current step and focus, and nothing else.
- **Do** mark progress and completion with gold: fills in gilt, text and checks in gold ink on gold wash.
- **Do** set Scripture, titles and devotional text in Literata and the interface in Lexend.
- **Do** keep every interactive target at least 44px and every presentation theme at 7:1.
- **Do** keep the four-step lesson (Read, Talk, Do, Pray) and its icons consistent wherever the devotional appears.

### Don't:
- **Don't** use Bible red for anything but verse numbers.
- **Don't** put a label line or kicker above a heading.
- **Don't** use zero-blur offset shadows; every shadow is soft and blurred.
- **Don't** let ruling lines cross glyphs: text off the grid sits on a solid panel or a margin-only sheet.
- **Don't** bring back the hymnal costume (bookcloth navy, gilt rules, letterpress capitals) or the SaaS landing template (centred hero, card grid, dark call-to-action band).
- **Don't** lead with "180 days"; one devotional for every school day is the promise, the count stays in the background.

---
name: Everyday Devotional
description: A school hymnal for every school day, set in Caslon on Bible paper, bound in navy bookcloth with gilt and red rubrics.
colors:
  paper: "#fbfaf6"
  surface: "#ffffff"
  ink: "#1b1a17"
  muted: "#55524b"
  line: "#d9d4c7"
  line-strong: "#6b665c"
  bookcloth: "#1c2a47"
  bookcloth-deep: "#121c31"
  bookcloth-raised: "#2a3a5e"
  bookcloth-wash: "#e7e9ef"
  cloth-text: "#e9e3d2"
  gilt: "#d4b25e"
  rubric: "#a31d16"
  danger: "#b3261e"
  danger-soft: "#fbeae8"
typography:
  display:
    fontFamily: "Libre Caslon Text, Big Caslon, Iowan Old Style, Georgia, serif"
    fontSize: "6rem"
    fontWeight: 400
    lineHeight: 0.8
    fontFeature: "tnum"
  headline:
    fontFamily: "Libre Caslon Text, Big Caslon, Iowan Old Style, Georgia, serif"
    fontSize: "2.75rem"
    fontWeight: 400
    lineHeight: 1.12
  title:
    fontFamily: "Libre Caslon Text, Big Caslon, Iowan Old Style, Georgia, serif"
    fontSize: "1.25rem"
    fontWeight: 400
    lineHeight: 1.4
  body:
    fontFamily: "Libre Caslon Text, Big Caslon, Iowan Old Style, Georgia, serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.6
  rubric:
    fontFamily: "Libre Caslon Text, Big Caslon, Iowan Old Style, Georgia, serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Libre Caslon Text, Big Caslon, Iowan Old Style, Georgia, serif"
    fontSize: "0.875rem"
    fontWeight: 400
    letterSpacing: "0.16em"
  ui:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif"
    fontSize: "1rem"
    fontWeight: 600
    lineHeight: 1.6
rounded:
  control: "0.1875rem"
  card: "0.25rem"
spacing:
  gutter: "16px"
  gutter-md: "32px"
  section: "56px"
  section-md: "80px"
  container: "72rem"
components:
  button-primary:
    backgroundColor: "{colors.bookcloth}"
    textColor: "{colors.surface}"
    rounded: "{rounded.control}"
    padding: "0 20px"
    height: "44px"
  button-primary-hover:
    backgroundColor: "{colors.bookcloth-deep}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "0 12px"
    height: "44px"
  button-secondary-hover:
    backgroundColor: "{colors.bookcloth-wash}"
  button-gilt:
    backgroundColor: "{colors.gilt}"
    textColor: "{colors.bookcloth}"
    rounded: "{rounded.control}"
    padding: "0 28px"
    height: "52px"
  masthead:
    backgroundColor: "{colors.bookcloth}"
    textColor: "{colors.cloth-text}"
    height: "64px"
  text-field:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "8px 12px"
    height: "44px"
---

# Design System: Everyday Devotional

## Overview

**Creative North Star: "The School Hymnal"**

The site is a well-made hymnal, a numbered book for every school day. Inside, the page is bright, thin Bible paper with true ink black and red rubrics; outside, whole regions are bound in navy bookcloth with gilt stamping. The masthead is the front board, the founding section and colophon are the back cover. Everything between them reads as printed matter: Caslon set at regular weight, square-cut corners, hairline and double rules where another product would put cards.

Density is that of a well-leaded book page, not a dashboard. Sections are separated by rules and paper, not by boxes and shadows. The red is the red-letter tradition: it marks what the teacher does (instructions set in italic) and what you count by (day numbers, roman order numerals, verse figures), never decoration. Gilt only ever appears on cloth.

This world replaces an earlier cream-parchment, teal, Source Serif look with rounded cards; that look is retired and nothing of it is current.

**Key Characteristics:**
- Bible paper (#fbfaf6) inside, navy bookcloth (#1c2a47) for the masthead, back cover and colophon.
- Red italic rubrics as the signature: instructions to the teacher, day numbers, order numerals.
- Libre Caslon Text throughout, regular weight even at display sizes.
- Printed rules instead of containers: 4px double rules open lists and sections, hairlines divide items, dotted leaders run index entries.
- Square-cut corners (3px and 4px); no shadows on the page.

## Colors

A three-ink book: black on bright paper, one red for rubrics, and navy cloth stamped in gilt.

### Primary
- **Bookcloth Navy** (bookcloth): primary actions (Present full screen, primary buttons), the masthead, the founding "back cover" and the footer colophon. It is the binding, so it carries whole regions or the single most important control, nothing in between. **Bookcloth Deep** (bookcloth-deep) is its hover; **Bookcloth Raised** (bookcloth-raised) is a lifted surface on cloth; **Bookcloth Wash** (bookcloth-wash) is the hover and selection tint on paper.

### Secondary
- **Rubric Red** (rubric): the red-letter ink. Day numbers, roman order numerals, italic instructions to the teacher, the progress bar and verse figures in slides, and rubric links (red text with a 40% red underline that fills on hover). Measured ≥7:1 on paper.

### Tertiary
- **Gilt** (gilt): stamping on cloth only. The wordmark, cloth headings and sub-heads, double-rule frames on the back cover, the Sign in outline, the focus ring on dark surfaces, and the one gilt-filled button on the back cover.

### Neutral
- **Bible Paper** (paper): the page ground everywhere outside the cloth.
- **Clean Leaf** (surface): white for controls and fields that sit on the page.
- **Press Ink** (ink): body text and the 70%-opacity double rules.
- **Faded Ink** (muted): running heads, tune-and-meter lines, secondary prose, captions.
- **Hairline** (line): item dividers and section borders. **Strong Hairline** (line-strong): control borders, dotted leaders and the outer keyline of framed blocks, usually at 50 to 60% opacity.
- **Cloth Text** (cloth-text): the warm off-white for running text on navy cloth (applied as a literal value, not yet a theme token).
- **Danger** (danger, danger-soft): form errors and destructive actions in the app only.

### Named Rules
**The Red-Letter Rule.** Rubric red marks only what the teacher does or what is counted: instructions, day numbers, order numerals, verse figures. It never fills a surface, a button or a heading.

**The Gilt-on-Cloth Rule.** Gilt appears only on bookcloth navy. On paper it has no contrast and no meaning.

**The Binding Rule.** Navy either carries a whole region (masthead, back cover, colophon) or the single primary action in view. It is never a tinted card in the middle of the page.

## Typography

**Display Font:** Libre Caslon Text, self-hosted (400, 400 italic, 700; `--font-caslon`), falling back to Big Caslon, Iowan Old Style, Georgia.
**Body Font:** the same Caslon for all reading text on the site and on slides.
**UI Font:** the system sans stack for application controls, form labels and fields.

**Character:** One old-style book face does all the speaking, at regular weight, with italic for rubrics and tune-and-meter lines. The system sans is a tool, not a voice: it stays inside app forms and controls.

### Hierarchy
- **Display** (400, 4.5rem to 6rem, line-height 0.8, tabular figures, rubric red): the day number at the head of today's page, with the month beneath it in tracked capitals.
- **Headline** (400, 1.875rem to 2.75rem, line-height 1.12 to 1.15, balanced): page and section titles; `Heading` levels 1 to 3 are all regular weight.
- **Title** (400, 1.25rem to 1.75rem, snug): list-item names, sample passages, order-of-day entries. Level-4 headings are the one place Caslon bold appears.
- **Body** (400, 1rem to 1.125rem, line-height 1.6; rich text 1.7): reading prose, kept to about 36rem (`max-w-xl`/`max-w-md`) in marketing copy. Paragraphs and list items use `text-wrap: pretty`.
- **Rubric** (400 italic, 0.875rem to 1rem, rubric red): instructions to the teacher and reading-level labels.
- **Label** (400, 0.875rem, uppercase, tracking 0.16em to 0.2em): the wordmark, the month under the day number, and sub-heads on the back cover (in gilt).

### Named Rules
**The Regular-Weight Display Rule.** Caslon is set at 400 at every display size, as a hymnal sets its titles. Bold is reserved for small headings (h4, rich-text h3).

**The Stated Substitution Rule.** Libre Caslon Text has no true small capitals, so tracked full capitals (0.16em to 0.2em) stand in for them: the wordmark, the month abbreviation, the founding sub-heads. Never synthesize small caps with `font-variant: small-caps` or scaled capitals.

**The Figures Rule.** Counted numbers use tabular figures; the wordmark's "180" and the index ranges use old-style figures.

## Layout

A single centred book column (max 72rem, 16px gutter on phones, 32px from md) with sections stacked vertically at 56px padding, 80px from md. Within a section the grid is asymmetric, like a book spread: a 5:7 split puts the heading on the left and the ruled list on the right; today's page puts the devotional in the main column and a 16rem right margin for "tune and meter" notes, separated by a hairline. Every split collapses to one column on phones, the margin notes falling below.

The page opens with a running head: the passage reference on the left, the weekday in italic on the right, over a 4px double rule. The index of the year runs 2, 3 then 4 columns with dotted leaders between the week and its day range. Targets on every control are at least 44px.

## Elevation & Depth

The page is flat. Depth is printed, not lit: a double rule, an inset keyline, or the change from paper to cloth. Framed blocks (the inline presenter, the empty-state verse block) use a 1px ink border with a second 1px keyline outline offset 5px, and the back cover uses a 4px gilt double rule with a 1px inset gilt rule 6px inside it.

### Named Rules
**The Printed-Depth Rule.** No shadows on paper or cloth. Separation comes from rules, keylines and the paper/cloth boundary.

## Shapes

Square-cut, as a trimmed book block: controls at 3px (`rounded.control`), any remaining containers at 4px (`rounded.card`). Rules are the recurring geometry: 4px double rules (ink at 70% on paper, gilt at 60 to 70% on cloth) open sections and lists, 1px hairlines divide items, dotted rules lead the eye across index entries. There are no pills, circles or icon tiles in this world's vocabulary.

## Components

### Buttons
Plain and set like type.
- **Shape:** square-cut (3px).
- **Primary:** bookcloth navy fill, white text, 44px minimum height, 20px side padding; hover deepens to Bookcloth Deep. On marketing surfaces the label is Caslon regular; in the app it is the semibold system sans.
- **Secondary:** white leaf, ink text, Strong Hairline border at 50 to 60%; hover takes the Bookcloth Wash.
- **Ghost:** navy text, no border, wash on hover.
- **Gilt (back cover only):** gilt fill, navy text, Caslon regular, 52px tall.
- **Focus:** a 3px navy outline offset 2px everywhere; on cloth (`.on-dark`) the ring turns gilt. Disabled controls drop to 40 to 60% opacity.

### Rubric Links
The default link on marketing pages: Caslon in rubric red with an underline at 40% red, offset 4px, that fills to full red on hover. Used for "Become a founding school" and the classroom-mode link.

### Inputs / Fields
- **Style:** white field, 1px Strong Hairline border at 60%, 3px corners, 44px minimum height, 8px by 12px padding, system sans; label in semibold sans above, hint in muted below it.
- **Focus:** the global navy ring.
- **Error / Disabled:** border and message in Danger; disabled fields take a 40% Hairline wash.

### Navigation
- **Masthead:** sticky navy cloth band, 64px tall, closed by a 4px gilt double rule at 60%. Gilt wordmark on the left; Caslon links in cloth text that turn gilt and underline on hover; "Sign in" as a gilt-outlined control. Phones get a gilt menu button and a disclosure panel on cloth divided by a 40% gilt hairline.
- **Colophon (footer):** the back cover continued: the wordmark, the description, and an italic note on the setting and the Scripture translation in a dimmed cloth tone, with Caslon links on the right.

### Wordmark
The "180" boxed in a ruled label (a 1px frame with an inner rule above and below) in old-style figures, then the name in tracked capitals. Navy on paper, gilt on cloth.

### Day Number (signature)
The day of the month in rubric red at display size, tabular figures, line-height 0.8, with the month in tracked capitals beneath, set at the top left of today's page beside the title, as a red-letter calendar prints a day.

### Ruled Order List (signature)
A list opened by a 4px double rule, each entry closed by a hairline: a 3rem column of rubric-red roman numerals, the entry name in Caslon at title size, and its instruction in red italic beneath. The same ruled form (without numerals, muted body) carries the trust list.

### Back Cover (signature)
The founding section on bookcloth: a 4px gilt double-rule frame with a 1px inset gilt rule 6px inside, a gilt headline, cloth-text body, gilt tracked-capital sub-heads over two columns, and the gilt button.

### Classroom Slides
Slides are set in Caslon (type scales in em with the slide) and take their colours from four projector themes held in `PRESENT_THEMES` (src/lib/content/present.ts): White (ink on white, rubric accent), Paper (ink on Bible paper, rubric accent), Bookcloth (white on a deeper cloth navy, gilt accent) and High contrast (white on black, bright yellow accent). Each exposes `--p-bg`, `--p-fg`, `--p-accent` and `--p-muted`; list markers, blockquote rules and the 4px progress bar use the accent. Every theme's text, muted and accent colour must reach 7:1 on its background, enforced by the unit tests. Printed slides are black on white, one per landscape page.

## Do's and Don'ts

### Do:
- **Do** separate sections and list items with printed rules: a 4px double rule to open, 1px hairlines between entries, dotted leaders in indexes.
- **Do** set every reading and display line in Libre Caslon Text at regular weight; reserve bold for h4 and rich-text h3.
- **Do** put instructions to the teacher in red italic rubrics, and number things (days, order steps) in rubric red.
- **Do** keep gilt on bookcloth only, and let navy cloth carry whole regions or the single primary action.
- **Do** use tracked full capitals (0.16em to 0.2em) wherever small capitals would be set, because the face has none.
- **Do** keep every projector theme at 7:1 or better for text, muted and accent colours, and add any new theme to the contrast test.
- **Do** keep controls at least 44px and square-cut (3px).

### Don't:
- **Don't** synthesize small capitals with `font-variant: small-caps` or scaled-down capitals.
- **Don't** use cards, icon tiles, pills or shadows on the page; frame with rules and keylines instead.
- **Don't** use rubric red for fills, buttons or decorative headings.
- **Don't** put gilt on paper.
- **Don't** bring back the retired look: cream parchment ground with teal accents, Source Serif, rounded cards.
- **Don't** add uppercase semibold label lines above headings; the only tracked capitals are the wordmark, the month and the back-cover sub-heads.

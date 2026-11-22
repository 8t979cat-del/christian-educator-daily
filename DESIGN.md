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

<!-- impeccable:design-map -->
Name: Everyday Devotional
Colors: primary: brand #2350cc; secondary: gilt #f2b23a; tertiary: rubric #b42318; neutral: parchment #f8f6f0; error: danger #b3261e; primary: brand-hover #1a3ea3; primary: brand-soft #e9eefc (+10 more in the sidecar)
Fonts: Literata (display, headline, scripture, reading); Lexend (title, body, label)
Spacing: ruling 2rem, card-sm 1.25rem, card-md 1.5rem, margin-gutter 4rem, section 3.5rem, section-lg 5rem
Radius: step 0.5rem, control 0.625rem, card 1rem, pill 9999px
North Star: "The Classroom Workbook"
Rules:
- The Red-Letter Rule. Bible red is for verse numbers and nothing else.
- The Gold Star Rule. Gold marks progress and completion: done steps, done days, earlier dots, check marks in benefit lists.
- The Blue Means Here Rule. Classroom blue marks what you can press and where you are now.
- The Two Jobs Rule. Lexend does the interface; Literata carries the Word and the day's title.
- The No Kicker Rule. No small label line above a heading.
- The On-the-Lines Rule. Text on ruled paper keeps to the 2rem grid (the large title takes 4rem on its own title ruling, in whole 2rem bands), paragraphs are indented rather than spaced, and every rule sits just under a baseline.
- The Soft Shadow Rule. Every shadow is blurred.
Elevation:
- Card: 0 1px 2px rgb(29 36 51 / 0.06), 0 6px 16px -4px rgb(29 36 51 / 0.1)
- Lift: 0 2px 4px rgb(29 36 51 / 0.06), 0 12px 28px -8px rgb(29 36 51 / 0.18)
- Blue press: 0 2px 6px -1px rgb(35 80 204 / 0.45)
Don't:
- Don't use Bible red for anything but verse numbers.
- Don't put a label line or kicker above a heading.
- Don't use zero-blur offset shadows; every shadow is soft and blurred.
- Don't let ruling lines cross glyphs: text off the grid sits on a solid panel or a margin-only sheet.
- Don't bring back the hymnal costume (bookcloth navy, gilt rules, letterpress capitals) or the SaaS landing template (centred hero, card grid, dark call-to-action band).
- Don't lead with "180 days"; one devotional for every school day is the promise, the count stays in the background.
Do:
- Do set every line on a ruled sheet to the 2rem grid, or give the block a solid white panel that clears the ruling.
- Do use classroom blue for actions, links, the current step and focus, and nothing else.
- (+4 more)
Full: .impeccable/design-full.md (read a section when you need its detail)

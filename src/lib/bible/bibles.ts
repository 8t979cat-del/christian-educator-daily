/** The public-domain Bibles whose full text is bundled with the site (data/<code>.json). Safe to import anywhere. */
export const BIBLES = {
  kjv: { code: "kjv", short: "KJV", label: "King James Version (KJV)", notice: "King James Version (KJV), public domain in the United States." },
  web: { code: "web", short: "WEB", label: "World English Bible (WEB)", notice: "World English Bible (WEB), public domain." },
  asv: { code: "asv", short: "ASV", label: "American Standard Version (ASV)", notice: "American Standard Version (ASV), public domain." },
} as const;
export type BibleCode = keyof typeof BIBLES;
export const BIBLE_CODES = Object.keys(BIBLES) as [BibleCode, ...BibleCode[]];
export const isBibleCode = (code: unknown): code is BibleCode => typeof code === "string" && code in BIBLES;

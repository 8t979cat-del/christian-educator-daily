import localFont from "next/font/local";

/**
 * Source Serif 4, self-hosted (Latin subset, variable weight). Served from this
 * site, so it loads on school networks that block font services, and it is
 * small: about 50 KB per style.
 */
export const sourceSerif = localFont({
  src: [
    { path: "./fonts/source-serif-4-latin.woff2", style: "normal", weight: "200 900" },
    { path: "./fonts/source-serif-4-italic-latin.woff2", style: "italic", weight: "200 900" },
  ],
  variable: "--font-source-serif",
  display: "swap",
  adjustFontFallback: "Times New Roman",
});

import localFont from "next/font/local";

/**
 * Self-hosted (Latin subset) so they load on school networks that block font services.
 * Lexend: the interface and headings, a face designed to make reading easier.
 * Literata: Scripture and devotional text, a book serif made for reading on screens.
 * Both are variable fonts: one file covers every weight.
 */
export const lexend = localFont({
  src: [{ path: "./fonts/lexend-latin.woff2", style: "normal", weight: "300 800" }],
  variable: "--font-lexend",
  display: "swap",
  adjustFontFallback: "Arial",
});

export const literata = localFont({
  src: [
    { path: "./fonts/literata-latin.woff2", style: "normal", weight: "300 800" },
    { path: "./fonts/literata-italic-latin.woff2", style: "italic", weight: "300 800" },
  ],
  variable: "--font-literata",
  display: "swap",
  adjustFontFallback: "Times New Roman",
});

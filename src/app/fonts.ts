import localFont from "next/font/local";

/**
 * Libre Caslon Text, self-hosted (Latin subset): the hymnal and Bible face of the
 * site. Served from this site, so it loads on school networks that block font
 * services; about 17 KB per style.
 */
export const caslon = localFont({
  src: [
    { path: "./fonts/libre-caslon-text-400-latin.woff2", style: "normal", weight: "400" },
    { path: "./fonts/libre-caslon-text-400-italic-latin.woff2", style: "italic", weight: "400" },
    { path: "./fonts/libre-caslon-text-700-latin.woff2", style: "normal", weight: "700" },
  ],
  variable: "--font-caslon",
  display: "swap",
  adjustFontFallback: "Times New Roman",
});

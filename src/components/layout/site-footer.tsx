import Link from "next/link";
import { Container } from "./container";
import { Logo } from "./logo";
import { SITE } from "@/lib/site";

/** The colophon, printed on the back cover's cloth: what the book is, how it is set, and where to go next. */
export function SiteFooter() {
  const link = "flex min-h-11 items-center text-[#e9e3d2] underline-offset-4 hover:text-gilt hover:underline";
  return (
    <footer className="on-dark bg-brand text-[#e9e3d2]">
      <Container className="grid gap-8 py-10 font-serif md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
        <div className="max-w-md">
          <Logo onCloth />
          <p className="mt-3">{SITE.description}</p>
          <p className="mt-4 text-sm italic text-[#c9c2ad]">
            Set in Libre Caslon. Scripture on this site is from the King James Version, public domain in the United States, unless a devotional names another translation.
          </p>
        </div>
        <nav aria-label="Footer" className="flex flex-col gap-1 md:items-end">
          <Link href="/#founding" className={link}>Founding schools</Link>
          <Link href="/classroom-demo" className={link}>Try classroom mode</Link>
          <Link href="/login" className={link}>Sign in</Link>
        </nav>
      </Container>
    </footer>
  );
}

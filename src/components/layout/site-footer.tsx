import Link from "next/link";
import { Container } from "./container";
import { Logo } from "./logo";
import { SITE } from "@/lib/site";

/** The colophon: what the book is, how it is set, and where to go next. */
export function SiteFooter() {
  return (
    <footer className="border-t border-line bg-parchment">
      <Container className="grid gap-8 py-10 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
        <div className="max-w-md">
          <Logo />
          <p className="mt-3 font-serif text-muted">{SITE.description}</p>
          <p className="mt-4 font-serif text-sm italic text-muted">
            Set in Libre Caslon. Scripture on this site is from the King James Version, public domain in the United States, unless a devotional names another translation.
          </p>
        </div>
        <nav aria-label="Footer" className="flex flex-col gap-1 font-serif md:items-end">
          <Link href="/#founding" className="flex min-h-11 items-center text-ink underline-offset-4 hover:text-rubric hover:underline">Founding schools</Link>
          <Link href="/classroom-demo" className="flex min-h-11 items-center text-ink underline-offset-4 hover:text-rubric hover:underline">Try classroom mode</Link>
          <Link href="/login" className="flex min-h-11 items-center text-ink underline-offset-4 hover:text-rubric hover:underline">Sign in</Link>
        </nav>
      </Container>
    </footer>
  );
}

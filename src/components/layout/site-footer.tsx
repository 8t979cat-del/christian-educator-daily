import Link from "next/link";
import { Container } from "./container";
import { Logo } from "./logo";
import { SITE } from "@/lib/site";

/** The footer: what the product is, where Scripture comes from, and where to go next. */
export function SiteFooter() {
  const link = "flex min-h-11 items-center rounded-control font-medium text-muted hover:text-brand hover:underline";
  return (
    <footer className="border-t border-line bg-surface">
      <Container className="grid gap-8 py-10 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
        <div className="max-w-md">
          <Logo />
          <p className="mt-3 text-muted">{SITE.description}</p>
          <p className="mt-4 font-serif text-sm italic text-muted">
            Scripture on this site is from the King James Version, public domain in the United States, unless a devotional names another translation.
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

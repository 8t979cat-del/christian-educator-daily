import Link from "next/link";
import { Container } from "./container";
import { Logo } from "./logo";
import { SITE } from "@/lib/site";

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-line bg-surface">
      <Container className="flex flex-col gap-6 py-10 md:flex-row md:items-start md:justify-between">
        <div className="max-w-sm">
          <Logo />
          <p className="mt-3 text-sm text-muted">{SITE.description}</p>
        </div>
        <nav aria-label="Footer" className="flex flex-col gap-1 text-sm md:items-end">
          <Link href="/styleguide" className="flex min-h-11 items-center text-muted hover:text-ink">
            Design system
          </Link>
          {/* A plain anchor: this is a route handler, not a page, so it must not be prefetched as one. */}
          <a href="/api/health" className="flex min-h-11 items-center text-muted hover:text-ink">
            System status
          </a>
        </nav>
      </Container>
    </footer>
  );
}

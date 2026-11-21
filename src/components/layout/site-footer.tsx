import Link from "next/link";
import { Container } from "./container";
import { Logo } from "./logo";
import { SITE } from "@/lib/site";

export function SiteFooter() {
  return (
    <footer className="border-t border-line bg-surface">
      <Container className="flex flex-col gap-6 py-10 md:flex-row md:items-start md:justify-between">
        <div className="max-w-sm">
          <Logo />
          <p className="mt-3 text-sm text-muted">{SITE.description}</p>
        </div>
        <nav aria-label="Footer" className="flex flex-col gap-1 text-sm md:items-end">
          <Link href="/#founding" className="flex min-h-11 items-center text-muted hover:text-ink">
            Founding schools
          </Link>
          <Link href="/classroom-demo" className="flex min-h-11 items-center text-muted hover:text-ink">
            Try classroom mode
          </Link>
          <Link href="/login" className="flex min-h-11 items-center text-muted hover:text-ink">
            Sign in
          </Link>
        </nav>
      </Container>
    </footer>
  );
}

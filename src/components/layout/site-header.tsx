"use client";

import Link from "next/link";
import { useState } from "react";
import { ButtonLink } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Container } from "./container";
import { Logo } from "./logo";
import { MARKETING_NAV } from "@/lib/site";

/** Public header: inline links on tablet and up, a disclosure menu on phones. */
export function SiteHeader() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-parchment/95 backdrop-blur">
      <Container className="flex h-16 items-center justify-between gap-4">
        <Logo />

        <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
          {MARKETING_NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="grid min-h-11 place-items-center rounded-control px-3 font-medium text-muted hover:bg-brand-soft hover:text-ink"
            >
              {item.label}
            </Link>
          ))}
          <ButtonLink href="/login" variant="ghost" className="ml-2">
            Sign in
          </ButtonLink>
          <ButtonLink href="/signup">Create account</ButtonLink>
        </nav>

        <button
          type="button"
          className="grid size-11 place-items-center rounded-control hover:bg-brand-soft md:hidden"
          aria-expanded={open}
          aria-controls="mobile-menu"
          onClick={() => setOpen((value) => !value)}
        >
          <Icon name={open ? "x" : "menu"} />
          <span className="sr-only">{open ? "Close menu" : "Open menu"}</span>
        </button>
      </Container>

      {open ? (
        <nav id="mobile-menu" aria-label="Main" className="border-t border-line bg-parchment md:hidden">
          <Container className="flex flex-col gap-1 py-3">
            {MARKETING_NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className="flex min-h-11 items-center rounded-control px-3 font-medium hover:bg-brand-soft"
              >
                {item.label}
              </Link>
            ))}
            <ButtonLink href="/login" variant="secondary" fullWidth className="mt-2" onClick={() => setOpen(false)}>
              Sign in
            </ButtonLink>
            <ButtonLink href="/signup" fullWidth onClick={() => setOpen(false)}>
              Create account
            </ButtonLink>
          </Container>
        </nav>
      ) : null}
    </header>
  );
}

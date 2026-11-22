"use client";

import Link from "next/link";
import { useState } from "react";
import { Icon } from "@/components/ui/icon";
import { buttonStyles } from "@/components/ui/button";
import { Container } from "./container";
import { Logo } from "./logo";
import { MARKETING_NAV } from "@/lib/site";

/** Public header: a white app bar with inline links on tablet and up, a disclosure menu on phones. */
export function SiteHeader() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-surface/95 backdrop-blur-sm">
      <Container className="flex min-h-16 items-center justify-between gap-4 py-1">
        <Logo />

        <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
          {MARKETING_NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="grid min-h-11 place-items-center rounded-control px-3 text-[0.95rem] font-medium text-muted hover:bg-brand-soft hover:text-brand"
            >
              {item.label}
            </Link>
          ))}
          {/* Teachers join by invitation, so there is no public sign-up here. */}
          <Link href="/login" className={buttonStyles({ variant: "secondary", className: "ml-2" })}>
            Sign in
          </Link>
        </nav>

        <button
          type="button"
          className="grid size-11 shrink-0 place-items-center rounded-control text-ink hover:bg-brand-soft md:hidden"
          aria-expanded={open}
          aria-controls="mobile-menu"
          onClick={() => setOpen((value) => !value)}
        >
          <Icon name={open ? "x" : "menu"} />
          <span className="sr-only">{open ? "Close menu" : "Open menu"}</span>
        </button>
      </Container>

      {open ? (
        <nav id="mobile-menu" aria-label="Main" className="border-t border-line bg-surface md:hidden">
          <Container className="flex flex-col gap-1 py-3">
            {MARKETING_NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className="flex min-h-11 items-center rounded-control px-3 font-medium text-ink hover:bg-brand-soft hover:text-brand"
              >
                {item.label}
              </Link>
            ))}
            <Link href="/login" onClick={() => setOpen(false)} className={buttonStyles({ variant: "secondary", fullWidth: true, className: "mt-2" })}>
              Sign in
            </Link>
          </Container>
        </nav>
      ) : null}
    </header>
  );
}

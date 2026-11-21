"use client";

import Link from "next/link";
import { useState } from "react";
import { Icon } from "@/components/ui/icon";
import { Container } from "./container";
import { Logo } from "./logo";
import { MARKETING_NAV } from "@/lib/site";

/** Public header: inline links on tablet and up, a disclosure menu on phones. */
export function SiteHeader() {
  const [open, setOpen] = useState(false);

  return (
    <header className="on-dark sticky top-0 z-40 border-b-4 border-double border-gilt/60 bg-brand text-[#e9e3d2]">
      <Container className="flex min-h-16 items-center justify-between gap-4 py-1">
        <Logo onCloth />

        <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
          {MARKETING_NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="grid min-h-11 place-items-center rounded-control px-3 font-serif text-[0.95rem] text-[#e9e3d2] underline-offset-[6px] hover:text-gilt hover:underline"
            >
              {item.label}
            </Link>
          ))}
          {/* Teachers join by invitation, so there is no public sign-up here. */}
          <Link href="/login" className="ml-2 inline-flex min-h-11 items-center rounded-control border border-gilt/70 px-5 font-serif text-gilt hover:bg-white/10">
            Sign in
          </Link>
        </nav>

        <button
          type="button"
          className="grid size-11 shrink-0 place-items-center rounded-control text-gilt hover:bg-white/10 md:hidden"
          aria-expanded={open}
          aria-controls="mobile-menu"
          onClick={() => setOpen((value) => !value)}
        >
          <Icon name={open ? "x" : "menu"} />
          <span className="sr-only">{open ? "Close menu" : "Open menu"}</span>
        </button>
      </Container>

      {open ? (
        <nav id="mobile-menu" aria-label="Main" className="border-t border-gilt/40 bg-brand md:hidden">
          <Container className="flex flex-col gap-1 py-3">
            {MARKETING_NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className="flex min-h-11 items-center rounded-control px-3 font-serif text-[#e9e3d2] hover:bg-white/10 hover:text-gilt"
              >
                {item.label}
              </Link>
            ))}
            <Link href="/login" onClick={() => setOpen(false)} className="mt-2 flex min-h-11 items-center justify-center rounded-control border border-gilt/70 font-serif text-gilt">
              Sign in
            </Link>
          </Container>
        </nav>
      ) : null}
    </header>
  );
}

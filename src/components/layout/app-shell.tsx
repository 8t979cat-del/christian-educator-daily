import Link from "next/link";
import type { ReactNode } from "react";
import { signOutAction } from "@/app/actions/auth";
import { Avatar } from "@/components/ui/avatar";
import { Icon } from "@/components/ui/icon";
import { AppSidebar, BottomTabs } from "./app-nav";
import { FeedbackLink } from "./feedback-link";
import { Logo } from "./logo";

/**
 * Layout for signed-in pages: side navigation on tablet and desktop,
 * a top bar and bottom tabs on phones.
 */
export function AppShell({
  children,
  userName,
  isStaff,
  planLabel,
}: {
  children: ReactNode;
  userName: string;
  isStaff: boolean;
  /** Plain status chip (Free, Plus, School). Always calm; never a prompt. */
  planLabel?: string;
}) {
  return (
    <div className="min-h-dvh md:pl-20 lg:pl-60 print:pl-0">
      <div className="print:hidden"><AppSidebar /></div>
      <header className="sticky top-0 z-20 print:hidden flex h-16 items-center justify-between gap-2 border-b border-line bg-parchment/95 px-4 backdrop-blur md:justify-end md:px-8">
        <span className="md:hidden">
          <Logo />
        </span>
        <div className="flex items-center gap-1">
          {planLabel ? (
            <Link href="/settings/billing" className="flex min-h-11 items-center rounded-control px-3 text-sm text-muted hover:bg-brand-soft hover:text-ink">
              <span className="sr-only">Your plan: </span>{planLabel}
            </Link>
          ) : null}
          <FeedbackLink />
          {isStaff ? (
            <Link
              href="/admin"
              className="flex min-h-11 items-center rounded-control px-3 text-sm font-semibold text-brand hover:bg-brand-soft"
            >
              Admin
            </Link>
          ) : null}
          <Link
            href="/settings"
            className="grid min-h-11 place-items-center rounded-control px-1 hover:bg-brand-soft"
          >
            <Avatar name={userName} size="sm" />
            <span className="sr-only">Account settings for {userName}</span>
          </Link>
          <form action={signOutAction}>
            <button
              type="submit"
              className="grid size-11 place-items-center rounded-control text-muted hover:bg-brand-soft hover:text-ink"
            >
              <Icon name="logout" />
              <span className="sr-only">Sign out</span>
            </button>
          </form>
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-5xl px-4 pb-28 pt-6 md:px-8 md:pb-12 md:pt-10 print:p-0">
        {children}
      </main>
      <div className="print:hidden"><BottomTabs /></div>
    </div>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/cn";
import { APP_NAV } from "@/lib/site";
import { Logo } from "./logo";

function useActive() {
  const pathname = usePathname();
  return (href: string) => pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Side navigation for tablet and desktop.
 * Tablet (md): a narrow rail with icon above label. Desktop (lg): full width, icon beside label.
 */
/** The menu: "My School" only for members of a school. */
const navFor = (inSchool: boolean) => APP_NAV.filter((item) => inSchool || item.href !== "/school");

export function AppSidebar({ inSchool = false }: { inSchool?: boolean }) {
  const isActive = useActive();

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-20 flex-col border-r border-line bg-surface md:flex lg:w-60">
      <div className="flex h-16 items-center justify-center border-b border-line px-3 lg:justify-start">
        <span className="lg:hidden">
          <Logo compact />
        </span>
        <span className="hidden lg:block">
          <Logo />
        </span>
      </div>
      <nav aria-label="Primary" className="flex flex-1 flex-col gap-1 overflow-y-auto p-2 lg:p-3">
        {navFor(inSchool).map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-11 flex-col items-center justify-center gap-1 rounded-control px-2 py-2 font-medium lg:flex-row lg:justify-start lg:gap-3 lg:px-3",
                active ? "bg-brand-soft text-brand" : "text-muted hover:bg-parchment hover:text-ink",
              )}
            >
              <Icon name={item.icon} />
              <span className="text-[11px] leading-tight lg:text-base">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}

/** Tab bar for phones. Today is first so the daily devotional is one tap away. */
export function BottomTabs({ inSchool = false }: { inSchool?: boolean }) {
  const isActive = useActive();
  const nav = navFor(inSchool);

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <ul className="grid grid-flow-col auto-cols-fr">
        {nav.map((item) => {
          const active = isActive(item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-14 flex-col items-center justify-center gap-0.5 px-1 text-[11px] font-medium",
                  active ? "text-brand" : "text-muted",
                )}
              >
                <Icon name={item.icon} size={22} />
                <span>{item.label === "My School" ? "School" : item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { setBookmarkAction, setCompletedAction } from "@/app/actions/devotional-state";
import { buttonStyles } from "@/components/ui/button";
import { Icon, type IconName } from "@/components/ui/icon";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";

const CHIP = (active = false) =>
  cn(
    buttonStyles({ variant: active ? "primary" : "secondary" }),
    "min-h-11 px-4 text-base",
  );

/** Toggle that updates at once and rolls back with a message if the save fails. */
function useToggle(initial: boolean, save: (next: boolean) => Promise<{ ok: boolean; error?: string }>) {
  const [on, setOn] = useState(initial);
  const [pending, start] = useTransition();
  const { notify } = useToast();
  const toggle = () => {
    const next = !on;
    setOn(next);
    start(async () => {
      const result = await save(next);
      if (!result.ok) {
        setOn(!next);
        notify({ title: "Could not save", description: result.error ?? "Please try again.", tone: "error" });
      }
    });
  };
  return { on, pending, toggle };
}

export function BookmarkButton({ devotionalId, initial }: { devotionalId: string; initial: boolean }) {
  const { on, toggle } = useToggle(initial, (next) => setBookmarkAction(devotionalId, next));
  return (
    <button type="button" aria-pressed={on} onClick={toggle} className={CHIP(on)}>
      <Icon name="bookmark" className={on ? "fill-current" : undefined} />
      {on ? "Saved" : "Save for later"}
    </button>
  );
}

export function CompleteButton({ devotionalId, initial, size = "md" }: { devotionalId: string; initial: boolean; size?: "md" | "sm" }) {
  const { on, toggle } = useToggle(initial, (next) => setCompletedAction(devotionalId, next));
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={toggle}
      className={cn(CHIP(on), size === "sm" && "min-h-10 px-3 text-sm")}
    >
      <Icon name="check" />
      {on ? "Completed" : "Mark as completed"}
    </button>
  );
}

export function ShareButton({ path, title, reference }: { path: string; title: string; reference: string }) {
  const { notify } = useToast();
  async function share() {
    const url = `${window.location.origin}${path}`;
    const text = reference ? `${title} (${reference})` : title;
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title, text, url });
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return; // person closed the share sheet
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      notify({ title: "Link copied", description: "Colleagues with an account can open it.", tone: "success" });
    } catch {
      notify({ title: "Could not copy the link", description: url, tone: "error" });
    }
  }
  return (
    <button type="button" onClick={share} className={CHIP()}>
      <Icon name="share" />
      Share
    </button>
  );
}

export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className={CHIP()}>
      <Icon name="printer" />
      Print
    </button>
  );
}

/**
 * Starts the class presentation in one click. The click itself asks the browser
 * for full screen, which carries over to the presentation page (the move between
 * pages happens inside the same browser document). If the browser says no, the
 * presentation still opens and has its own Full screen button.
 */
export function PresentLink({ href, variant = "secondary" }: { href: string; variant?: "primary" | "secondary" }) {
  return (
    <Link
      href={href}
      onClick={() => {
        try {
          if (!document.fullscreenElement) void document.documentElement.requestFullscreen?.().catch(() => undefined);
        } catch { /* not supported: the presentation page offers a button */ }
      }}
      className={cn(buttonStyles({ variant }), "min-h-11 px-4 text-base")}
    >
      <Icon name={"presentation" satisfies IconName} />
      Present to class
    </Link>
  );
}

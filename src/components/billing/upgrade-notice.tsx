import Link from "next/link";
import { cn } from "@/lib/cn";
import { Icon } from "@/components/ui/icon";

/**
 * A quiet, inline note that something is part of a paid plan. It is never a modal, never a banner
 * over devotional text, and always says what is still free. Used in place of the locked thing.
 */
export function UpgradeNotice({
  title, children, plan = "plus", feature, className,
}: {
  title: string;
  children?: React.ReactNode;
  plan?: "plus" | "school";
  feature?: string;
  className?: string;
}) {
  const href = `/upgrade?plan=${plan}${feature ? `&feature=${encodeURIComponent(feature)}` : ""}`;
  return (
    <aside className={cn("flex gap-3 rounded-control border border-line bg-surface p-4", className)} aria-label={title}>
      <Icon name="info" className="mt-0.5 shrink-0 text-brand" />
      <div className="min-w-0 text-sm leading-relaxed [overflow-wrap:anywhere]">
        <p className="font-semibold">{title}</p>
        {children ? <div className="mt-1 text-muted">{children}</div> : null}
        <p className="mt-2"><Link href={href} className="font-semibold text-brand underline-offset-4 hover:underline">See Educator Plus</Link></p>
      </div>
    </aside>
  );
}

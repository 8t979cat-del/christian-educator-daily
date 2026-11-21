import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Icon, type IconName } from "./icon";

/* ------------------------------------------------------------------ */
/* Loading indicators                                                  */
/* ------------------------------------------------------------------ */

export function Spinner({ label = "Loading", className }: { label?: string; className?: string }) {
  return (
    <span role="status" className={cn("inline-flex items-center", className)}>
      <svg
        className="size-5 animate-spin"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
        focusable="false"
      >
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
        <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      </svg>
      <span className="sr-only">{label}</span>
    </span>
  );
}

/** Placeholder block shown while content loads. Hidden from assistive tech. */
export function Skeleton({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      aria-hidden="true"
      className={cn("animate-pulse rounded-control bg-line/70", className)}
      {...props}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Empty states                                                        */
/* ------------------------------------------------------------------ */

type EmptyStateProps = {
  icon?: IconName;
  title: string;
  description: ReactNode;
  action?: ReactNode;
  className?: string;
};

export function EmptyState({ icon = "info", title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center rounded-card border border-dashed border-line-strong/50 bg-surface px-6 py-12 text-center",
        className,
      )}
    >
      <span className="mb-4 grid size-12 place-items-center rounded-control bg-brand-soft text-brand">
        <Icon name={icon} size={24} />
      </span>
      <h2 className="font-serif text-xl font-semibold">{title}</h2>
      <div className="mt-2 max-w-prose text-muted">{description}</div>
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Inline messages and badges                                          */
/* ------------------------------------------------------------------ */

type AlertTone = "info" | "success" | "error";

const ALERT_STYLES: Record<AlertTone, { box: string; icon: IconName }> = {
  info: { box: "border-line bg-surface text-ink", icon: "info" },
  success: { box: "border-brand/30 bg-brand-soft text-ink", icon: "check" },
  error: { box: "border-danger/40 bg-danger-soft text-ink", icon: "alert" },
};

export function Alert({
  tone = "info",
  title,
  children,
  className,
}: {
  tone?: AlertTone;
  title?: string;
  children?: ReactNode;
  className?: string;
}) {
  const style = ALERT_STYLES[tone];
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn("flex gap-3 rounded-control border p-4", style.box, className)}
    >
      <Icon name={style.icon} className={cn("mt-0.5 shrink-0", tone === "error" ? "text-danger" : "text-brand")} />
      <div className="min-w-0 text-sm leading-relaxed [overflow-wrap:anywhere]">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className={title ? "mt-1" : undefined}>{children}</div> : null}
      </div>
    </div>
  );
}

export function Badge({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-control bg-brand-soft px-3 py-1 text-xs font-semibold text-brand",
        className,
      )}
    >
      {children}
    </span>
  );
}

import type { ComponentProps, ElementType, ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Icon, type IconName } from "./icon";

type CardProps = ComponentProps<"div"> & {
  as?: ElementType;
  tone?: "default" | "soft" | "dark";
  padding?: "none" | "md" | "lg";
};

const TONES = {
  default: "bg-surface border-line text-ink",
  soft: "bg-brand-soft border-transparent text-ink",
  dark: "bg-night border-night-raised text-parchment on-dark",
} as const;

const PADDING = { none: "", md: "p-5", lg: "p-6 md:p-8" } as const;

export function Card({ as: Component = "div", tone = "default", padding = "md", className, ...props }: CardProps) {
  return (
    <Component
      className={cn("rounded-card border", TONES[tone], PADDING[padding], className)}
      {...props}
    />
  );
}

/** Card with an icon, a title and body copy. Used for feature lists. */
export function FeatureCard({
  icon,
  title,
  children,
}: {
  icon: IconName;
  title: string;
  children: ReactNode;
}) {
  return (
    <Card as="article" className="h-full">
      <span className="mb-4 grid size-11 place-items-center rounded-control bg-brand-soft text-brand">
        <Icon name={icon} size={22} />
      </span>
      <h3 className="font-serif text-lg font-semibold">{title}</h3>
      <p className="mt-2 text-muted">{children}</p>
    </Card>
  );
}

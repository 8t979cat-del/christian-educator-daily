import type { ComponentProps, ElementType, ReactNode } from "react";
import { cn } from "@/lib/cn";

type CardProps = ComponentProps<"div"> & {
  as?: ElementType;
  tone?: "default" | "soft" | "dark";
  padding?: "none" | "md" | "lg";
};

const TONES = {
  default: "bg-surface border-line text-ink",
  soft: "bg-brand-soft border-transparent text-ink",
  dark: "bg-brand border-brand-hover text-[#e9e3d2] on-dark",
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

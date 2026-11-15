import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Spinner } from "./feedback";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "md" | "lg";

type StyleOptions = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  className?: string;
};

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-brand text-white hover:bg-brand-hover border border-transparent",
  secondary: "bg-surface text-ink border border-line-strong/60 hover:bg-brand-soft",
  ghost: "bg-transparent text-brand border border-transparent hover:bg-brand-soft",
  danger: "bg-danger text-white border border-transparent hover:opacity-90",
};

const SIZES: Record<ButtonSize, string> = {
  md: "min-h-11 px-5 text-base",
  lg: "min-h-13 px-7 text-lg",
};

/** Shared class list so buttons and link-buttons look identical. */
export function buttonStyles({ variant = "primary", size = "md", fullWidth, className }: StyleOptions = {}) {
  return cn(
    "inline-flex items-center justify-center gap-2 rounded-control font-semibold transition-colors",
    "disabled:cursor-not-allowed disabled:opacity-60",
    VARIANTS[variant],
    SIZES[size],
    fullWidth && "w-full",
    className,
  );
}

type ButtonProps = ComponentProps<"button"> &
  StyleOptions & {
    loading?: boolean;
  };

export function Button({
  variant,
  size,
  fullWidth,
  loading,
  className,
  disabled,
  children,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonStyles({ variant, size, fullWidth, className })}
      {...props}
    >
      {loading ? <Spinner label="Working" /> : null}
      {children}
    </button>
  );
}

type ButtonLinkProps = Omit<ComponentProps<typeof Link>, "className"> &
  StyleOptions & { children: ReactNode };

/** A real link that is styled as a button. Use for navigation, not actions. */
export function ButtonLink({ variant, size, fullWidth, className, children, ...props }: ButtonLinkProps) {
  return (
    <Link className={buttonStyles({ variant, size, fullWidth, className })} {...props}>
      {children}
    </Link>
  );
}

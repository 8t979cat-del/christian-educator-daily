import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

type Level = 1 | 2 | 3 | 4;

// Literata, semibold: the workbook sets its titles in the reading serif, a little heavier than the text.
const HEADING_SIZES: Record<Level, string> = {
  1: "text-4xl md:text-5xl leading-[1.12] font-semibold tracking-[-0.01em]",
  2: "text-3xl md:text-[2.5rem] leading-[1.15] font-semibold tracking-[-0.01em]",
  3: "text-2xl leading-snug font-semibold",
  4: "text-lg leading-snug font-semibold",
};

type HeadingProps = ComponentProps<"h1"> & {
  /** Semantic level (h1 to h4). */
  level?: Level;
  /** Visual size, when it should differ from the semantic level. */
  size?: Level;
};

/** Serif heading. Choose `level` for document structure and `size` for looks. */
export function Heading({ level = 2, size, className, ...props }: HeadingProps) {
  const Tag = `h${level}` as const;
  return <Tag className={cn("font-serif text-balance", HEADING_SIZES[size ?? level], className)} {...props} />;
}

type TextProps = ComponentProps<"p"> & {
  size?: "sm" | "md" | "lg";
  muted?: boolean;
};

const TEXT_SIZES = { sm: "text-sm", md: "text-base", lg: "text-lg md:text-xl" } as const;

export function Text({ size = "md", muted, className, ...props }: TextProps) {
  return <p className={cn("text-pretty", TEXT_SIZES[size], muted && "text-muted", className)} {...props} />;
}

/** Scripture quotation in the serif face. The reference is always shown. */
export function Scripture({
  reference,
  translation,
  children,
  className,
}: {
  reference: string;
  translation: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <figure className={className}>
      <blockquote className="font-serif text-2xl leading-relaxed md:text-3xl">{children}</blockquote>
      <figcaption className="mt-3 text-sm font-semibold text-muted">
        {reference} · {translation}
      </figcaption>
    </figure>
  );
}

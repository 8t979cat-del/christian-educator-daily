import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Heading } from "@/components/ui/typography";

export function Container({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("mx-auto w-full max-w-6xl px-4 md:px-8", className)} {...props} />;
}

/** Standard title block for application pages. */
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <Heading level={1} size={2}>
          {title}
        </Heading>
        {description ? <div className="mt-2 max-w-prose text-muted">{description}</div> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-3">{actions}</div> : null}
    </header>
  );
}

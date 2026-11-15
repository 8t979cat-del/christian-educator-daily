import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { Heading } from "@/components/ui/typography";
import { cn } from "@/lib/cn";

/** Centered card used by every sign-in, sign-up and account-recovery page. */
export function AuthCard({
  title,
  description,
  children,
  footer,
  wide,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  return (
    <Card padding="lg" className={cn("mx-auto w-full", wide ? "max-w-2xl" : "max-w-md")}>
      <Heading level={1} size={3}>
        {title}
      </Heading>
      {description ? <div className="mt-2 text-muted">{description}</div> : null}
      <div className="mt-6">{children}</div>
      {footer ? <div className="mt-6 border-t border-line pt-4 text-sm text-muted">{footer}</div> : null}
    </Card>
  );
}

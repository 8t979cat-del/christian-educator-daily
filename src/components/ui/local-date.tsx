"use client";

import { useEffect, useState } from "react";

/** Shows today's date in the visitor's own time zone. Renders nothing until mounted to avoid a hydration mismatch. */
export function LocalDate({ className }: { className?: string }) {
  const [text, setText] = useState<string | null>(null);

  useEffect(() => {
    setText(new Intl.DateTimeFormat("en-US", { dateStyle: "full" }).format(new Date()));
  }, []);

  return (
    <time dateTime={new Date().toISOString().slice(0, 10)} className={className} suppressHydrationWarning>
      {text ?? " "}
    </time>
  );
}

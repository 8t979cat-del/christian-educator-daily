"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/feedback";

/** Error boundary for application pages. Keeps the navigation shell visible. */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Replace with Sentry.captureException(error) when monitoring is added.
    console.error(error);
  }, [error]);

  return (
    <EmptyState
      icon="alert"
      title="Something went wrong"
      description={
        <>
          This page could not be loaded. Try again, and if it keeps happening let us know.
          {error.digest ? <span className="mt-2 block text-sm">Reference: {error.digest}</span> : null}
        </>
      }
      action={<Button onClick={reset}>Try again</Button>}
    />
  );
}

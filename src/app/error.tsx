"use client";

import { useEffect } from "react";
import { Container } from "@/components/layout/container";
import { Button, ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/feedback";

/** Error boundary for public pages. */
export default function RootError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <Container className="py-20">
      <main id="main">
        <EmptyState
          icon="alert"
          title="Something went wrong"
          description="The page could not be displayed. You can try again or return to the home page."
          action={
            <div className="flex flex-wrap justify-center gap-3">
              <Button onClick={reset}>Try again</Button>
              <ButtonLink href="/" variant="secondary">
                Go home
              </ButtonLink>
            </div>
          }
        />
      </main>
    </Container>
  );
}

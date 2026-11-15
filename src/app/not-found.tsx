import type { Metadata } from "next";
import { Container } from "@/components/layout/container";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/feedback";

export const metadata: Metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <Container className="py-20">
      <main id="main">
        <EmptyState
          icon="search"
          title="We couldn’t find that page"
          description="The link may be out of date, or the page may not exist yet."
          action={<ButtonLink href="/">Back to home</ButtonLink>}
        />
      </main>
    </Container>
  );
}

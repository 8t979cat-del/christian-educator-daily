import type { ReactNode } from "react";
import { Container } from "@/components/layout/container";
import { Logo } from "@/components/layout/logo";

// Auth state is per-request; never prerender these routes.
export const dynamic = "force-dynamic";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh">
      <header className="border-b border-line bg-parchment">
        <Container className="flex h-16 items-center">
          <Logo />
        </Container>
      </header>
      <main id="main" className="px-4 py-10 md:py-16">
        {children}
      </main>
    </div>
  );
}

import type { Metadata } from "next";
import { PlanGrid } from "@/components/billing/plan-grid";
import { Container } from "@/components/layout/container";
import { Heading, Text } from "@/components/ui/typography";
import { getAuthUser } from "@/lib/auth/session";
import { getCatalog, getEntitlements } from "@/lib/billing/queries";
import { isBillingConfigured, isSupabaseConfigured } from "@/lib/env";

export const metadata: Metadata = {
  title: "Plans",
  description: "Free daily devotionals for every educator, Educator Plus for the full archive and tools, and a School License for faculty.",
};
export const dynamic = "force-dynamic";

export default async function PricingPage() {
  const user = isSupabaseConfigured() ? await getAuthUser() : null;
  const [catalog, entitlements] = await Promise.all([getCatalog(), user ? getEntitlements() : Promise.resolve({ plans: [] as string[], features: {} })]);

  return (
    <Container className="py-12 md:py-16">
      <header className="mb-10 max-w-2xl">
        <Heading level={1} size={2}>Plans for every educator and every school</Heading>
        <Text className="mt-3" muted>
          Daily devotionals, classroom presentation and a Scripture-centered community are free. Paid plans add depth and tools; they never decide who may pray, speak or belong.
        </Text>
      </header>
      {catalog.plans.length === 0 ? (
        <Text muted>Plans will be listed here once the service is connected.</Text>
      ) : (
        <PlanGrid catalog={catalog} signedIn={Boolean(user)} currentPlans={entitlements.plans} checkoutReady={isBillingConfigured()} />
      )}
      <section className="mt-14 max-w-2xl" aria-labelledby="privacy-promise">
        <Heading level={2} size={4} id="privacy-promise">Our promise about your spiritual life</Heading>
        <Text className="mt-2" muted>
          We never sell prayer requests, reflections or private group conversations, and we do not build advertising profiles from religious participation.
          School administrators see only combined totals, never what an individual teacher prayed, wrote or saved.
        </Text>
      </section>
    </Container>
  );
}

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthCard } from "@/components/layout/auth-card";
import { OnboardingForm } from "@/components/forms/profile-forms";
import { safeNextPath } from "@/lib/auth/redirect";
import { requireAccess } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Set up your profile" };

type Props = { searchParams: Promise<{ next?: string }> };

export default async function OnboardingPage({ searchParams }: Props) {
  const { profile } = await requireAccess({ allowIncompleteOnboarding: true });
  if (profile.onboarding_completed_at) redirect("/today");

  const params = await searchParams;
  const next = params.next ? safeNextPath(params.next, "") : "";

  return (
    <AuthCard
      wide
      title="Welcome. Tell us about your teaching"
      description="This helps us choose devotionals that fit you. You can change any of it later in settings."
    >
      <OnboardingForm profile={profile} next={next || undefined} />
    </AuthCard>
  );
}

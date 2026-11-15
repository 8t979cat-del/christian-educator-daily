import type { Metadata } from "next";
import Link from "next/link";
import { ConfigNotice } from "@/components/layout/config-notice";
import { AuthCard } from "@/components/layout/auth-card";
import { SignUpForm } from "@/components/forms/auth-forms";
import { safeNextPath } from "@/lib/auth/redirect";

export const metadata: Metadata = { title: "Create your account" };

type Props = { searchParams: Promise<{ next?: string }> };

export default async function SignUpPage({ searchParams }: Props) {
  const params = await searchParams;
  const next = params.next ? safeNextPath(params.next, "") : "";
  const signInHref = next ? `/login?next=${encodeURIComponent(next)}` : "/login";

  return (
    <AuthCard
      title="Create your account"
      description="We will email you a link to verify your address."
      footer={
        <>
          Already have an account?{" "}
          <Link href={signInHref} className="font-semibold text-brand underline">
            Sign in
          </Link>
        </>
      }
    >
      <ConfigNotice />
      <SignUpForm next={next || undefined} />
    </AuthCard>
  );
}

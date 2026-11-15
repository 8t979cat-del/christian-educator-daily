import type { Metadata } from "next";
import Link from "next/link";
import { ConfigNotice } from "@/components/layout/config-notice";
import { AuthCard } from "@/components/layout/auth-card";
import { SignInForm } from "@/components/forms/auth-forms";
import { Alert } from "@/components/ui/feedback";
import { safeNextPath } from "@/lib/auth/redirect";

export const metadata: Metadata = { title: "Sign in" };

const ERRORS: Record<string, string> = {
  link_invalid: "That link is invalid or has expired. Request a new one and try again.",
};

type Props = { searchParams: Promise<{ next?: string; error?: string }> };

export default async function LoginPage({ searchParams }: Props) {
  const params = await searchParams;
  const next = params.next ? safeNextPath(params.next, "") : "";
  const error = params.error && Object.hasOwn(ERRORS, params.error) ? ERRORS[params.error] : null;
  const signUpHref = next ? `/signup?next=${encodeURIComponent(next)}` : "/signup";

  return (
    <AuthCard
      title="Sign in"
      description="Welcome back."
      footer={
        <>
          New here?{" "}
          <Link href={signUpHref} className="font-semibold text-brand underline">
            Create an account
          </Link>
        </>
      }
    >
      <ConfigNotice />
      {error ? <Alert tone="error" className="mb-6">{error}</Alert> : null}
      <SignInForm next={next || undefined} />
    </AuthCard>
  );
}

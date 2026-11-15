import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthCard } from "@/components/layout/auth-card";
import { ConfigNotice } from "@/components/layout/config-notice";
import { ResendVerificationForm } from "@/components/forms/auth-forms";
import { getAuthUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Verify your email" };

type Props = { searchParams: Promise<{ email?: string }> };

export default async function VerifyEmailPage({ searchParams }: Props) {
  const user = await getAuthUser();
  if (user?.email_confirmed_at) redirect("/today");

  const params = await searchParams;
  const email = (params.email ?? user?.email ?? "").slice(0, 254);

  return (
    <AuthCard
      title="Check your email"
      description={
        <>
          We sent a verification link{email ? <> to <strong>{email}</strong></> : null}. Open it on this device to
          finish creating your account.
        </>
      }
      footer={
        <Link href="/login" className="font-semibold text-brand underline">
          Back to sign in
        </Link>
      }
    >
      <ConfigNotice />
      <p className="mb-6 text-sm text-muted">
        Nothing arrived? Check your spam folder, or request another link below.
      </p>
      <ResendVerificationForm email={email} />
    </AuthCard>
  );
}

import type { Metadata } from "next";
import { AuthCard } from "@/components/layout/auth-card";
import { ResetPasswordForm } from "@/components/forms/auth-forms";
import { requireUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Choose a new password" };

export default async function ResetPasswordPage() {
  // The emailed link signs the user in first. Without that session, this redirects to sign-in.
  await requireUser();
  return (
    <AuthCard title="Choose a new password" description="You are signed in through your reset link.">
      <ResetPasswordForm />
    </AuthCard>
  );
}

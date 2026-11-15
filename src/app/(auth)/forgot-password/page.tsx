import type { Metadata } from "next";
import Link from "next/link";
import { ConfigNotice } from "@/components/layout/config-notice";
import { AuthCard } from "@/components/layout/auth-card";
import { ForgotPasswordForm } from "@/components/forms/auth-forms";

export const metadata: Metadata = { title: "Reset your password" };

export default function ForgotPasswordPage() {
  return (
    <AuthCard
      title="Reset your password"
      description="Enter your email and we will send you a link to choose a new password."
      footer={
        <Link href="/login" className="font-semibold text-brand underline">
          Back to sign in
        </Link>
      }
    >
      <ConfigNotice />
      <ForgotPasswordForm />
    </AuthCard>
  );
}

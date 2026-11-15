import "server-only";
import { errorState, type FormState } from "@/lib/auth/form-state";
import { covenantStatus } from "./queries";

/**
 * The covenant must be accepted before a first community contribution. The database enforces this
 * (the insert is refused); this check only gives a friendly explanation instead of a generic refusal.
 */
export async function covenantBlock(): Promise<FormState | null> {
  const s = await covenantStatus();
  if (s.accepted || !s.required) return null;
  return errorState("Please read and accept our community covenant before you contribute. You can do that on the Community covenant page.");
}

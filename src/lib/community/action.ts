import "server-only";
import { errorState, successState, type FormState } from "@/lib/auth/form-state";
import { createClient } from "@/lib/supabase/server";
import { communityError } from "./errors";

/** Calls a database function as the signed-in user and turns the outcome into form state. */
export async function rpcState(
  name: string,
  args: Record<string, unknown>,
  successMessage: string,
  extra: { values?: FormState["values"]; fallback?: string } = {},
): Promise<FormState & { data?: unknown }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(name, args);
  if (error) return errorState(communityError(error, extra.fallback), { values: extra.values });
  return { ...successState(successMessage), data };
}

/** For the many places a person's own words are checked before they are sent. */
export function firstIssue(fieldErrors: Record<string, string> | undefined): string | undefined {
  return fieldErrors ? Object.values(fieldErrors)[0] : undefined;
}

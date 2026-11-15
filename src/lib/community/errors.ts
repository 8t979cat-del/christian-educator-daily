import type { PostgrestError } from "@supabase/supabase-js";

/**
 * Turns a database error into a message safe to show. Only messages the database
 * itself writes for people (rate limits, rule explanations) pass through; everything else
 * becomes a generic sentence so internals never leak.
 */
const PASS_THROUGH = new Set(["P0429", "P0001", "P0002", "P0402", "22023"]);

export function communityError(error: PostgrestError | null | undefined, fallback = "That could not be saved. Please try again."): string {
  if (!error) return fallback;
  if (PASS_THROUGH.has(error.code) && error.message) return error.message;
  if (error.code === "42501" || /row-level security/i.test(error.message)) {
    return "You do not have permission to do that here.";
  }
  if (error.code === "23514") return "That does not fit the allowed length or format.";
  return fallback;
}

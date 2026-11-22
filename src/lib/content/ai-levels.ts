import "server-only";
import { createHash } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { BANDS, toLevels, type GradeBand, type Levels } from "./levels";
import type { DevotionalRecord } from "./types";

/** Fingerprint of the text an AI reading level is adapted from; when it changes the level is adapted again. */
export function levelSourceHash(d: Pick<DevotionalRecord, "title" | "scripture_reference" | "reflection" | "discussion_question" | "practical_application" | "prayer">): string {
  return createHash("sha256")
    .update(JSON.stringify([d.title, d.scripture_reference, d.reflection, d.discussion_question, d.practical_application, d.prayer]))
    .digest("hex");
}

/** The shared AI-adapted reading levels of a devotional that still match its current text. */
export async function loadAiLevels(d: DevotionalRecord): Promise<Levels> {
  const { data } = await (await createClient()).from("devotional_ai_levels").select("band, content, source_hash").eq("devotional_id", d.id);
  const hash = levelSourceHash(d);
  const raw: Record<string, unknown> = {};
  for (const row of (data ?? []) as Array<{ band: string; content: unknown; source_hash: string }>) {
    if (row.source_hash === hash && (BANDS as readonly string[]).includes(row.band)) raw[row.band] = row.content;
  }
  return toLevels(raw);
}

/** Bands with neither an editor's version nor a current AI one. */
export const missingBands = (editor: Levels, ai: Levels): GradeBand[] => BANDS.filter((b) => !editor[b] && !ai[b]);

import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getCronSecret } from "@/lib/env";
import { checkSupabase } from "@/lib/supabase/health";

export const dynamic = "force-dynamic";

/**
 * Public: only whether the app can do its job ("ok" or "degraded"), which is all an uptime monitor needs.
 * With `Authorization: Bearer <CRON_SECRET>` it also says which dependency is the problem.
 */
function isOperator(header: string | null): boolean {
  const secret = getCronSecret();
  if (!secret) return false;
  const given = Buffer.from((header ?? "").replace(/^Bearer\s+/i, ""));
  const wanted = Buffer.from(secret);
  return given.length === wanted.length && timingSafeEqual(given, wanted);
}

export async function GET(request: Request) {
  const supabase = await checkSupabase();
  const healthy = supabase.status !== "unreachable";
  const body = isOperator(request.headers.get("authorization"))
    ? { status: healthy ? "ok" : "degraded", app: "christian-educator-daily", environment: process.env.APP_ENV ?? "development", supabase }
    : { status: healthy ? "ok" : "degraded" };
  return NextResponse.json(body, { status: healthy ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}

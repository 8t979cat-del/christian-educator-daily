import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getCronSecret } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Scheduled data retention. Call it daily from your scheduler with
 *   Authorization: Bearer $CRON_SECRET
 * It clears expired quoted text from closed reports and moderation records and deletes
 * expired operational logs, using the periods set on the Audit and retention page.
 * Without CRON_SECRET (or the service key) it does nothing and says so.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(header: string | null, secret: string): boolean {
  const given = Buffer.from((header ?? "").replace(/^Bearer\s+/i, ""));
  const wanted = Buffer.from(secret);
  return given.length === wanted.length && timingSafeEqual(given, wanted);
}

async function run(request: Request) {
  const secret = getCronSecret();
  if (!secret) return NextResponse.json({ error: "Not configured." }, { status: 503 });
  if (!authorized(request.headers.get("authorization"), secret)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Not configured." }, { status: 503 });
  const { data, error } = await admin.rpc("retention_run");
  if (error) return NextResponse.json({ error: "Retention failed." }, { status: 500 });
  return NextResponse.json({ ok: true, result: data });
}

export const GET = run;
export const POST = run;

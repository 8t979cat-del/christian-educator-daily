import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

/**
 * Reads for the launch and pilot screens. Every database function checks the caller's role itself;
 * a screen reached by mistake gets an empty result, never someone else's data.
 */
async function rpc<T>(name: string, args: Record<string, unknown> = {}): Promise<T[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(name, args);
  if (error) return [];
  return (Array.isArray(data) ? data : data == null ? [] : [data]) as T[];
}
async function rpcOne<T>(name: string, args: Record<string, unknown> = {}): Promise<T | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(name, args);
  return error ? null : ((data as T | null) ?? null);
}

export type ReadinessRow = { key: string; label: string; kind: "automatic" | "signoff" | "advisory"; ok: boolean; detail: string };
export type ContentReadinessRow = { key: string; label: string; blocking: boolean; ok: boolean; detail: string };
export const communityReadiness = () => rpc<ReadinessRow>("community_readiness");
export const contentReadiness = () => rpc<ContentReadinessRow>("content_readiness");

export type PilotOverviewRow = { id: string; name: string; starts_on: string; ends_on: string; status: string; schools: number; agreed: number };
export type PilotSchoolRow = {
  id: string; school_id: string | null; school_name: string; contact_name: string; stage: string; agreed_at: string | null; agreed_note: string | null;
  seat_limit: number; conversion_stage: string; notes: string; paid: boolean;
};
export type PilotCodeRow = { id: string; hint: string; label: string; grants: string; max_uses: number; uses: number; expires_at: string; revoked_at: string | null; usable: boolean };
export type FeedbackRow = {
  id: string; kind: "survey" | "bug" | "feature"; title: string; body: string; ratings: Record<string, number>; willingness: string | null; page_path: string | null;
  severity: string | null; allow_follow_up: boolean; status: string; priority: string; theme: string; admin_note: string; created_at: string; pilot_name: string | null;
};
export type PilotMetrics = Record<string, any>;
export type MyPilot = {
  pilot_id: string; pilot_name: string; starts_on: string; ends_on: string; status: string; days_left: number; school_id: string; school_name: string;
  role: string; interest: string | null; conversion_note: string;
};

export const pilotOverview = () => rpc<PilotOverviewRow>("pilot_overview");
export const pilotSchoolRows = (pilot: string) => rpc<PilotSchoolRow>("pilot_school_rows", { p_pilot: pilot });
export const pilotCodes = (pilotSchool: string) => rpc<PilotCodeRow>("pilot_list_codes", { p_pilot_school: pilotSchool });
export const pilotMetrics = (pilot: string) => rpcOne<PilotMetrics>("pilot_metrics", { p_pilot: pilot });
export const listFeedback = (kind: string | null = null, status: string | null = null) => rpc<FeedbackRow>("list_feedback", { p_kind: kind, p_status: status });
export const myPilot = cache(() => rpcOne<MyPilot>("my_pilot"));
export const schoolPilotInfo = (school: string) => rpcOne<{ pilot_name: string; ends_on: string; days_left: number; seat_limit: number; status: string }>("school_pilot_info", { p_school: school });

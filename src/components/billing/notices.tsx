import Link from "next/link";
import { Alert } from "@/components/ui/feedback";
import { noticeText } from "@/lib/billing/format";
import type { BillingNotice } from "@/lib/billing/types";

/** Plain-language notices about upcoming or recent changes to access. Shown on pages about plans, never on devotionals. */
export function BillingNotices({ notices, only }: { notices: BillingNotice[]; only?: "user" | "school" }) {
  const rows = notices
    .filter((n) => (only === "user" ? !n.school_id : only === "school" ? !!n.school_id : true))
    .map((n) => ({ n, text: noticeText(n.kind, n.school_name, n.at) }))
    .filter((r) => r.text);
  if (rows.length === 0) return null;
  return (
    <div className="mb-6 grid gap-3">
      {rows.map(({ n, text }) => (
        <Alert key={`${n.kind}-${n.school_id ?? "me"}`} tone={text!.tone === "warning" ? "error" : "info"} title={text!.title}>
          {text!.body}{" "}
          {n.school_id ? <Link href={`/school/${n.school_id}/billing`} className="font-semibold underline">School billing</Link> : <Link href="/settings/billing" className="font-semibold underline">Billing</Link>}
        </Alert>
      ))}
    </div>
  );
}

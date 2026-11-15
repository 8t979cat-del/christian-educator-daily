import { BillingNotices } from "./notices";
import { getNotices } from "@/lib/billing/queries";

/** Drops the person's billing notices at the top of a page about plans, community or schools. Never used on a devotional. */
export async function NoticesSlot({ only }: { only?: "user" | "school" }) {
  return <BillingNotices notices={await getNotices()} only={only} />;
}

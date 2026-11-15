import type { BillingInterval, PlanPrice, SubscriptionRow, SubscriptionStatus } from "./types";

export function formatMoney(amount: number | null | undefined, currency: string | null | undefined): string | null {
  if (amount == null || !currency) return null;
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() }).format(amount / 100);
  } catch {
    return null;
  }
}

export const intervalLabel = (interval: BillingInterval) => (interval === "year" ? "year" : "month");

/** "$8.00 / month", "$4.00 / seat / year", or null when no price has been configured. */
export function priceLabel(price: PlanPrice | undefined): string | null {
  if (!price || !price.active) return null;
  const money = formatMoney(price.unit_amount, price.currency);
  if (!money) return null;
  return `${money}${price.per_seat ? " / seat" : ""} / ${intervalLabel(price.plan_interval)}`;
}

/** Two-decimals-per-month figure for an annual price, only when both prices are known. */
export function annualSavingsPercent(month: PlanPrice | undefined, year: PlanPrice | undefined): number | null {
  if (!month?.active || !year?.active || !month.unit_amount || !year.unit_amount || month.currency !== year.currency) return null;
  const yearly = month.unit_amount * 12;
  const pct = Math.round(((yearly - year.unit_amount) / yearly) * 100);
  return pct > 0 ? pct : null;
}

export const STATUS_LABEL: Record<SubscriptionStatus, string> = {
  incomplete: "Awaiting payment",
  trialing: "Free trial",
  active: "Active",
  past_due: "Payment needed",
  canceled: "Canceled",
  unpaid: "Unpaid",
  incomplete_expired: "Expired",
  paused: "Paused",
};

export type SubscriptionTone = "positive" | "attention" | "neutral";

/** A plain-language summary of one subscription for status chips and the billing page. */
export function describeSubscription(sub: SubscriptionRow, now = new Date()): { label: string; tone: SubscriptionTone; detail: string } {
  const end = sub.current_period_end ? new Date(sub.current_period_end) : null;
  const date = end ? end.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : null;
  const ended = end ? end.getTime() < now.getTime() : false;
  if (sub.status === "trialing") {
    return { label: "Free trial", tone: "positive", detail: date ? `Your trial ends on ${date}. ${sub.cancel_at_period_end ? "It will not renew." : "It then renews automatically."}` : "Your trial is active." };
  }
  if (sub.status === "active") {
    if (sub.cancel_at_period_end) return { label: "Ends soon", tone: "attention", detail: date ? `Your plan will end on ${date}. You keep full access until then.` : "Your plan is set to end." };
    return { label: "Active", tone: "positive", detail: date ? `Renews on ${date}.` : "Active." };
  }
  if (sub.status === "past_due") return { label: "Payment needed", tone: "attention", detail: "We could not collect your last payment. Please update your payment method; access continues for a short time while we retry." };
  if (sub.status === "unpaid") return { label: "Unpaid", tone: "attention", detail: "Premium features are paused until payment is made." };
  if (sub.status === "canceled" || ended) return { label: "Ended", tone: "neutral", detail: date ? `Your plan ended on ${date}. Everything you saved and wrote is still yours.` : "Your plan has ended." };
  return { label: STATUS_LABEL[sub.status], tone: "neutral", detail: "" };
}

/** Wording for each notice code the database produces. */
export function noticeText(kind: string, schoolName: string | null, at: string | null): { title: string; body: string; tone: "info" | "warning" } | null {
  const when = at ? new Date(at).toLocaleDateString("en-US", { month: "long", day: "numeric" }) : null;
  const school = schoolName ?? "your school";
  switch (kind) {
    case "trial_ending":
      return { title: "Your free trial ends soon", body: when ? `Your trial ends on ${when}, and your plan will begin then.` : "Your trial is ending soon.", tone: "info" };
    case "cancels_on":
      return { title: "Your plan is set to end", body: when ? `You keep Educator Plus until ${when}. Your saved devotionals and writing stay yours either way.` : "Your plan is set to end.", tone: "info" };
    case "payment_failed":
      return { title: "We could not collect your payment", body: `Please update your payment method${when ? ` before ${when}` : ""} to keep Educator Plus.`, tone: "warning" };
    case "expired":
      return { title: "Educator Plus has ended", body: "Everything you saved and wrote is still yours. You can return to Plus whenever you like.", tone: "info" };
    case "school_no_seat":
      return { title: `No seat at ${school} yet`, body: "Your school’s license is active, but a seat has not been assigned to you. Ask a school administrator.", tone: "info" };
    case "school_seat_over_limit":
      return { title: `${school} has fewer seats than members`, body: "Your seat is outside the licensed count for now. Ask a school administrator; your own content is untouched.", tone: "warning" };
    case "school_lapsed":
      return { title: `${school}’s license has ended`, body: "School tools are paused. Your own saved devotionals, reflections and prayers are untouched.", tone: "info" };
    case "school_payment_failed":
      return { title: `Payment needed for ${school}`, body: `The latest school payment failed. Please update billing${when ? ` before ${when}` : ""} to keep faculty access.`, tone: "warning" };
    case "school_cancels_on":
      return { title: `${school}’s license is set to end`, body: when ? `Faculty keep access until ${when}.` : "The license is set to end.", tone: "info" };
    case "school_trial_ending":
      return { title: `${school}’s trial ends soon`, body: when ? `The trial ends on ${when}; the license begins then.` : "The trial is ending soon.", tone: "info" };
    case "school_out_of_seats":
      return { title: `${school} has more members than seats`, body: "Some members do not have a seat. Release a seat, or add seats in billing.", tone: "info" };
    default:
      return null;
  }
}

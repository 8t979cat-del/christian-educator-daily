export type PlanKey = "free" | "plus" | "school";
export type BillingInterval = "month" | "year";
export type SubscriptionStatus =
  | "incomplete" | "trialing" | "active" | "past_due" | "canceled" | "unpaid" | "incomplete_expired" | "paused";

export type Plan = {
  key: PlanKey;
  name: string;
  tagline: string;
  audience: "individual" | "school";
  sort: number;
  trial_days: number;
};
export type Feature = {
  key: string;
  label: string;
  description: string;
  kind: "flag" | "limit";
  scope: "user" | "school";
  sort: number;
};
export type PlanFeature = { plan_key: PlanKey; feature_key: string; enabled: boolean; limit_value: number | null };
export type PlanPrice = {
  id: string;
  plan_key: PlanKey;
  plan_interval: BillingInterval;
  currency: string | null;
  unit_amount: number | null;
  per_seat: boolean;
  active: boolean;
  display_note: string;
};
export type Catalog = { plans: Plan[]; features: Feature[]; planFeatures: PlanFeature[]; prices: PlanPrice[] };

export type Entitlements = {
  plans: string[];
  features: Record<string, { enabled: boolean; limit: number | null }>;
};

export type SubscriptionRow = {
  id: string;
  owner_type: "user" | "school";
  user_id: string | null;
  school_id: string | null;
  plan_key: PlanKey;
  plan_interval: BillingInterval;
  status: SubscriptionStatus;
  seats: number;
  current_period_start: string | null;
  current_period_end: string | null;
  trial_end: string | null;
  cancel_at_period_end: boolean;
  canceled_at: string | null;
  ended_at: string | null;
};
export type InvoiceRow = {
  stripe_invoice_id: string;
  status: string;
  amount_due: number | null;
  amount_paid: number | null;
  currency: string | null;
  hosted_invoice_url: string | null;
  created_at: string;
};
export type BillingNotice = { kind: string; school_id: string | null; school_name: string | null; at: string | null };
export type SeatRow = {
  user_id: string;
  first_name: string;
  last_name: string;
  role: string;
  has_seat: boolean;
  in_limit: boolean;
  assigned_at: string | null;
};
export type SchoolLicense = {
  plan_key: PlanKey;
  seats: number;
  status: SubscriptionStatus;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
};
export type Engagement =
  | { suppressed: true; min_group: number }
  | {
      suppressed: false;
      min_group: number;
      counted_members: number;
      devotionals_completed: number;
      members_active: number;
      assignments: { id: string; devotional_id: string; due_date: string | null; completed: number }[];
    };

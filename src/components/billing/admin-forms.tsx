"use client";

import { useActionState } from "react";
import { grantPlanAction, linkSchoolCustomerAction, revokeGrantAction, saveFeatureRowAction, savePriceAction, saveSettingAction, updatePlanAction } from "@/app/actions/billing-admin";
import { FormMessage, SubmitButton } from "@/components/forms/shared";
import { Button } from "@/components/ui/button";
import { SelectField, TextField } from "@/components/ui/form";
import { idleState } from "@/lib/auth/form-state";

const PLANS = ["free", "plus", "school"] as const;
type Cell = { enabled: boolean; limit: number | null };

export function FeatureRow({ feature, label, kind, cells }: { feature: string; label: string; kind: "flag" | "limit"; cells: Record<string, Cell> }) {
  const [state, action] = useActionState(saveFeatureRowAction, idleState);
  return (
    <form action={action} className="grid items-start gap-3 border-t border-line py-3 md:grid-cols-[1.2fr_repeat(3,1fr)_auto]">
      <input type="hidden" name="feature" value={feature} />
      <div><p className="font-medium">{label}</p><p className="text-xs text-muted">{feature}</p></div>
      {PLANS.map((plan) => (
        <fieldset key={plan} className="grid gap-1">
          <legend className="text-xs uppercase text-muted">{plan}</legend>
          <label className="flex min-h-11 items-center gap-2"><input type="checkbox" name={`${plan}_enabled`} defaultChecked={cells[plan]?.enabled} className="size-5 accent-brand" /> On</label>
          {kind === "limit" ? <input aria-label={`${label} limit for ${plan}; blank is unlimited`} name={`${plan}_limit`} type="number" min={0} placeholder="unlimited" defaultValue={cells[plan]?.limit ?? ""} className="min-h-11 w-full rounded-control border border-line-strong/60 bg-surface px-3" /> : null}
        </fieldset>
      ))}
      <div className="grid gap-1"><SubmitButton variant="secondary">Save</SubmitButton>{state.status !== "idle" ? <span role={state.status === "error" ? "alert" : "status"} className={`text-xs ${state.status === "error" ? "text-danger" : "text-muted"}`}>{state.message}</span> : null}</div>
    </form>
  );
}

export function PriceForm({ plan, interval, stripePriceId, active, note, display }: { plan: "plus" | "school"; interval: "month" | "year"; stripePriceId: string; active: boolean; note: string; display: string }) {
  const [state, action] = useActionState(savePriceAction, idleState);
  return (
    <form action={action} className="grid gap-3 rounded-control border border-line p-4">
      <input type="hidden" name="plan" value={plan} />
      <input type="hidden" name="interval" value={interval} />
      <p className="font-semibold capitalize">{plan} · {interval}ly <span className="ml-2 font-normal text-muted">{display || "no amount yet"}</span></p>
      <FormMessage state={state} />
      <TextField label="Stripe price id" name="stripePriceId" defaultValue={stripePriceId} placeholder="price_..." hint="Create the price in Stripe, then paste its id. The amount is read from Stripe, never typed here." />
      <TextField label="Note shown under the price (optional)" name="note" defaultValue={note} maxLength={120} />
      <label className="flex min-h-11 items-center gap-2"><input type="checkbox" name="active" defaultChecked={active} className="size-5 accent-brand" /> Offer this price for purchase</label>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" name="intent" value="save" variant="secondary">Save</Button>
        <Button type="submit" name="intent" value="refresh">Save and read amount from Stripe</Button>
      </div>
    </form>
  );
}

export function PlanForm({ plan, name, tagline, trialDays }: { plan: string; name: string; tagline: string; trialDays: number }) {
  const [state, action] = useActionState(updatePlanAction, idleState);
  return (
    <form action={action} className="grid gap-3 rounded-control border border-line p-4 md:grid-cols-[1fr_2fr_8rem_auto] md:items-end">
      <input type="hidden" name="plan" value={plan} />
      <TextField label="Name" name="name" defaultValue={name} required />
      <TextField label="Tagline" name="tagline" defaultValue={tagline} />
      <TextField label="Trial days" name="trialDays" type="number" min={0} max={90} defaultValue={trialDays} />
      <SubmitButton variant="secondary">Save</SubmitButton>
      <div className="md:col-span-4"><FormMessage state={state} /></div>
    </form>
  );
}

export function SettingsForm({ values }: { values: Record<string, number> }) {
  const [state, action] = useActionState(saveSettingAction, idleState);
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2"><FormMessage state={state} /></div>
      <TextField label="Grace after a failed payment (days)" name="past_due_grace_days" type="number" min={0} defaultValue={values.past_due_grace_days ?? 7} hint="Access continues this long while the payment provider retries." />
      <TextField label="Allowance after a period ends (hours)" name="period_slack_hours" type="number" min={0} defaultValue={values.period_slack_hours ?? 24} hint="Absorbs a delayed renewal notice." />
      <TextField label="Trial ending notice (days before)" name="trial_notice_days" type="number" min={0} defaultValue={values.trial_notice_days ?? 3} />
      <TextField label="Minimum people for school analytics" name="analytics_min_group" type="number" min={2} defaultValue={values.analytics_min_group ?? 5} hint="Totals are hidden below this many people so no one can be singled out." />
      <div className="sm:col-span-2"><SubmitButton>Save settings</SubmitButton></div>
    </form>
  );
}

export function GrantForm() {
  const [state, action] = useActionState(grantPlanAction, idleState);
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      <div className="sm:col-span-2"><FormMessage state={state} /></div>
      <TextField label="Person's email" name="email" type="email" required error={state.fieldErrors?.email} />
      <TextField label="Expires (optional)" name="expires" type="date" />
      <div className="sm:col-span-2"><TextField label="Reason" name="reason" required maxLength={300} error={state.fieldErrors?.reason} hint="Scholarship, pilot, support…" /></div>
      <div className="sm:col-span-2"><SubmitButton variant="secondary">Grant Educator Plus</SubmitButton></div>
    </form>
  );
}

export function RevokeButton({ id }: { id: string }) {
  const [state, action] = useActionState(revokeGrantAction, idleState);
  return (
    <form action={action} className="inline-grid gap-1"><input type="hidden" name="id" value={id} /><SubmitButton variant="ghost">Revoke</SubmitButton>{state.status === "error" ? <span role="alert" className="text-sm text-danger">{state.message}</span> : null}</form>
  );
}

/** Link a school to the Stripe customer its license is billed under (quotes and Dashboard invoices). */
export function LinkSchoolCustomerForm({ schools }: { schools: Array<{ id: string; name: string }> }) {
  const [state, action] = useActionState(linkSchoolCustomerAction, idleState);
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      <div className="sm:col-span-2"><FormMessage state={state} /></div>
      <SelectField label="School" name="schoolId" error={state.fieldErrors?.schoolId}
        options={[{ value: "", label: "Choose a school" }, ...schools.map((s) => ({ value: s.id, label: s.name }))]} />
      <TextField label="Stripe customer id" name="customerId" placeholder="cus_…" error={state.fieldErrors?.customerId} hint="Stripe Dashboard > Customers > the school > copy its id." />
      <div className="sm:col-span-2"><SubmitButton variant="secondary">Link school</SubmitButton></div>
    </form>
  );
}

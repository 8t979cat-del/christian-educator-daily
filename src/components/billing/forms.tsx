"use client";

import { useActionState } from "react";
import {
  assignSeatAction, changeIntervalAction, changeSeatsAction, openPortalAction, releaseSeatAction,
  setAggregateSharingAction, setCancellationAction, startCheckoutAction,
} from "@/app/actions/billing";
import { Button } from "@/components/ui/button";
import { CheckboxField } from "@/components/ui/choices";
import { SelectField, TextField } from "@/components/ui/form";
import { idleState } from "@/lib/auth/form-state";
import { FormMessage, SubmitButton } from "@/components/forms/shared";

type Owner = { owner: "user" } | { owner: "school"; schoolId: string };
const OwnerFields = (o: Owner) => (
  <>
    <input type="hidden" name="owner" value={o.owner} />
    {o.owner === "school" ? <input type="hidden" name="schoolId" value={o.schoolId} /> : null}
  </>
);

export type IntervalChoice = { value: "month" | "year"; label: string };

export function CheckoutForm({
  plan, owner, intervals, perSeat, trialDays, submitLabel,
}: {
  plan: "plus" | "school";
  owner: Owner;
  intervals: IntervalChoice[];
  perSeat: boolean;
  trialDays: number;
  submitLabel: string;
}) {
  const [state, action] = useActionState(startCheckoutAction, idleState);
  return (
    <form action={action} className="grid gap-5" noValidate>
      <OwnerFields {...owner} />
      <input type="hidden" name="plan" value={plan} />
      <FormMessage state={state} />
      <fieldset className="grid gap-2">
        <legend className="mb-1 font-semibold">Billing period</legend>
        {intervals.map((choice, i) => (
          <label key={choice.value} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-control border border-line bg-surface px-4 py-2 has-[:checked]:border-brand has-[:checked]:bg-brand-soft">
            <input type="radio" name="interval" value={choice.value} defaultChecked={i === 0} className="size-5 accent-brand" />
            <span>{choice.label}</span>
          </label>
        ))}
      </fieldset>
      {perSeat ? (
        <TextField label="Number of seats" name="seats" type="number" min={1} max={5000} defaultValue={10} required
          hint="One seat for each faculty or staff member. You can change this later; changes are prorated." />
      ) : null}
      {trialDays > 0 ? <p className="text-sm text-muted">Includes a {trialDays}-day free trial, once per {owner.owner === "school" ? "school" : "account"}. You can cancel before it ends.</p> : null}
      <div><SubmitButton>{submitLabel}</SubmitButton></div>
      <p className="text-sm text-muted">Payment is handled securely by Stripe; we never see your card.</p>
    </form>
  );
}

export function PortalButton({ owner, label = "Manage payment method and invoices" }: { owner: Owner; label?: string }) {
  const [state, action] = useActionState(openPortalAction, idleState);
  return (
    <form action={action} className="grid gap-3">
      <OwnerFields {...owner} />
      <FormMessage state={state} />
      <div><SubmitButton variant="secondary">{label}</SubmitButton></div>
    </form>
  );
}

export function ChangeIntervalForm({ owner, to, label }: { owner: Owner; to: "month" | "year"; label: string }) {
  const [state, action] = useActionState(changeIntervalAction, idleState);
  return (
    <form action={action} className="grid gap-3">
      <OwnerFields {...owner} />
      <input type="hidden" name="interval" value={to} />
      <FormMessage state={state} />
      <div><SubmitButton variant="secondary">{label}</SubmitButton></div>
    </form>
  );
}

export function ChangeSeatsForm({ schoolId, seats }: { schoolId: string; seats: number }) {
  const [state, action] = useActionState(changeSeatsAction, idleState);
  return (
    <form action={action} className="grid gap-4 sm:max-w-sm" noValidate>
      <OwnerFields owner="school" schoolId={schoolId} />
      <FormMessage state={state} />
      <TextField label="Licensed seats" name="seats" type="number" min={1} max={5000} defaultValue={seats} required error={state.fieldErrors?.seats}
        hint="Increasing adds seats now; reducing takes effect with proration. Members above the count keep their data but lose premium access." />
      <div><SubmitButton variant="secondary">Update seats</SubmitButton></div>
    </form>
  );
}

export function CancelForm({ owner, pendingCancel }: { owner: Owner; pendingCancel: boolean }) {
  const [state, action] = useActionState(setCancellationAction, idleState);
  return (
    <form action={action} className="grid gap-3">
      <OwnerFields {...owner} />
      <input type="hidden" name="cancel" value={pendingCancel ? "no" : "yes"} />
      <FormMessage state={state} />
      <div>
        <SubmitButton variant={pendingCancel ? "primary" : "ghost"}>
          {pendingCancel ? "Keep my plan" : "Cancel at the end of this period"}
        </SubmitButton>
      </div>
    </form>
  );
}

export function SeatButton({ kind, schoolId, userId, label }: { kind: "assign" | "release"; schoolId: string; userId: string; label: string }) {
  const [state, action] = useActionState(kind === "assign" ? assignSeatAction : releaseSeatAction, idleState);
  return (
    <form action={action} className="inline-grid gap-1">
      <input type="hidden" name="schoolId" value={schoolId} />
      <input type="hidden" name="userId" value={userId} />
      <SubmitButton variant={kind === "assign" ? "secondary" : "ghost"}>{label}</SubmitButton>
      {state.status === "error" ? <span role="alert" className="text-sm text-danger">{state.message}</span> : null}
    </form>
  );
}

export function SharingForm({ share }: { share: boolean }) {
  const [state, action] = useActionState(setAggregateSharingAction, idleState);
  return (
    <form action={action} className="grid gap-4">
      <FormMessage state={state} />
      <CheckboxField name="share" defaultChecked={share} label="Count my devotional completions in my school's totals"
        hint="School administrators see only combined totals, and only when several people are counted. They never see who completed what, or anything about prayers, reflections or notes." />
      <div><SubmitButton variant="secondary">Save</SubmitButton></div>
    </form>
  );
}

export { Button, SelectField };

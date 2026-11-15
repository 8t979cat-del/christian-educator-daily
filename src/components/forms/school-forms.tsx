"use client";

import { useActionState } from "react";
import { createInvitationAction, createSchoolAction } from "@/app/actions/school";
import { grantPlatformRoleAction } from "@/app/actions/admin";
import { SelectField, TextField } from "@/components/ui/form";
import { idleState } from "@/lib/auth/form-state";
import { FormMessage, stringValue, SubmitButton } from "./shared";

export function CreateSchoolForm() {
  const [state, action] = useActionState(createSchoolAction, idleState);
  return (
    <form action={action} className="grid max-w-md gap-5" noValidate>
      <FormMessage state={state} />
      <TextField
        label="School name"
        name="name"
        required
        defaultValue={stringValue(state, "name")}
        error={state.fieldErrors?.name}
      />
      <div>
        <SubmitButton>Create school</SubmitButton>
      </div>
    </form>
  );
}

export function InviteForm({ schoolId, canInviteAdmin }: { schoolId: string; canInviteAdmin: boolean }) {
  const [state, action] = useActionState(createInvitationAction, idleState);
  const roles = [
    { value: "faculty", label: "Faculty" },
    { value: "staff", label: "Staff" },
    ...(canInviteAdmin ? [{ value: "admin", label: "Administrator" }] : []),
  ];
  return (
    <form action={action} className="grid gap-5" noValidate>
      <input type="hidden" name="schoolId" value={schoolId} />
      <FormMessage state={state} />
      {state.output ? (
        <TextField
          label="Invitation link"
          readOnly
          value={state.output}
          onFocus={(event) => event.currentTarget.select()}
          hint="Shown once. Copy it now."
        />
      ) : null}
      <div className="grid gap-5 sm:grid-cols-[1fr_12rem]">
        <TextField
          label="Teacher's email"
          name="email"
          type="email"
          required
          defaultValue={state.status === "success" ? "" : stringValue(state, "email")}
          error={state.fieldErrors?.email}
        />
        <SelectField
          label="Role"
          name="role"
          defaultValue={stringValue(state, "role", "faculty")}
          error={state.fieldErrors?.role}
          options={roles}
        />
      </div>
      <div>
        <SubmitButton>Create invitation</SubmitButton>
      </div>
    </form>
  );
}

export function GrantRoleForm() {
  const [state, action] = useActionState(grantPlatformRoleAction, idleState);
  return (
    <form action={action} className="grid gap-5" noValidate>
      <FormMessage state={state} />
      <div className="grid gap-5 sm:grid-cols-[1fr_14rem]">
        <TextField
          label="Account email"
          name="email"
          type="email"
          required
          defaultValue={stringValue(state, "email")}
          error={state.fieldErrors?.email}
        />
        <SelectField
          label="Role"
          name="role"
          defaultValue={stringValue(state, "role", "content_editor")}
          error={state.fieldErrors?.role}
          options={[
            { value: "content_editor", label: "Content editor" },
            { value: "moderator", label: "Community moderator" },
            { value: "platform_admin", label: "Platform administrator" },
          ]}
        />
      </div>
      <div>
        <SubmitButton>Grant role</SubmitButton>
      </div>
    </form>
  );
}

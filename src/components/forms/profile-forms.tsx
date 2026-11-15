"use client";

import { useActionState } from "react";
import {
  changePasswordAction,
  completeOnboardingAction,
  deleteAccountAction,
  updateNotificationsAction,
  updateProfileAction,
  updateReminderAction,
} from "@/app/actions/account";
import { buttonStyles } from "@/components/ui/button";
import { CheckboxField, CheckboxGroup } from "@/components/ui/choices";
import { SelectField, TextField } from "@/components/ui/form";
import { idleState, type FormState } from "@/lib/auth/form-state";
import {
  EDUCATIONAL_ROLES,
  EMAIL_FREQUENCIES,
  GRADE_LEVELS,
  SUBJECTS,
  TRANSLATIONS,
} from "@/lib/auth/options";
import type { Profile } from "@/lib/auth/session";
import { REMINDER_DAYS, toHourMinute } from "@/lib/content/reminders";
import { FormMessage, listValue, NextField, stringValue, SubmitButton } from "./shared";

type ProfileDefaults = Pick<
  Profile,
  | "first_name"
  | "last_name"
  | "educational_role"
  | "grade_levels"
  | "subjects"
  | "school_affiliation"
  | "denomination"
  | "default_translation"
>;

type NotificationDefaults = Pick<
  Profile,
  "email_frequency" | "notify_assignments" | "notify_community" | "notify_product"
>;

/** Name, role, grade levels, subjects, school, denomination and translation. Shared by onboarding and settings. */
function ProfileFields({ state, defaults }: { state: FormState; defaults: ProfileDefaults }) {
  const errors = state.fieldErrors ?? {};
  return (
    <>
      <div className="grid gap-5 sm:grid-cols-2">
        <TextField
          label="First name"
          name="firstName"
          autoComplete="given-name"
          required
          defaultValue={stringValue(state, "firstName", defaults.first_name)}
          error={errors.firstName}
        />
        <TextField
          label="Last name"
          name="lastName"
          autoComplete="family-name"
          required
          defaultValue={stringValue(state, "lastName", defaults.last_name)}
          error={errors.lastName}
        />
      </div>
      <SelectField
        label="Your role"
        name="educationalRole"
        required
        defaultValue={stringValue(state, "educationalRole", defaults.educational_role ?? "")}
        error={errors.educationalRole}
        options={[{ value: "", label: "Choose your role" }, ...EDUCATIONAL_ROLES]}
      />
      <CheckboxGroup
        legend="Grade levels you serve"
        name="gradeLevels"
        options={GRADE_LEVELS}
        defaultValues={listValue(state, "gradeLevels", defaults.grade_levels)}
        error={errors.gradeLevels}
      />
      <CheckboxGroup
        legend="Subjects (optional)"
        name="subjects"
        options={SUBJECTS.map((subject) => ({ value: subject, label: subject }))}
        defaultValues={listValue(state, "subjects", defaults.subjects)}
        error={errors.subjects}
      />
      <TextField
        label="School (optional)"
        name="schoolAffiliation"
        hint="For your profile only. It does not connect you to a school; your school administrator does that by invitation."
        defaultValue={stringValue(state, "schoolAffiliation", defaults.school_affiliation ?? "")}
        error={errors.schoolAffiliation}
      />
      <TextField
        label="Denomination (optional)"
        name="denomination"
        hint="Helps us choose content that fits your tradition. You can leave this blank."
        defaultValue={stringValue(state, "denomination", defaults.denomination ?? "")}
        error={errors.denomination}
      />
      <SelectField
        label="Preferred Bible translation"
        name="defaultTranslation"
        required
        defaultValue={stringValue(state, "defaultTranslation", defaults.default_translation)}
        error={errors.defaultTranslation}
        options={TRANSLATIONS}
      />
    </>
  );
}

function NotificationFields({ state, defaults }: { state: FormState; defaults: NotificationDefaults }) {
  // After a submission the checkboxes keep what was submitted; before, the saved values.
  const submitted = state.values !== undefined;
  const checked = (key: string, saved: boolean) => (submitted ? key in (state.values ?? {}) : saved);
  return (
    <>
      <SelectField
        label="Daily devotional email"
        name="emailFrequency"
        defaultValue={stringValue(state, "emailFrequency", defaults.email_frequency)}
        error={state.fieldErrors?.emailFrequency}
        options={EMAIL_FREQUENCIES}
      />
      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-semibold">Also email me about</legend>
        <CheckboxField
          name="notifyAssignments"
          label="School assignments"
          hint="When your school assigns a devotional."
          defaultChecked={checked("notifyAssignments", defaults.notify_assignments)}
        />
        <CheckboxField
          name="notifyCommunity"
          label="Community activity"
          hint="Replies and prayer updates once community groups open."
          defaultChecked={checked("notifyCommunity", defaults.notify_community)}
        />
        <CheckboxField
          name="notifyProduct"
          label="Product news"
          hint="Occasional announcements about new features."
          defaultChecked={checked("notifyProduct", defaults.notify_product)}
        />
      </fieldset>
    </>
  );
}

export function OnboardingForm({
  profile,
  next,
}: {
  profile: ProfileDefaults & NotificationDefaults;
  next?: string;
}) {
  const [state, action] = useActionState(completeOnboardingAction, idleState);
  return (
    <form action={action} className="grid gap-6" noValidate>
      <NextField next={next} />
      <FormMessage state={state} />
      <ProfileFields state={state} defaults={profile} />
      <hr className="border-line" />
      <NotificationFields state={state} defaults={profile} />
      <SubmitButton fullWidth>Finish setup</SubmitButton>
    </form>
  );
}

export function ProfileForm({ profile }: { profile: ProfileDefaults }) {
  const [state, action] = useActionState(updateProfileAction, idleState);
  return (
    <form action={action} className="grid gap-6" noValidate>
      <FormMessage state={state} />
      <ProfileFields state={state} defaults={profile} />
      <div>
        <SubmitButton>Save profile</SubmitButton>
      </div>
    </form>
  );
}

export function NotificationsForm({ profile }: { profile: NotificationDefaults }) {
  const [state, action] = useActionState(updateNotificationsAction, idleState);
  return (
    <form action={action} className="grid gap-6" noValidate>
      <FormMessage state={state} />
      <NotificationFields state={state} defaults={profile} />
      <div>
        <SubmitButton>Save preferences</SubmitButton>
      </div>
    </form>
  );
}

export function ReminderForm({ profile }: { profile: { reminder_enabled: boolean; reminder_time: string; reminder_days: string } }) {
  const [state, action] = useActionState(updateReminderAction, idleState);
  const enabled = state.status === "success" ? state.values?.reminderEnabled === "on" : profile.reminder_enabled;
  return (
    <form action={action} className="grid max-w-xl gap-5" noValidate>
      <FormMessage state={state} />
      <CheckboxField
        name="reminderEnabled"
        label="Remind me to read each day"
        defaultChecked={state.values ? state.values.reminderEnabled === "on" : profile.reminder_enabled}
      />
      <div className="grid gap-5 sm:grid-cols-2">
        <TextField
          label="Time"
          name="reminderTime"
          type="time"
          required
          defaultValue={stringValue(state, "reminderTime", toHourMinute(profile.reminder_time))}
          error={state.fieldErrors?.reminderTime}
        />
        <SelectField
          label="Days"
          name="reminderDays"
          defaultValue={stringValue(state, "reminderDays", profile.reminder_days)}
          options={REMINDER_DAYS}
        />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton>Save reminder</SubmitButton>
        {enabled ? (
          <a href="/api/reminders/calendar" download className={buttonStyles({ variant: "secondary" })}>
            Add to my calendar
          </a>
        ) : null}
      </div>
      <p className="text-sm text-muted">
        The reminder is a repeating event in your own calendar app (Google, Apple, Outlook and others all open the
        downloaded file). It appears at this time in whatever time zone your calendar uses. Email and phone
        notifications are not available yet. If you change the time or days here, download and add the event again,
        and remove the old one.
      </p>
    </form>
  );
}

export function ChangePasswordForm() {
  const [state, action] = useActionState(changePasswordAction, idleState);
  return (
    <form action={action} className="grid max-w-md gap-5" noValidate>
      <FormMessage state={state} />
      <TextField
        label="Current password"
        name="currentPassword"
        type="password"
        autoComplete="current-password"
        required
        error={state.fieldErrors?.currentPassword}
      />
      <TextField
        label="New password"
        name="newPassword"
        type="password"
        autoComplete="new-password"
        required
        hint="At least 10 characters, with a letter and a number."
        error={state.fieldErrors?.newPassword}
      />
      <TextField
        label="Confirm new password"
        name="confirmPassword"
        type="password"
        autoComplete="new-password"
        required
        error={state.fieldErrors?.confirmPassword}
      />
      <div>
        <SubmitButton>Change password</SubmitButton>
      </div>
    </form>
  );
}

export function DeleteAccountForm() {
  const [state, action] = useActionState(deleteAccountAction, idleState);
  return (
    <form action={action} className="grid max-w-md gap-5" noValidate>
      <FormMessage state={state} />
      <TextField
        label="Your password"
        name="password"
        type="password"
        autoComplete="current-password"
        required
        error={state.fieldErrors?.password}
      />
      <TextField
        label="Type DELETE to confirm"
        name="confirmation"
        autoComplete="off"
        required
        error={state.fieldErrors?.confirmation}
      />
      <div>
        <SubmitButton variant="danger">Permanently delete my account</SubmitButton>
      </div>
    </form>
  );
}

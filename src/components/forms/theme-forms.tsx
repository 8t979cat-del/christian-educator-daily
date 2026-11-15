"use client";

import { useActionState } from "react";
import {
  createThemeAction, publishThemeAction, unscheduleThemeAction, updateThemeAction,
} from "@/app/actions/content";
import { Button } from "@/components/ui/button";
import { SelectField, TextAreaField, TextField } from "@/components/ui/form";
import { idleState } from "@/lib/auth/form-state";
import { CATEGORIES } from "@/lib/content/options";
import { FormMessage, stringValue, SubmitButton } from "./shared";

type ThemeValues = { id?: string; title?: string; summary?: string; week_start?: string; category_slug?: string | null };

export function ThemeForm({ initial }: { initial?: ThemeValues }) {
  const editing = Boolean(initial?.id);
  const [state, action] = useActionState(editing ? updateThemeAction : createThemeAction, idleState);
  const fe = state.fieldErrors ?? {};
  return (
    <form action={action} className="grid gap-5" noValidate>
      {editing ? <input type="hidden" name="id" value={initial?.id} /> : null}
      <FormMessage state={state} />
      <TextField label="Theme title" name="title" required defaultValue={stringValue(state, "title", initial?.title ?? "")} error={fe.title} maxLength={140} />
      <div className="grid gap-5 sm:grid-cols-2">
        <TextField
          label="Week starting (Monday)"
          name="weekStart"
          type="date"
          required
          defaultValue={stringValue(state, "weekStart", initial?.week_start ?? "")}
          error={fe.weekStart}
          hint="A theme covers Monday to Friday of this week."
        />
        <SelectField
          label="Main category"
          name="categorySlug"
          defaultValue={stringValue(state, "categorySlug", initial?.category_slug ?? "")}
          options={[{ value: "", label: "None" }, ...CATEGORIES.map((c) => ({ value: c.slug, label: c.name }))]}
        />
      </div>
      <TextAreaField
        label="Summary"
        name="summary"
        rows={3}
        defaultValue={stringValue(state, "summary", initial?.summary ?? "")}
        error={fe.summary}
        hint="A sentence or two introducing the week."
        maxLength={1000}
      />
      <div>
        <SubmitButton>{editing ? "Save theme" : "Create theme"}</SubmitButton>
      </div>
    </form>
  );
}

/** Publishes or unschedules the five devotionals together. The database checks that all five exist and are approved. */
export function ThemePublishPanel({
  themeId,
  ready,
  anyScheduled,
  timeZone,
}: {
  themeId: string;
  ready: boolean;
  anyScheduled: boolean;
  timeZone: string;
}) {
  const [published, publish] = useActionState(publishThemeAction, idleState);
  const [unscheduled, unschedule] = useActionState(unscheduleThemeAction, idleState);
  return (
    <div className="grid gap-4">
      <FormMessage state={published} />
      <FormMessage state={unscheduled} />
      <form action={publish}>
        <input type="hidden" name="id" value={themeId} />
        <SubmitButton>Publish the week</SubmitButton>
        <p className="mt-2 text-sm text-muted">
          {ready
            ? `Each day goes live at midnight (${timeZone}) on its own date. Days that have already started go live now.`
            : "Needs five approved devotionals, Monday to Friday."}
        </p>
      </form>
      {anyScheduled ? (
        <form action={unschedule}>
          <input type="hidden" name="id" value={themeId} />
          <Button type="submit" variant="secondary">
            Unschedule upcoming days
          </Button>
        </form>
      ) : null}
    </div>
  );
}

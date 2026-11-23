"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { draftResourceAction } from "@/app/actions/ai";
import { createResourceAction, setResourceStatusAction } from "@/app/actions/resources";
import { FormMessage, SubmitButton, stringValue } from "@/components/forms/shared";
import { SelectField, TextAreaField, TextField } from "@/components/ui/form";
import { idleState } from "@/lib/auth/form-state";
import { RESOURCE_KINDS } from "@/lib/billing/resource-text";

export type ThemeChoice = { id: string; title: string; week_start: string };
type Draft = { kind: string; title: string; summary: string; body: string; weekOf: string | null };

export function ResourceForm({ themes = [], ai }: { themes?: ThemeChoice[]; ai?: { configured: boolean } }) {
  const [state, action] = useActionState(createResourceAction, idleState);
  // The type chosen in the form, so "Draft with AI" writes the right kind.
  const [kind, setKind] = useState(stringValue(state, "kind", "educator_resource"));
  const [draft, setDraft] = useState<Draft | null>(null);
  const [nonce, setNonce] = useState(0);
  const value = (k: "title" | "summary" | "body") => draft?.[k] ?? stringValue(state, k);
  // Once saved, the form starts empty again rather than showing the AI draft a second time.
  useEffect(() => {
    if (state.status !== "success") return;
    setDraft(null);
    setNonce((n) => n + 1);
  }, [state]);
  return (
    <form action={action} className="grid gap-4" noValidate>
      <FormMessage state={state} />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField key={`kind-${nonce}`} label="Type" name="kind" defaultValue={draft?.kind ?? kind} onChange={(e) => setKind(e.currentTarget.value)}
          options={RESOURCE_KINDS.map((k) => ({ value: k.value, label: k.label }))}
          hint="The type decides which plan feature unlocks it." />
        <TextField key={`week-${nonce}`} label="Week of (optional)" name="weekOf" type="date" defaultValue={draft?.weekOf ?? ""} />
      </div>
      {ai ? (
        <ResourceAi kind={kind} themes={themes} configured={ai.configured} onDraft={(d) => { setDraft({ ...d, kind }); setNonce((n) => n + 1); }} />
      ) : null}
      <div key={`fields-${nonce}`} className="grid gap-4">
        <TextField label="Title" name="title" required maxLength={200} defaultValue={value("title")} error={state.fieldErrors?.title} />
        <TextAreaField label="Summary (shown to everyone, even when locked)" name="summary" rows={2} maxLength={600} defaultValue={value("summary")} error={state.fieldErrors?.summary} />
        <TextAreaField label="Text" name="body" rows={draft ? 18 : 10} required defaultValue={value("body")} error={state.fieldErrors?.body} hint="Separate paragraphs with a blank line." />
      </div>
      <SelectField label="Status" name="status" options={[{ value: "draft", label: "Draft" }, { value: "published", label: "Published" }]} />
      <div><SubmitButton>Save resource</SubmitButton></div>
    </form>
  );
}

export function StatusButton({ id, status, label }: { id: string; status: "draft" | "published" | "archived"; label: string }) {
  const [state, action] = useActionState(setResourceStatusAction, idleState);
  return (
    <form action={action} className="inline-grid gap-1">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={status} />
      <SubmitButton variant="ghost">{label}</SubmitButton>
      {state.status === "error" ? <span role="alert" className="text-sm text-danger">{state.message}</span> : null}
    </form>
  );
}

/** "Draft with AI" for a resource: the type chosen above, optionally a weekly theme, and a focus. Fills the fields below. */
function ResourceAi({ kind, themes, configured, onDraft }: {
  kind: string;
  themes: ThemeChoice[];
  configured: boolean;
  onDraft: (d: { title: string; summary: string; body: string; weekOf: string | null }) => void;
}) {
  const [themeId, setThemeId] = useState("");
  const [focus, setFocus] = useState("");
  const [message, setMessage] = useState<{ tone: "info" | "error"; text: string } | null>(null);
  const [pending, start] = useTransition();
  const label = RESOURCE_KINDS.find((k) => k.value === kind)?.label.toLowerCase() ?? "resource";
  const run = () => {
    setMessage({ tone: "info", text: `Writing a ${label}. This takes about half a minute.` });
    start(async () => {
      const result = await draftResourceAction({ kind, themeId, focus });
      if (!result.ok) { setMessage({ tone: "error", text: result.error }); return; }
      onDraft(result);
      setMessage({ tone: "info", text: "Draft added below. Read and edit it, then save. Nothing is published until you choose Published." });
    });
  };
  return (
    <fieldset className="grid gap-3 rounded-control border border-line bg-parchment p-4">
      <legend className="px-1 text-sm font-semibold">Draft with AI (optional)</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm">
          <span className="font-semibold">Weekly theme</span>
          <select value={themeId} onChange={(e) => setThemeId(e.target.value)} className="min-h-11 rounded-control border border-line-strong/60 bg-surface px-3">
            <option value="">None: a standalone resource</option>
            {themes.map((t) => <option key={t.id} value={t.id}>{t.title} (week of {t.week_start})</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-semibold">Focus <span className="font-normal text-muted">(optional)</span></span>
          <input value={focus} onChange={(e) => setFocus(e.target.value)} maxLength={300} placeholder="For example, grading season, or answering why God allows suffering"
            className="min-h-11 rounded-control border border-line-strong/60 bg-surface px-3" />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={run} disabled={!configured || pending}
          className="inline-flex min-h-11 items-center rounded-control border border-brand bg-brand px-4 font-semibold text-white hover:bg-brand-hover disabled:opacity-50">
          {pending ? "Writing…" : `Draft a ${label} with AI`}
        </button>
        <span className="text-sm text-muted">Uses the type chosen above. Replaces the title, summary and text below.</span>
      </div>
      {!configured ? <p className="text-sm text-muted">The AI tools are not set up on this server yet (ANTHROPIC_API_KEY).</p> : null}
      {message ? <p role={message.tone === "error" ? "alert" : "status"} className={`text-sm font-medium ${message.tone === "error" ? "text-danger" : "text-brand"}`}>{message.text}</p> : null}
    </fieldset>
  );
}

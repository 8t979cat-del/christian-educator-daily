"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import {
  createGroupAction,
  createGroupCommentAction,
  createGroupInvitationAction,
  createGroupPostAction,
  requestToJoinAction,
  updateGroupAction,
} from "@/app/actions/groups";
import { FormMessage, SubmitButton, stringValue } from "@/components/forms/shared";
import { Alert } from "@/components/ui/feedback";
import { SelectField, TextAreaField, TextField } from "@/components/ui/form";
import { GROUP_CATEGORIES, GROUP_POST_LABELS } from "@/lib/community/covenant";
import { idleState } from "@/lib/auth/form-state";
import type { GroupDetail } from "@/lib/community/types";

const PRIVACY = [
  { value: "private", label: "Private: invitation only, invisible to everyone else" },
  { value: "discoverable", label: "Discoverable: listed by name and purpose; people ask to join" },
];

/** Create or edit a group. `schools` lists schools where the person is an owner or administrator. */
export function GroupForm({ group, schools = [] }: { group?: GroupDetail; schools?: Array<{ id: string; name: string }> }) {
  const [state, action] = useActionState(group ? updateGroupAction : createGroupAction, idleState);
  return (
    <form action={action} className="grid max-w-2xl gap-5">
      {group ? <input type="hidden" name="groupId" value={group.id} /> : null}
      <TextField name="name" label="Group name" required maxLength={80} defaultValue={stringValue(state, "name", group?.name ?? "")} error={state.fieldErrors?.name} />
      <TextAreaField name="description" label="Description" hint="A sentence or two. Shown in the directory if the group is discoverable." rows={3} maxLength={500} defaultValue={stringValue(state, "description", group?.description ?? "")} error={state.fieldErrors?.description} />
      <TextAreaField name="purpose" label="Purpose" hint="What this group is for, for example “Weekly staff Bible study on Wednesday mornings.”" rows={3} maxLength={500} defaultValue={stringValue(state, "purpose", group?.purpose ?? "")} error={state.fieldErrors?.purpose} />
      <TextAreaField name="guidelines" label="Group guidelines" hint="Shown to everyone in the group, alongside the community covenant." rows={5} maxLength={3000} defaultValue={stringValue(state, "guidelines", group?.guidelines ?? "")} error={state.fieldErrors?.guidelines} />
      <SelectField name="category" label="Kind of group" options={GROUP_CATEGORIES} defaultValue={stringValue(state, "category", group?.category ?? "other")} />
      <SelectField name="privacy" label="Privacy" options={PRIVACY} defaultValue={stringValue(state, "privacy", group?.privacy ?? "private")} hint="Either way, posts, prayers and the member list are visible to members only." />
      {!group && schools.length > 0 ? (
        <SelectField
          name="schoolId"
          label="Connect to a school (optional)"
          hint="A school group admits only members of that school."
          options={[{ value: "", label: "Not connected to a school" }, ...schools.map((s) => ({ value: s.id, label: s.name }))]}
          defaultValue={stringValue(state, "schoolId", "")}
        />
      ) : null}
      <FormMessage state={state} />
      <div><SubmitButton>{group ? "Save changes" : "Create group"}</SubmitButton></div>
    </form>
  );
}

export function RequestToJoinForm({ groupId }: { groupId: string }) {
  const [state, action] = useActionState(requestToJoinAction, idleState);
  if (state.status === "success") return <Alert tone="success">{state.message}</Alert>;
  return (
    <form action={action} className="grid gap-3">
      <input type="hidden" name="groupId" value={groupId} />
      <TextAreaField name="message" label="A short note to the group's leaders (optional)" rows={2} maxLength={300} />
      <FormMessage state={state} />
      <div><SubmitButton>Ask to join</SubmitButton></div>
    </form>
  );
}

export function InviteForm({ groupId, canInviteModerators }: { groupId: string; canInviteModerators: boolean }) {
  const [state, action] = useActionState(createGroupInvitationAction, idleState);
  return (
    <form action={action} className="grid max-w-lg gap-3">
      <input type="hidden" name="groupId" value={groupId} />
      <TextField name="email" type="email" label="Email address" required autoComplete="off" error={state.fieldErrors?.email} defaultValue={stringValue(state, "email")} />
      {canInviteModerators ? (
        <SelectField name="role" label="Role" options={[{ value: "member", label: "Member" }, { value: "moderator", label: "Moderator" }]} defaultValue="member" />
      ) : <input type="hidden" name="role" value="member" />}
      <FormMessage state={state} />
      {state.output ? (
        <div className="grid gap-1">
          <label htmlFor="invite-link" className="text-sm font-semibold">Invitation link</label>
          <input id="invite-link" readOnly value={state.output} onFocus={(e) => e.currentTarget.select()} className="min-h-11 w-full rounded-control border border-line-strong/60 bg-canvas px-3 text-sm" />
        </div>
      ) : null}
      <div><SubmitButton>Create invitation</SubmitButton></div>
    </form>
  );
}

export function PostComposer({ groupId }: { groupId: string }) {
  const [state, action] = useActionState(createGroupPostAction, idleState);
  const [kind, setKind] = useState("post");
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.status === "success") ref.current?.reset();
  }, [state]);
  return (
    <form ref={ref} action={action} className="grid gap-4 rounded-card border border-line bg-surface p-5" aria-labelledby="gp-title">
      <h3 id="gp-title" className="font-serif text-xl font-semibold">Share with the group</h3>
      <input type="hidden" name="groupId" value={groupId} />
      <SelectField name="kind" label="Type" value={kind} onChange={(e) => setKind(e.currentTarget.value)} options={Object.entries(GROUP_POST_LABELS).map(([value, label]) => ({ value, label }))} />
      <TextField name="title" label="Title (optional)" maxLength={120} />
      <TextAreaField name="body" label={kind === "prayer" ? "Prayer request" : kind === "question" ? "Your question" : "What would you like to share?"} rows={5} maxLength={5000} required error={state.fieldErrors?.body} defaultValue={stringValue(state, "body")} />
      <TextField name="scriptureReference" label="Scripture (optional)" hint="For example, Colossians 3:23" maxLength={120} />
      <p className="text-sm text-muted">This stays inside the group. Please still keep students unnamed and unidentifiable.</p>
      {state.status === "success" ? <Alert tone="success">{state.message}</Alert> : <FormMessage state={state} />}
      <div><SubmitButton>{kind === "prayer" ? "Share this request" : "Post"}</SubmitButton></div>
    </form>
  );
}

export function CommentForm({ groupId, postId, parentId, onDone }: { groupId: string; postId: string; parentId?: string; onDone?: () => void }) {
  const [state, action] = useActionState(createGroupCommentAction, idleState);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.status === "success") {
      ref.current?.reset();
      onDone?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
  return (
    <form ref={ref} action={action} className="grid gap-2">
      <input type="hidden" name="groupId" value={groupId} />
      <input type="hidden" name="postId" value={postId} />
      {parentId ? <input type="hidden" name="parentId" value={parentId} /> : null}
      <TextAreaField name="body" label={parentId ? "Reply" : "Add a comment"} rows={3} maxLength={3000} required error={state.fieldErrors?.body} />
      <FormMessage state={state.status === "success" ? idleState : state} />
      <div><SubmitButton>{parentId ? "Reply" : "Comment"}</SubmitButton></div>
    </form>
  );
}

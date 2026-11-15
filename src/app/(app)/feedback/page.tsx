import type { Metadata } from "next";
import { ActionForm } from "@/components/forms/action-form";
import { SelectField, TextAreaField, TextField } from "@/components/ui/form";
import { PageHeader } from "@/components/layout/container";
import { Card } from "@/components/ui/card";
import { Heading, Text } from "@/components/ui/typography";
import { submitFeedbackAction } from "@/app/actions/launch";
import { requireAccess } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Feedback" };
export const dynamic = "force-dynamic";

const QUESTIONS: Array<[string, string]> = [
  ["ease_of_use", "It was easy to find and use what I needed."],
  ["classroom_presentation", "Classroom presentation mode worked well for my room."],
  ["devotional_quality", "The devotionals were good enough to use as written."],
  ["time_saved", "It saved me time in preparing."],
  ["community_usefulness", "The discussions were useful to me."],
  ["prayer_interactions", "Praying with others here felt appropriate and welcome."],
  ["group_participation", "The private groups were useful to me."],
];
const SCALE = [{ value: "", label: "Skip" }, { value: "1", label: "1 · Strongly disagree" }, { value: "2", label: "2" }, { value: "3", label: "3 · Neutral" }, { value: "4", label: "4" }, { value: "5", label: "5 · Strongly agree" }];

export default async function FeedbackPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  await requireAccess();
  const sp = await searchParams;
  const page = sp.page && /^\/[A-Za-z0-9/_\-\[\]]*$/.test(sp.page) ? sp.page.slice(0, 200) : "";
  return (
    <>
      <PageHeader title="Feedback" description="Short, private, and read by a person. Please do not include student names or anything private about another person." />
      <div className="grid gap-6">
        <Card>
          <Heading level={2} size={3}>Something is not working</Heading>
          <ActionForm action={submitFeedbackAction} submit="Send report" className="mt-3 grid max-w-xl gap-3">
            <input type="hidden" name="kind" value="bug" />
            <input type="hidden" name="page" value={page} />
            <TextField label="In a few words, what happened?" name="title" required minLength={3} maxLength={120} />
            <TextAreaField label="What did you expect, and what did you see instead?" name="body" rows={4} required minLength={10} maxLength={2000} />
            <SelectField label="How much did it get in the way?" name="severity" defaultValue="annoying" options={[{ value: "blocking", label: "I could not continue" }, { value: "annoying", label: "It was annoying" }, { value: "minor", label: "Minor" }]} />
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="follow_up" /> You may contact me about this</label>
            {page ? <Text size="sm" muted>We will note the page you were on ({page}). Nothing else about it is sent.</Text> : null}
          </ActionForm>
        </Card>

        <Card>
          <Heading level={2} size={3}>An idea for the platform</Heading>
          <ActionForm action={submitFeedbackAction} submit="Send idea" className="mt-3 grid max-w-xl gap-3">
            <input type="hidden" name="kind" value="feature" />
            <TextField label="Your idea in a few words" name="title" required minLength={3} maxLength={120} />
            <TextAreaField label="How would it help your teaching?" name="body" rows={4} required minLength={10} maxLength={2000} />
          </ActionForm>
        </Card>

        <Card>
          <Heading level={2} size={3}>Pilot survey (about three minutes)</Heading>
          <Text size="sm" muted>Answer what you can; skip the rest.</Text>
          <ActionForm action={submitFeedbackAction} submit="Send survey" className="mt-3 grid max-w-xl gap-3">
            <input type="hidden" name="kind" value="survey" />
            <input type="hidden" name="title" value="Pilot survey" />
            {QUESTIONS.map(([k, label]) => <SelectField key={k} label={label} name={`r_${k}`} options={SCALE} defaultValue="" />)}
            <SelectField label="Would your school pay for something like this?" name="willingness" defaultValue="" options={[{ value: "", label: "Skip" }, { value: "yes", label: "Yes" }, { value: "maybe", label: "Maybe" }, { value: "no", label: "No" }, { value: "unsure", label: "Not sure" }]} />
            <TextAreaField label="What is the one thing we should change first?" name="body" rows={3} maxLength={2000} />
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="follow_up" /> You may contact me to hear more</label>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}

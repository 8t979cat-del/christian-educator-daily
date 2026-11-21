import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminNav } from "@/components/content/admin-nav";
import { ActionForm } from "@/components/forms/action-form";
import { SelectField, TextField, TextAreaField } from "@/components/ui/form";
import { PageHeader } from "@/components/layout/container";
import { Card } from "@/components/ui/card";
import { Alert, Badge } from "@/components/ui/feedback";
import { Heading, Text } from "@/components/ui/typography";
import {
  addPilotSchoolAction, createCodeAction, createPilotSchoolAction, revokeCodeAction, setConversionAction, setPilotStatusAction, setSchoolSeatsAction, setSchoolStageAction,
} from "@/app/actions/launch";
import { requirePlatformRole } from "@/lib/auth/session";
import { pilotCodes, pilotMetrics, pilotOverview, pilotSchoolRows, type PilotSchoolRow } from "@/lib/launch/queries";

export const metadata: Metadata = { title: "Pilot" };
export const dynamic = "force-dynamic";

const Stat = ({ label, value, note }: { label: string; value: unknown; note?: string }) => (
  <div className="rounded-control border border-line p-4">
    <dt className="text-sm text-muted">{label}</dt>
    <dd className="mt-1 font-serif text-3xl font-normal">{value === undefined || value === null ? "—" : String(value)}</dd>
    {note ? <p className="mt-1 text-xs text-muted">{note}</p> : null}
  </div>
);
const Counts = ({ data }: { data?: Record<string, number> }) => {
  const e = Object.entries(data ?? {});
  return e.length === 0 ? <Text size="sm" muted>None yet.</Text> : <ul className="grid gap-1 text-sm">{e.map(([k, v]) => <li key={k} className="flex justify-between gap-4"><span>{k.replaceAll("_", " ")}</span><strong>{v}</strong></li>)}</ul>;
};

async function School({ s }: { s: PilotSchoolRow }) {
  const codes = s.school_id ? await pilotCodes(s.id) : [];
  const agreed = ["agreed", "active", "completed"].includes(s.stage);
  return (
    <Card>
      <Heading level={3} size={4}>{s.school_name} <Badge>{s.stage}</Badge></Heading>
      <Text size="sm" muted>{s.contact_name ? `Contact: ${s.contact_name}. ` : ""}{s.agreed_note ? `Agreement: ${s.agreed_note}` : "No agreement recorded."}</Text>
      <div className="mt-3 grid gap-4 md:grid-cols-2">
        <ActionForm action={setSchoolStageAction} submit="Update stage" variant="secondary">
          <input type="hidden" name="ps" value={s.id} />
          <SelectField label="Stage" name="stage" defaultValue={s.stage === "active" ? "agreed" : s.stage}
            options={["prospect", "invited", "agreed", "declined", "completed"].map((v) => ({ value: v, label: v }))} />
          <TextAreaField label="How did they agree? (required for “agreed”)" name="note" rows={2} maxLength={600} />
        </ActionForm>
        <div className="grid gap-4">
          <ActionForm action={setConversionAction} submit="Update conversion" variant="secondary">
            <input type="hidden" name="ps" value={s.id} />
            <SelectField label="Subscription conversion" name="stage" defaultValue={s.conversion_stage}
              options={["none", "interested", "proposal_sent", "converted", "declined"].map((v) => ({ value: v, label: v.replaceAll("_", " ") }))} />
            <TextField label="Note" name="note" maxLength={600} />
          </ActionForm>
          <Text size="sm" muted>Paid: {s.paid ? "yes" : "no"}. Seats: {s.seat_limit}.</Text>
        </div>
      </div>
      {agreed && !s.school_id ? (
        <div className="mt-3"><ActionForm action={createPilotSchoolAction} submit="Create the school account"><input type="hidden" name="ps" value={s.id} /></ActionForm></div>
      ) : null}
      {agreed ? (
        <div className="mt-3">
          <ActionForm action={setSchoolSeatsAction} submit="Set seats" variant="secondary" className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="ps" value={s.id} />
            <TextField label="Seat limit" name="seats" type="number" min={1} max={500} defaultValue={s.seat_limit} />
          </ActionForm>
        </div>
      ) : null}
      {s.school_id ? (
        <div className="mt-4 grid gap-3">
          <Heading level={4} size={4}>Access codes</Heading>
          {codes.length === 0 ? <Text size="sm" muted>No codes yet.</Text> : (
            <ul className="text-sm">
              {codes.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center gap-3 border-b border-line py-2 last:border-0">
                  <span className="font-mono">…{c.hint}</span><span>{c.grants}</span><span>{c.uses}/{c.max_uses} used</span>
                  <span className="text-muted">{c.revoked_at ? "revoked" : c.usable ? `expires ${c.expires_at.slice(0, 10)}` : "not usable"}</span>
                  <span className="text-muted">{c.label}</span>
                  {c.usable ? <ActionForm action={revokeCodeAction} submit="Revoke" variant="danger" className="inline"><input type="hidden" name="code" value={c.id} /></ActionForm> : null}
                </li>
              ))}
            </ul>
          )}
          <ActionForm action={createCodeAction} submit="Create code">
            <input type="hidden" name="ps" value={s.id} />
            <SelectField label="Gives" name="grants" options={[{ value: "faculty", label: "Faculty seat (many people)" }, { value: "owner", label: "School owner (one person)" }]} />
            <TextField label="Maximum uses" name="uses" type="number" min={1} max={500} defaultValue={10} hint="An owner code is always single-use." />
            <TextField label="Valid for (days)" name="days" type="number" min={1} max={366} defaultValue={30} hint="Cannot go past the pilot's end date." />
            <TextField label="Label" name="label" maxLength={80} />
          </ActionForm>
        </div>
      ) : null}
    </Card>
  );
}

export default async function PilotPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePlatformRole(["platform_admin"]);
  const { id } = await params;
  const pilot = (await pilotOverview()).find((p) => p.id === id);
  if (!pilot) notFound();
  const [schools, m] = await Promise.all([pilotSchoolRows(id), pilotMetrics(id)]);

  return (
    <>
      <PageHeader title={pilot.name} description={`${pilot.starts_on} to ${pilot.ends_on}. Status: ${pilot.status}.`} />
      <AdminNav current="/admin/pilot" />
      <p className="mb-4 text-sm"><Link className="underline" href="/admin/pilot">All pilots</Link></p>
      <div className="grid gap-6">
        <Card>
          <Heading level={2} size={3}>Status</Heading>
          <Text size="sm" muted>Schools get pilot access only while the pilot is active and today is inside its dates. Access ends on its own at the end date.</Text>
          <ActionForm action={setPilotStatusAction} submit="Update" variant="secondary" className="mt-3 flex flex-wrap items-end gap-3">
            <input type="hidden" name="pilot" value={id} />
            <SelectField label="Status" name="status" defaultValue={pilot.status} options={["planning", "active", "closed"].map((v) => ({ value: v, label: v }))} />
          </ActionForm>
        </Card>

        <section aria-labelledby="schools"><Heading level={2} size={3} id="schools">Schools</Heading></section>
        {schools.map((s) => <School key={s.id} s={s} />)}
        <Card>
          <Heading level={3} size={4}>Add a prospective school</Heading>
          <ActionForm action={addPilotSchoolAction} submit="Add as prospect">
            <input type="hidden" name="pilot" value={id} />
            <TextField label="School name" name="name" required maxLength={120} />
            <TextField label="Contact person" name="contact" maxLength={120} />
          </ActionForm>
        </Card>

        <Card>
          <Heading level={2} size={3}>Pilot dashboard</Heading>
          <Text size="sm" muted>Totals only. Nothing here names a person, scores anyone or shows a private prayer or group message. Figures about people appear only once at least {m?.minimum_group ?? 5} educators are enrolled.</Text>
          {!m ? <Alert tone="info" className="mt-3">Metrics could not be read.</Alert> : (
            <>
              {m.suppressed ? <Alert tone="info" className="mt-3">Fewer than {m.minimum_group} educators are enrolled, so people-level figures are hidden to protect privacy.</Alert> : null}
              <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <Stat label="Invited by email" value={m.invited_by_email} />
                <Stat label="Access codes issued" value={m.codes?.issued} />
                <Stat label="Code redemptions" value={m.codes?.redemptions} />
                <Stat label="Enrolled educators" value={m.enrolled_educators} />
                <Stat label="Activated educators" value={m.activated_educators} note="Finished profile setup." />
                <Stat label="Active in the last 7 days" value={m.weekly_active_educators} />
                <Stat label="Devotional sessions" value={m.devotional_sessions} />
                <Stat label="Classroom presentation opens" value={m.presentation_opens} />
                <Stat label="Replies" value={m.replies} />
                <Stat label="Prayers acknowledged" value={m.prayer_acknowledgements_given} />
                <Stat label="Group posts" value={m.group_participation?.posts} />
                <Stat label="Group comments" value={m.group_participation?.comments} />
                <Stat label="Educators in a group" value={m.group_participation?.educators_in_a_group} />
                <Stat label="Moderation reports about pilot content" value={m.moderation_reports?.about_pilot_content} note={m.moderation_reports ? `${m.moderation_reports.still_open} still open` : undefined} />
                <Stat label="Schools on a paid plan" value={m.paid?.schools} />
                <Stat label="Educators on their own paid plan" value={m.paid?.educators_on_own_plan} />
              </dl>
              <div className="mt-4 grid gap-6 md:grid-cols-3">
                <div><Heading level={3} size={4}>Public contributions by type</Heading><Counts data={m.contributions_by_kind} /><Text size="sm" muted>Private prayers are not counted.</Text></div>
                <div><Heading level={3} size={4}>Subscription interest</Heading><Counts data={m.interest} /></div>
                <div><Heading level={3} size={4}>Schools by conversion</Heading><Counts data={m.schools?.by_conversion} /></div>
              </div>
              <div className="mt-4">
                <Heading level={3} size={4}>Feedback</Heading>
                <Text size="sm">{m.feedback?.survey_responses ?? 0} survey response(s), {m.feedback?.open_bugs ?? 0} open bug(s). <Link className="underline" href="/admin/feedback">Review feedback</Link></Text>
                {m.feedback?.survey_averages ? <Counts data={m.feedback.survey_averages} /> : <Text size="sm" muted>Survey averages appear once enough people have answered.</Text>}
              </div>
            </>
          )}
        </Card>
      </div>
    </>
  );
}

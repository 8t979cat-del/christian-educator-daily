import { removeMemberAction, updateMemberRoleAction } from "@/app/actions/school";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/feedback";
import { canChangeMemberRole, canRemoveMember, SCHOOL_ROLE_LABELS, type SchoolRole } from "@/lib/auth/roles";

type Member = { user_id: string; first_name: string; last_name: string; role: SchoolRole; status: string };

const ALL_ROLES: SchoolRole[] = ["owner", "admin", "faculty", "staff"];

/** One person in the roster. Controls appear only when the viewer is allowed to use them (the database enforces it either way). */
export function MemberRow({
  member,
  schoolId,
  viewerId,
  viewerRole,
}: {
  member: Member;
  schoolId: string;
  viewerId: string;
  viewerRole: SchoolRole;
}) {
  const isSelf = member.user_id === viewerId;
  const name = `${member.first_name} ${member.last_name}`.trim() || "Unnamed member";
  const roleOptions = ALL_ROLES.filter((role) => canChangeMemberRole(viewerRole, member.role, role));
  const canEdit = !isSelf && roleOptions.length > 0;
  const canRemove = !isSelf && canRemoveMember(viewerRole, member.role);
  const selectId = `role-${member.user_id}`;

  return (
    <li className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="font-semibold">
          {name} {isSelf ? <span className="font-normal text-muted">(you)</span> : null}
        </p>
        <Badge className="mt-1">{SCHOOL_ROLE_LABELS[member.role]}</Badge>
      </div>

      {canEdit || canRemove ? (
        <div className="flex flex-wrap items-center gap-2">
          {canEdit ? (
            <form action={updateMemberRoleAction} className="flex items-center gap-2">
              <input type="hidden" name="schoolId" value={schoolId} />
              <input type="hidden" name="userId" value={member.user_id} />
              <label htmlFor={selectId} className="sr-only">
                Role for {name}
              </label>
              <select
                id={selectId}
                name="role"
                defaultValue={member.role}
                className="min-h-11 rounded-control border border-line-strong/60 bg-surface px-3"
              >
                {roleOptions.map((role) => (
                  <option key={role} value={role}>
                    {SCHOOL_ROLE_LABELS[role]}
                  </option>
                ))}
              </select>
              <Button type="submit" variant="secondary">
                Update
              </Button>
            </form>
          ) : null}
          {canRemove ? (
            <form action={removeMemberAction}>
              <input type="hidden" name="schoolId" value={schoolId} />
              <input type="hidden" name="userId" value={member.user_id} />
              <Button type="submit" variant="ghost" aria-label={`Remove ${name} from the school`}>
                Remove
              </Button>
            </form>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

/**
 * Page-level messages shown after a redirect. Only these fixed codes are ever
 * rendered; arbitrary text from the URL is never displayed.
 */
export type Notice = { tone: "info" | "success" | "error"; text: string };

export const NOTICES: Record<string, Notice> = {
  school_created: { tone: "success", text: "Your school has been created. You are its owner." },
  joined: { tone: "success", text: "You have joined the school." },
  left: { tone: "success", text: "You have left the school." },
  school_deleted: { tone: "success", text: "The school was deleted." },
  member_updated: { tone: "success", text: "The member's role was updated." },
  member_removed: { tone: "success", text: "The member was removed." },
  invitation_revoked: { tone: "success", text: "The invitation was cancelled." },
  role_granted: { tone: "success", text: "The role was granted." },
  role_revoked: { tone: "success", text: "The role was removed." },
  devotional_created: { tone: "success", text: "Draft created. Nothing has been published." },
  devotional_deleted: { tone: "success", text: "The draft was deleted." },
  cannot_delete: { tone: "error", text: "Only drafts can be deleted. Archive anything that has been published." },
  theme_created: { tone: "success", text: "Theme created. Add five devotionals, one for each weekday." },
  theme_deleted: { tone: "success", text: "The theme was deleted." },
  cannot_delete_theme: { tone: "error", text: "A theme can be deleted only while it has no devotionals and has not been published." },
  not_allowed: { tone: "error", text: "You do not have permission to do that." },
  last_owner: {
    tone: "error",
    text: "A school must keep at least one owner. Make someone else an owner first.",
  },
  group_failed: { tone: "error", text: "That could not be done. Please try again." },
  failed: { tone: "error", text: "That change could not be saved. Please try again." },
  last_admin: { tone: "error", text: "The last platform administrator cannot be removed." },
};

export function noticeFor(code: string | string[] | undefined): Notice | null {
  const key = Array.isArray(code) ? code[0] : code;
  return key && Object.hasOwn(NOTICES, key) ? (NOTICES[key] ?? null) : null;
}

/** The launch switches, in the order they are shown. Kept out of the "use server" file, which may export only async functions. */
export const COMMUNITY_FLAGS = [
  "public_discussions_enabled", "prayer_contributions_enabled", "prayer_acknowledgements_enabled",
  "groups_enabled", "group_creation_enabled", "group_posting_enabled", "group_invitations_enabled",
] as const;
export const OTHER_FLAGS = ["school_administration_enabled", "paid_subscriptions_enabled"] as const;

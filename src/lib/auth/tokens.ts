import "server-only";
import { createHash, randomBytes } from "node:crypto";

/** 256 bits of randomness, URL-safe. Only the hash is stored; the token goes in the invitation link. */
export function generateInviteToken(): string {
  return randomBytes(32).toString("base64url");
}

/** sha256 hex digest, matching the database's accept_invitation() lookup. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

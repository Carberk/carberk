import { SetMetadata } from "@nestjs/common";

export const ALLOWS_PENDING_DELETION_KEY = "allowsPendingDeletion";

/**
 * Marks a route that a session of a User with a scheduled deletion may still
 * call: restoring the account and signing out.
 */
export const AllowPendingDeletion = () =>
  SetMetadata(ALLOWS_PENDING_DELETION_KEY, true);

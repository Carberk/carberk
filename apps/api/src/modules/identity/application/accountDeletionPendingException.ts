import { ForbiddenException } from "@nestjs/common";
import { AuthSchemas } from "@auto-tm/contracts";

/**
 * The 403 for a marketplace change attempted while the User's deletion is
 * scheduled (ADR-0032). HTTP and realtime entry points both throw this one
 * answer, so clients see the same `details.reason` on either transport.
 */
export function accountDeletionPendingException(): ForbiddenException {
  return new ForbiddenException({
    code: "FORBIDDEN",
    message:
      "Your account is scheduled for deletion. Restore it to make changes.",
    details: { reason: AuthSchemas.ACCOUNT_DELETION_PENDING_REASON },
  });
}

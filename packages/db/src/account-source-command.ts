import type { Prisma } from "../generated/prisma/client/client";

import type { DiagnosticSourceCommand, DiagnosticSourceTuple } from "./diagnostic-source-command";

export type AccountSourceInput =
  | { readonly operation: "account_schedule"; readonly userId: string; readonly deletionScheduledAt: Date }
  | { readonly operation: "account_restore"; readonly userId: string };

/** Unlocked discovery only. SQL owns the protected projection, timestamp
 * normalization and transaction-specific audit identities. Preparation must
 * immediately follow, before any resource lock or mutation. */
export async function accountSourceCommand(tx: Prisma.TransactionClient, input: AccountSourceInput): Promise<{
  command: DiagnosticSourceCommand; membershipAuditId: string; staffAuditId: string; timestamp: Date;
}> {
  const deletionScheduledAt = input.operation === "account_schedule" ? input.deletionScheduledAt : null;
  const [row] = await tx.$queryRaw<{
    source: DiagnosticSourceTuple | null;
    next: DiagnosticSourceTuple;
    membershipAuditId: string;
    staffAuditId: string;
    timestamp: Date;
  }[]>`
    WITH target AS (
      SELECT public.diagnostic_source_project(
        public.diagnostic_source_read('users',jsonb_build_object('id',${input.userId}::text)),
        public.diagnostic_source_meta('users')->'fields') AS source
    )
    SELECT source,
      public.diagnostic_source_normalize('users',source || jsonb_build_object('deletionScheduledAt',${deletionScheduledAt}::timestamp(3))) AS next,
      public.diagnostic_source_account_audit_id(${input.userId}::text,'membership') AS "membershipAuditId",
      public.diagnostic_source_account_audit_id(${input.userId}::text,'staff') AS "staffAuditId",
      public.diagnostic_source_staff_revocation_timestamp(transaction_timestamp()) AS timestamp
    FROM target
  `;
  if (!row?.source) throw new Error("User not found");
  const command: DiagnosticSourceCommand = {
    operation: input.operation,
    roots: [{ table: "users", key: { id: input.userId } }],
    rows: [{ table: "users", key: { id: input.userId }, verb: "update", expected: { source: row.source }, next: row.next }],
    actorUserId: input.userId, sessionId: null, cutoff: null, campaign: null,
  };
  return { command, membershipAuditId: row.membershipAuditId, staffAuditId: row.staffAuditId, timestamp: row.timestamp };
}

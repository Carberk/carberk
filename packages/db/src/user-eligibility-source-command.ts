import type { Prisma } from "../generated/prisma/client/client";

import type { DiagnosticSourceCommand, DiagnosticSourceTuple } from "./diagnostic-source-command";

export interface UserEligibilitySourceInput {
 readonly userId: string; readonly actorUserId: string;
 readonly suspendedAt: Date | null; readonly reason: string | null;
 readonly intent?: { auditId: string; reason: string; report?: { id: string; reviewedAt: string } };
}

/** The existing finite moderation operation; all Session/FK/audit/report effects
 * are derived by SQL from persisted rows and the exact outer-operation intent. */
export async function userEligibilitySourceCommand(tx: Prisma.TransactionClient, input: UserEligibilitySourceInput): Promise<DiagnosticSourceCommand> {
 const changes = { suspendedAt: input.suspendedAt?.toISOString() ?? null, suspendedById: input.suspendedAt ? input.actorUserId : null, suspensionReason: input.suspendedAt ? input.reason : null };
 const [row] = await tx.$queryRaw<{ source: DiagnosticSourceTuple | null; next: DiagnosticSourceTuple }[]>`
  WITH target AS (SELECT public.diagnostic_source_project(
   public.diagnostic_source_read('users',jsonb_build_object('id',${input.userId}::text)),
   public.diagnostic_source_meta('users')->'fields') AS source)
  SELECT source, public.diagnostic_source_normalize('users',source||${JSON.stringify(changes)}::jsonb) AS next FROM target
 `;
 if (!row?.source) throw new Error("User not found");
 return { operation: "user_eligibility", roots: [{ table: "users", key: { id: input.userId } }],
  rows: [{ table: "users", key: { id: input.userId }, verb: "update", expected: { source: row.source }, next: row.next }],
  actorUserId: input.actorUserId, sessionId: null, cutoff: null, campaign: null,
  ...(input.intent ? { intent: input.intent } : {}) };
}

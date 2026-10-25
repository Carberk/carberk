import type { Prisma } from "../generated/prisma/client/client";

import type { DiagnosticSourceCommand, DiagnosticSourceRoot, DiagnosticSourceTuple } from "./diagnostic-source-command";

/** Unlocked discovery; SQL owns the protected projection and normalization. */
export async function listingSourceCommand(tx: Prisma.TransactionClient, input: {
 readonly operation: "listing_create" | "listing_change" | "listing_delete";
 readonly listingId: string; readonly actorUserId: string; readonly sessionId?: string | undefined;
 readonly changes: DiagnosticSourceTuple; readonly roots: readonly DiagnosticSourceRoot[];
}): Promise<DiagnosticSourceCommand> {
 const [row] = await tx.$queryRaw<{ source: DiagnosticSourceTuple | null; next: DiagnosticSourceTuple }[]>`
  WITH target AS (SELECT public.diagnostic_source_project(
   public.diagnostic_source_read('listings',jsonb_build_object('id',${input.listingId}::text)),
   public.diagnostic_source_meta('listings')->'fields') AS source)
  SELECT source, public.diagnostic_source_normalize('listings',coalesce(source,'{}')||${JSON.stringify(input.changes)}::jsonb) AS next FROM target
 `;
 if (!row || (input.operation === "listing_create" ? row.source !== null : !row.source)) throw new Error("diagnostic_source_stale");
 return { operation: input.operation, roots: [{ table: "listings", key: { id: input.listingId } }, ...input.roots],
  rows: input.operation === "listing_create"
   ? [{ table: "listings", key: { id: input.listingId }, verb: "insert", expected: "absent", next: row.next }]
   : [{ table: "listings", key: { id: input.listingId }, verb: "update", expected: { source: row.source! }, next: row.next }],
  actorUserId: input.actorUserId, sessionId: input.sessionId ?? null, cutoff: null, campaign: null };
}

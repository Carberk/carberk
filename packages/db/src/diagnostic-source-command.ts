import type { Prisma } from "../generated/prisma/client/client";

import type { DiagnosticSourceKeys, DiagnosticSourceTable } from "./diagnostic-source-tables";

export type { DiagnosticSourceKeys, DiagnosticSourceTable } from "./diagnostic-source-tables";
export type DiagnosticSourceOperation =
  | "listing_create" | "listing_change" | "listing_delete"
  | "member_create" | "member_replace" | "member_remove" | "member_eligibility"
  | "sign_in_method_change" | "business_eligibility" | "user_eligibility" | "account_schedule" | "account_restore" | "account_purge"
  | "order_create" | "order_change" | "observation_append"
  | "intake_create" | "template_publish" | "center_bootstrap" | "campaign_admit" | "staff_bootstrap"
  | "ownership_grant" | "ownership_revoke" | "ownership_expire"
  | "report_change" | "proof_issue" | "proof_consume" | "proof_expire"
  | "identity_material_change" | "staff_eligibility" | "session_change";
export type DiagnosticSourceTuple = Readonly<Record<string, Prisma.InputJsonValue | null>>;
export type ListingPublicationIntent = Readonly<{
  draftId: string;
  photoIds: readonly string[];
  uploadIds: readonly string[];
  auditId: string;
  measurement?: Readonly<{ eventIds: readonly string[]; environment: "test" | "staging" | "production"; createdAt: Readonly<Record<string, string>>; expiresAt: Readonly<Record<string, string>> }>;
}>;
export type DiagnosticSourceRoot = {
  [T in DiagnosticSourceTable]: { readonly table: T; readonly key: Readonly<DiagnosticSourceKeys[T]> }
}[DiagnosticSourceTable];
export type DiagnosticSourceRow = {
  [T in DiagnosticSourceTable]: { readonly table: T; readonly key: Readonly<DiagnosticSourceKeys[T]> } & (
    | { readonly verb: "insert"; readonly expected: "absent"; readonly next: DiagnosticSourceTuple }
    | { readonly verb: "update"; readonly expected: { readonly source: DiagnosticSourceTuple }; readonly next: DiagnosticSourceTuple }
    | { readonly verb: "delete"; readonly expected: { readonly source: DiagnosticSourceTuple }; readonly next: null }
  )
}[DiagnosticSourceTable];
interface DiagnosticSourceCommandFields {
  readonly roots: readonly DiagnosticSourceRoot[];
  readonly rows: readonly DiagnosticSourceRow[];
  readonly actorUserId: string | null;
  readonly sessionId: string | null;
  readonly cutoff: Date | null;
  /** Reservation authority is always resolved from persisted campaign ownership. */
  readonly campaign: null;
}
/** Moderation metadata describes the complete admin operation. Without it the
 * standalone Identity operation has no admin audit or report action. */
export type DiagnosticSourceCommand = DiagnosticSourceCommandFields & (
  | { readonly operation: "user_eligibility"; readonly intent?: Readonly<{
    auditId: string; reason: string; report?: Readonly<{ id: string; reviewedAt: string }>;
  }> }
  | { readonly operation: Exclude<DiagnosticSourceOperation, "user_eligibility">;
    readonly intent?: Readonly<{ receptionQualificationIds: readonly string[]; campaignAdmission?: true }> | Readonly<{ campaignAdmission: true }> | Readonly<{ code: string; userId: string; capability: string; qualificationId: string }> | Readonly<{ reason: string }> | Readonly<{ publication: ListingPublicationIntent }> | Readonly<Record<string, never>> }
);

declare const prepared: unique symbol;
/** A receipt proves coverage in this backend/transaction, never caller authority. */
export interface PreparedDiagnosticSource {
  readonly receiptId: string;
  readonly [prepared]: true;
}

/** Call at outer transaction entry. No transaction creation, retry or fallback preparation. */
export async function withDiagnosticSourceCommand<T>(
  tx: Prisma.TransactionClient,
  command: DiagnosticSourceCommand,
  work: (receipt: PreparedDiagnosticSource) => Promise<T>,
): Promise<T> {
  const [row] = await tx.$queryRaw<{ receipt: string }[]>`
    SELECT public.diagnostic_prepare_source(${JSON.stringify(command)}::jsonb)::text AS receipt
  `;
  if (!row?.receipt) throw new Error("diagnostic_source_receipt");
  const receipt = Object.freeze({ receiptId: row.receipt }) as PreparedDiagnosticSource;
  const result = await work(receipt);
  await tx.$queryRaw`SELECT public.diagnostic_finish_source(${receipt.receiptId}::uuid)`;
  return result;
}

/** Helpers with caller-owned transactions assert their receipt before any locking/write. */
export async function assertDiagnosticSourceCommand(
  tx: Prisma.TransactionClient,
  receipt: PreparedDiagnosticSource,
  operation: DiagnosticSourceOperation,
): Promise<void> {
  await tx.$queryRaw`SELECT public.diagnostic_assert_source(${receipt.receiptId}::uuid,${operation})`;
}

export async function sealDiagnosticFirstObservation(
  tx: Prisma.TransactionClient,
  receipt: PreparedDiagnosticSource,
  orderId: string,
  rawId: string,
): Promise<void> {
  await tx.$queryRaw`SELECT public.diagnostic_seal_first_observation(${receipt.receiptId}::uuid,${orderId},${rawId})`;
}

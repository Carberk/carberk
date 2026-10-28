import type { Prisma } from "../generated/prisma/client/client";

import type { DiagnosticSourceCommand, DiagnosticSourceRow, DiagnosticSourceTuple } from "./diagnostic-source-command";

export type MaintenanceSelector = Readonly<{ channel: "phone" | "email"; value: string }>;
export type ReviewerCredentialTarget = Readonly<{ id: string; phone: string; email: string | null }>;

/** Unlocked, normalized OLD/NEW discovery. Only the three closed constructors
 * below export command authority; SQL rechecks all ownership and derived effects. */
async function userRow(tx: Prisma.TransactionClient, id: string, changes: Record<string, unknown>): Promise<DiagnosticSourceRow> {
  const [plan] = await tx.$queryRaw<{ source: DiagnosticSourceTuple | null; next: DiagnosticSourceTuple }[]>`
    WITH target AS (SELECT public.diagnostic_source_project(
      public.diagnostic_source_read('users',jsonb_build_object('id',${id}::text)),
      public.diagnostic_source_meta('users')->'fields') AS source)
    SELECT source,public.diagnostic_source_normalize('users',source||${JSON.stringify(changes)}::jsonb) AS next FROM target
  `;
  if (!plan?.source) throw new Error("Maintenance User not found");
  return { table: "users", key: { id }, verb: "update", expected: { source: plan.source }, next: plan.next };
}
const subjects = (ids: readonly string[]) => ids.map(id => ({ table: "users" as const, key: { id } }));
const context = { actorUserId: null, sessionId: null, cutoff: null, campaign: null } as const;

export async function adminPromotionSourceCommand(tx: Prisma.TransactionClient, input: {
  userId: string; reason: string; selector: MaintenanceSelector; source?: DiagnosticSourceTuple;
}): Promise<DiagnosticSourceCommand> {
  let row: DiagnosticSourceRow;
  if (input.source) {
    const [normalized] = await tx.$queryRaw<{ next: DiagnosticSourceTuple }[]>`
      SELECT public.diagnostic_source_normalize('users',${JSON.stringify(input.source)}::jsonb||jsonb_build_object('role','admin')) AS next
    `;
    if (!normalized) throw new Error("Promotion next source missing");
    row = { table: "users", key: { id: input.userId }, verb: "update", expected: { source: input.source }, next: normalized.next };
  } else row = await userRow(tx, input.userId, { role: "admin" });
  return { operation: "admin_bootstrap_promote", ...context, roots: subjects([input.userId]),
    rows: [row],
    intent: { reason: input.reason, selector: input.selector } };
}

export async function reviewerCredentialsSourceCommand(tx: Prisma.TransactionClient, input: {
  mode: "rotate" | "revoke"; accounts: readonly ReviewerCredentialTarget[]; changedIds: readonly string[]; now: Date;
}): Promise<DiagnosticSourceCommand> {
  const rows: DiagnosticSourceRow[] = [];
  for (const account of input.accounts) {
    if (!input.changedIds.includes(account.id)) continue;
    rows.push(await userRow(tx, account.id, input.mode === "rotate"
      ? { phone: account.phone, email: account.email, phoneVerifiedAt: input.now.toISOString(), emailVerifiedAt: input.now.toISOString() }
      : { phone: `revoked:${account.id}`, email: null, emailVerifiedAt: null, displayName: `Revoked ${account.id}` }));
  }
  return { operation: "reviewer_credentials_change", ...context, roots: subjects(input.accounts.map(account => account.id)), rows,
    intent: { mode: input.mode, at: input.now.toISOString(), accounts: input.accounts.map(({ id, phone, email }) => ({ id, phone, email })) } };
}

export async function testerRemovalSourceCommand(tx: Prisma.TransactionClient, input: {
  users: readonly { id: string; deletionScheduledAt: Date | null }[]; now: Date;
}): Promise<DiagnosticSourceCommand> {
  const rows: DiagnosticSourceRow[] = [];
  for (const user of input.users) {
    const desired = user.deletionScheduledAt !== null && user.deletionScheduledAt < input.now ? user.deletionScheduledAt : input.now;
    rows.push(await userRow(tx, user.id, { deletionScheduledAt: desired.toISOString() }));
  }
  return { operation: "account_schedule", ...context, roots: subjects(input.users.map(user => user.id)), rows,
    intent: { mode: "tester_remove", at: input.now.toISOString() } };
}

export interface MaintenanceAudit {
  id: string; actorId: null; action: string; targetType: string; targetId: string; details: Prisma.InputJsonValue; createdAt: string;
}
/** Server-derived identity/time/details, reused for the actual audit INSERT. */
export async function maintenanceAudit(tx: Prisma.TransactionClient, command: DiagnosticSourceCommand): Promise<MaintenanceAudit> {
  const [result] = await tx.$queryRaw<{ audit: MaintenanceAudit }[]>`SELECT public.diagnostic_maintenance_audit(${JSON.stringify(command)}::jsonb) AS audit`;
  if (!result?.audit) throw new Error("Maintenance audit missing");
  return result.audit;
}

export function maintenanceAuditDate(value: string): Date {
  // PostgreSQL TIMESTAMP(3) JSON has no zone; this package stores UTC.
  return new Date(/[zZ]|[+-]\d\d:\d\d$/.test(value) ? value : `${value}Z`);
}

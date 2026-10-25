import { randomUUID } from "node:crypto";

import type { Prisma, PrismaClient } from "../generated/prisma/client/client";
import { assertDiagnosticSourceCommand, withDiagnosticSourceCommand } from "../src/diagnostic-source-command";
import type { DiagnosticSourceCommand, DiagnosticSourceTuple } from "../src/diagnostic-source-command";

const COMMAND = "diagnostics:bootstrap-synthetic";
const NAMES = { en: "Carberk synthetic diagnostics", ru: "Carberk synthetic diagnostics", tk: "Carberk synthetic diagnostics" };
export type CenterBootstrapValues = { "center-code"?: string; "user-id"?: string; capability?: string; "dry-run"?: boolean };
type StaffInput = { targetUserId: string; capability: string; reason: string };
type User = { id: string; phoneVerifiedAt: Date | null; emailVerifiedAt: Date | null; suspendedAt: Date | null; deletionScheduledAt: Date | null };
type Effect = { table: string; verb: string; next: DiagnosticSourceTuple };
function refuse(reason: string): never { throw new Error(`Refused: ${reason}`); }
function detailsMatch(value: unknown, expected: Record<string, string>): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return Object.keys(record).length === Object.keys(expected).length && Object.entries(expected).every(([key, item]) => record[key] === item);
}
function active(user: User | undefined): boolean {
  return !!user && !!(user.phoneVerifiedAt || user.emailVerifiedAt) && !user.suspendedAt && !user.deletionScheduledAt;
}
function date(value: Prisma.InputJsonValue | null | undefined): Date {
  if (typeof value !== "string") throw new Error("diagnostic_bootstrap_effect");
  return new Date(value.endsWith("Z") ? value : `${value}Z`);
}
async function effects(tx: Prisma.TransactionClient, receiptId: string): Promise<Effect[]> {
  const [row] = await tx.$queryRaw<{ effects: Effect[] }[]>`SELECT effects FROM public.diagnostic_source_commands WHERE id=${receiptId}::uuid`;
  if (!row) throw new Error("diagnostic_source_receipt");
  return row.effects;
}

/** Explicit operator transaction bodies. Discovery is unlocked and writes enter
 * exactly once. SQL owns OLD/NEW projection, retained closure, persisted campaign
 * namespaces, absent unique slots and post-wait validation before legacy locks.
 * No-op/dry-run paths read only; they never fabricate an unfinished write plan. */
export async function bootstrapStaff(tx: Prisma.TransactionClient, input: StaffInput, dryRun = false): Promise<string> {
  const users = await tx.$queryRaw<User[]>`SELECT "id", "phoneVerifiedAt", "emailVerifiedAt", "suspendedAt", "deletionScheduledAt" FROM "users" WHERE "id" = ${input.targetUserId}`;
  if (!active(users[0])) throw new Error("An active verified exact User is required");
  const existing = await tx.staffGrant.findUnique({ where: { userId_capability: { userId: input.targetUserId, capability: input.capability } } });
  if (existing && !existing.revokedAt) return "Already granted; no change";
  if (dryRun) return "Dry run; would grant the named capability and write bootstrap audit";
  const key = { userId: input.targetUserId, capability: input.capability };
  const [plan] = await tx.$queryRaw<{ source: DiagnosticSourceTuple | null; next: DiagnosticSourceTuple }[]>`
    WITH target AS (SELECT public.diagnostic_source_project(public.diagnostic_source_read('staff_grants',${JSON.stringify(key)}::jsonb),public.diagnostic_source_meta('staff_grants')->'fields') AS source)
    SELECT source, public.diagnostic_source_normalize('staff_grants',coalesce(source,'{}'::jsonb)||jsonb_build_object(
      'userId',${input.targetUserId}::text,'capability',${input.capability}::text,
      'grantedAt',transaction_timestamp()::timestamp(3),'revokedAt',NULL)) AS next FROM target
  `;
  if (!plan) throw new Error("diagnostic_bootstrap_plan");
  const command: DiagnosticSourceCommand = {
    operation: "staff_bootstrap", roots: [{ table: "users", key: { id: input.targetUserId } }, { table: "staff_grants", key }],
    rows: [{ table: "staff_grants", key, ...(plan.source ? { verb: "update" as const, expected: { source: plan.source } } : { verb: "insert" as const, expected: "absent" as const }), next: plan.next }],
    actorUserId: null, sessionId: null, cutoff: null, campaign: null, intent: { reason: input.reason },
  };
  return withDiagnosticSourceCommand(tx, command, async receipt => {
    await assertDiagnosticSourceCommand(tx, receipt, "staff_bootstrap");
    const current = await tx.$queryRaw<User[]>`SELECT "id", "phoneVerifiedAt", "emailVerifiedAt", "suspendedAt", "deletionScheduledAt" FROM "users" WHERE "id" = ${input.targetUserId} FOR UPDATE`;
    if (!active(current[0])) throw new Error("An active verified exact User is required");
    const data = { userId: input.targetUserId, capability: input.capability, grantedAt: date(plan.next["grantedAt"]), revokedAt: null };
    if (plan.source) await tx.staffGrant.update({ where: { userId_capability: key }, data: { grantedAt: data.grantedAt, revokedAt: null } });
    else await tx.staffGrant.create({ data });
    const audit = (await effects(tx, receipt.receiptId)).find(e => e.table === "audit_logs" && e.verb === "insert")?.next;
    if (!audit) throw new Error("diagnostic_bootstrap_audit_effect");
    await tx.auditLog.create({ data: { ...audit, createdAt: date(audit["createdAt"]) } as Prisma.AuditLogUncheckedCreateInput });
    return "Named capability granted with bootstrap audit";
  });
}

async function centerState(tx: Prisma.TransactionClient, values: CenterBootstrapValues) {
  const userId = values["user-id"] as string;
  const centerCode = values["center-code"] as string;
  const capability = values.capability as string;
  const users = await tx.$queryRaw<User[]>`SELECT "id", "phoneVerifiedAt", "emailVerifiedAt", "suspendedAt", "deletionScheduledAt" FROM "users" WHERE "id" = ${userId}`;
  if (!active(users[0])) refuse("user");
  const grant = await tx.staffGrant.findUnique({ where: { userId_capability: { userId, capability } } });
  if (!grant || grant.revokedAt) refuse("grant");
  const center = await tx.diagnosticCenter.findUnique({ where: { code: centerCode } });
  if (!center) return { center: null, assignment: null };
  if (center.operationalApproval !== null) refuse("center-approved");
  if (center.planCode !== "standard" || !detailsMatch(center.names, NAMES)) refuse("center-conflict");
  const centerAudits = await tx.diagnosticAudit.findMany({ where: { centerId: center.id, action: "CENTER_SYNTHETIC_BOOTSTRAPPED", actorId: null, orderId: null } });
  if (!centerAudits.some(row => detailsMatch(row.details, { command: COMMAND }))) refuse("center-conflict");
  const assignment = await tx.diagnosticCenterAssignment.findUnique({ where: { centerId_userId_capability: { centerId: center.id, userId, capability } } });
  const audits = await tx.diagnosticAudit.findMany({ where: { centerId: center.id, action: "CENTER_QUALIFICATION_SYNTHETIC", actorId: null, orderId: null } });
  const qualifiedAudit = audits.some(row => detailsMatch(row.details, { command: COMMAND, capability, userId }));
  if (assignment?.revokedAt) refuse("qualification-revoked");
  if (assignment && !qualifiedAudit) refuse("assignment-conflict");
  if (assignment) {
    const current = await tx.$queryRaw<{ active: boolean }[]>`SELECT "qualifiedUntil" > clock_timestamp() AS active FROM diagnostic_center_assignments WHERE id = ${assignment.id}`;
    if (!current[0]?.active) refuse("qualification-expired");
  } else if (qualifiedAudit) refuse("assignment-conflict");
  return { center, assignment };
}

export async function bootstrapSyntheticCenter(
  tx: Prisma.TransactionClient, values: CenterBootstrapValues,
  proposed = { centerId: randomUUID(), qualificationId: randomUUID() },
): Promise<string> {
  const before = await centerState(tx, values);
  if (before.assignment) return "Already bootstrapped; no change";
  if (values["dry-run"]) return before.center ? "Dry run; would qualify the User" : "Dry run; would create the synthetic center and qualification";
  const userId = values["user-id"] as string;
  const centerCode = values["center-code"] as string;
  const capability = values.capability as string;
  const centerId = before.center?.id ?? proposed.centerId;
  const qualificationId = proposed.qualificationId;
  const command: DiagnosticSourceCommand = {
    operation: "center_bootstrap", roots: [{ table: "diagnostic_centers", key: { id: centerId } }], rows: [],
    actorUserId: null, sessionId: null, cutoff: null, campaign: null,
    intent: { code: centerCode, userId, capability, qualificationId },
  };
  return withDiagnosticSourceCommand(tx, command, async receipt => {
    await assertDiagnosticSourceCommand(tx, receipt, "center_bootstrap");
    await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${`diagnostics:bootstrap-synthetic:${centerCode}`}, 0))`;
    await tx.$queryRaw`SELECT "id" FROM "users" WHERE "id" = ${userId} FOR UPDATE`;
    await tx.$queryRaw`SELECT "userId" FROM staff_grants WHERE "userId" = ${userId} AND capability = ${capability} FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM diagnostic_centers WHERE id = ${centerId} FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM diagnostic_center_assignments WHERE "centerId" = ${centerId} AND "userId" = ${userId} AND capability = ${capability} FOR UPDATE`;
    const current = await centerState(tx, values);
    // A changed graph cannot be adopted by this receipt, even after legacy waits.
    if (current.center?.id !== before.center?.id || current.assignment) throw new Error("diagnostic_source_graph_changed");
    const planned = await effects(tx, receipt.receiptId);
    const center = planned.find(e => e.table === "diagnostic_centers" && e.verb === "insert")?.next;
    if (center) await tx.diagnosticCenter.create({ data: { ...center, operationalApproval: undefined, createdAt: date(center["createdAt"]) } as Prisma.DiagnosticCenterUncheckedCreateInput });
    const assignment = planned.find(e => e.table === "diagnostic_center_assignments" && e.verb === "insert")?.next;
    if (!assignment) throw new Error("diagnostic_bootstrap_assignment_effect");
    await tx.diagnosticCenterAssignment.create({ data: { ...assignment, assignedAt: date(assignment["assignedAt"]), qualifiedUntil: date(assignment["qualifiedUntil"]) } as Prisma.DiagnosticCenterAssignmentUncheckedCreateInput });
    for (const effect of planned.filter(e => e.table === "diagnostic_audits" && e.verb === "insert")) {
      await tx.diagnosticAudit.create({ data: { ...effect.next, createdAt: date(effect.next["createdAt"]) } as Prisma.DiagnosticAuditUncheckedCreateInput });
    }
    return "Synthetic center and qualification created";
  });
}

/** Owns the operator command transaction; the CLI supplies the connected client. */
export async function runSyntheticCenterBootstrap(db: Pick<PrismaClient, "$transaction">, values: CenterBootstrapValues): Promise<string> {
  return db.$transaction(tx => bootstrapSyntheticCenter(tx, values));
}

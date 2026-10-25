import { randomUUID } from "node:crypto";
import type { Prisma } from "../generated/prisma/client/client";

const COMMAND = "diagnostics:bootstrap-synthetic";
const NAMES = { en: "Carberk synthetic diagnostics", ru: "Carberk synthetic diagnostics", tk: "Carberk synthetic diagnostics" };
const CAPABILITIES = new Set(["diagnostics.reception", "diagnostics.technician", "diagnostics.reviewer", "diagnostics.templates"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const CODE = /^synthetic-[a-z0-9][a-z0-9_-]{0,62}$/;
export type CenterBootstrapValues = { "center-code"?: string; "user-id"?: string; capability?: string; "dry-run"?: boolean };

function refuse(reason: string): never { throw new Error(`Refused: ${reason}`); }
function detailsMatch(value: unknown, expected: Record<string, string>): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return Object.keys(record).length === Object.keys(expected).length && Object.entries(expected).every(([key, item]) => record[key] === item);
}
function allowlist(value: string | undefined): string[] {
  if (!value) refuse("allowlist");
  let parsed: unknown;
  try { parsed = JSON.parse(value); } catch { refuse("allowlist"); }
  if (!Array.isArray(parsed) || parsed.length > 100 || parsed.some(item => typeof item !== "string" || !UUID.test(item))) refuse("allowlist");
  return parsed as string[];
}

export async function bootstrapSyntheticCenter(tx: Prisma.TransactionClient, values: CenterBootstrapValues): Promise<string> {
  const userId = values["user-id"] as string;
  const centerCode = values["center-code"] as string;
  const capability = values.capability as string;
      // Serializes even an absent center code; row locks also fence ordinary authority changes.
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${`diagnostics:bootstrap-synthetic:${centerCode}`}, 0))`;
      const users = await tx.$queryRaw<{ id: string; phoneVerifiedAt: Date | null; emailVerifiedAt: Date | null; suspendedAt: Date | null; deletionScheduledAt: Date | null }[]>`SELECT "id", "phoneVerifiedAt", "emailVerifiedAt", "suspendedAt", "deletionScheduledAt" FROM "users" WHERE "id" = ${userId} FOR UPDATE`;
      const user = users[0];
      if (!user || (!user.phoneVerifiedAt && !user.emailVerifiedAt) || user.suspendedAt || user.deletionScheduledAt) refuse("user");
      await tx.$queryRaw`SELECT "userId" FROM staff_grants WHERE "userId" = ${userId} AND capability = ${capability} FOR UPDATE`;
      const grant = await tx.staffGrant.findUnique({ where: { userId_capability: { userId, capability } } });
      if (!grant || grant.revokedAt) refuse("grant");
      const centers = await tx.$queryRaw<{ unapproved: boolean }[]>`SELECT "operationalApproval" IS NULL AS unapproved FROM diagnostic_centers WHERE code = ${centerCode} FOR UPDATE`;
      let center = await tx.diagnosticCenter.findUnique({ where: { code: centerCode } });
      if (!center) {
        if (values["dry-run"]) return "Dry run; would create the synthetic center and qualification";
        center = await tx.diagnosticCenter.create({ data: { code: centerCode, planCode: "standard", names: NAMES } });
        await tx.diagnosticAudit.create({ data: { centerId: center.id, action: "CENTER_SYNTHETIC_BOOTSTRAPPED", details: { command: COMMAND } } });
      } else {
        if (!centers[0]?.unapproved) refuse("center-approved");
        if (center.planCode !== "standard" || !detailsMatch(center.names, NAMES)) refuse("center-conflict");
        const audits = await tx.diagnosticAudit.findMany({ where: { centerId: center.id, action: "CENTER_SYNTHETIC_BOOTSTRAPPED", actorId: null, orderId: null } });
        if (!audits.some(row => detailsMatch(row.details, { command: COMMAND }))) refuse("center-conflict");
      }
      await tx.$queryRaw`SELECT id FROM diagnostic_center_assignments WHERE "centerId" = ${center.id} AND "userId" = ${userId} AND capability = ${capability} FOR UPDATE`;
      const assignment = await tx.diagnosticCenterAssignment.findUnique({ where: { centerId_userId_capability: { centerId: center.id, userId, capability } } });
      const audits = await tx.diagnosticAudit.findMany({ where: { centerId: center.id, action: "CENTER_QUALIFICATION_SYNTHETIC", actorId: null, orderId: null } });
      const qualifiedAudit = audits.some(row => detailsMatch(row.details, { command: COMMAND, capability, userId }));
      if (assignment?.revokedAt) refuse("qualification-revoked");
      if (assignment && !qualifiedAudit) refuse("assignment-conflict");
      if (assignment) {
        const current = await tx.$queryRaw<{ active: boolean }[]>`SELECT "qualifiedUntil" > clock_timestamp() AS active FROM diagnostic_center_assignments WHERE id = ${assignment.id}`;
        if (!current[0]?.active) refuse("qualification-expired");
        return "Already bootstrapped; no change";
      }
      if (qualifiedAudit) refuse("assignment-conflict");
      if (values["dry-run"]) return "Dry run; would qualify the User";
      await tx.$executeRaw`INSERT INTO diagnostic_center_assignments (id, "centerId", "userId", capability, "qualifiedUntil", "assignedAt") VALUES (${randomUUID()}, ${center.id}, ${userId}, ${capability}, now() + interval '2 hours', now())`;
      await tx.diagnosticAudit.create({ data: { centerId: center.id, action: "CENTER_QUALIFICATION_SYNTHETIC", details: { command: COMMAND, capability, userId } } });
      return "Synthetic center and qualification created";
}

export async function bootstrapStaff(tx: Prisma.TransactionClient, input: { targetUserId: string; capability: string; reason: string }, dryRun = false): Promise<string> {
      const users = await tx.$queryRaw<{ id: string; phoneVerifiedAt: Date | null; emailVerifiedAt: Date | null; suspendedAt: Date | null; deletionScheduledAt: Date | null }[]>`
        SELECT "id", "phoneVerifiedAt", "emailVerifiedAt", "suspendedAt", "deletionScheduledAt" FROM "users" WHERE "id" = ${input.targetUserId} FOR UPDATE`;
      const user = users[0];
      if (!user || (!user.phoneVerifiedAt && !user.emailVerifiedAt) || user.suspendedAt || user.deletionScheduledAt) throw new Error("An active verified exact User is required");
      const existing = await tx.staffGrant.findUnique({ where: { userId_capability: { userId: user.id, capability: input.capability } } });
      if (existing && !existing.revokedAt) return "Already granted; no change";
      if (dryRun) return "Dry run; would grant the named capability and write bootstrap audit";
      await tx.staffGrant.upsert({ where: { userId_capability: { userId: user.id, capability: input.capability } }, create: { userId: user.id, capability: input.capability }, update: { revokedAt: null, grantedAt: new Date() } });
      await tx.auditLog.create({ data: { actorId: null, action: "STAFF_CAPABILITY_BOOTSTRAP", targetType: "User", targetId: user.id, details: { capability: input.capability, reason: input.reason } } });
      return "Named capability granted with bootstrap audit";
}

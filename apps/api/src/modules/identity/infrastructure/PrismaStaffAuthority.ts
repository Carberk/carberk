import { Inject, Injectable } from "@nestjs/common";
import { PrismaService, withDiagnosticSourceCommand, type DiagnosticSourceRow, type Prisma } from "@auto-tm/db";
import { StaffAuthorityDenied, type StaffSubject } from "../domain/ports/StaffAuthorityPort";
import type { StaffAuthorityRepository, StaffAuthoritySnapshot, StaffGrantChange } from "../domain/ports/StaffAuthorityRepository";
import { assertStaffGrantChange } from "../domain/staffPolicy";

@Injectable()
export class PrismaStaffAuthority implements StaffAuthorityRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}
  /** With a supplied transaction this is authorization only. Its caller owns the
   * complete campaign/source preparation, including actor User, Session, current
   * and absent capability keys and retained graph, before ANY service/history
   * locks. This method never prepares late or creates a nested receipt. */
  async current(input: StaffSubject, transaction?: unknown): Promise<StaffAuthoritySnapshot | null> {
    const db = (transaction as Prisma.TransactionClient | undefined) ?? this.prisma;
    if (transaction) {
      // Grant changes and account deletion lock this same User before Sessions.
      // A feature that locks several Users must acquire them in sorted order first.
      await db.$queryRaw`SELECT "id" FROM "users" WHERE "id" = ${input.userId} FOR UPDATE`;
      await db.$queryRaw`SELECT "id" FROM "sessions" WHERE "id" = ${input.sessionId} FOR UPDATE`;
    }
    const session = await db.session.findUnique({ where: { id: input.sessionId }, include: { user: { include: { staffGrants: { where: { revokedAt: null } } } } } });
    if (!session) return null;
    return { userId: session.user.id, sessionUserId: session.userId, role: session.user.role,
      suspended: !!session.user.suspendedAt, deleting: !!session.user.deletionScheduledAt,
      expiresAt: session.expiresAt, elevatedUntil: session.adminTotpExpiresAt,
      capabilities: session.user.staffGrants.map((grant) => grant.capability) };
  }
  async change(input: StaffGrantChange, now: Date): Promise<void> {
    try {
      await this.prisma.$transaction(async (tx) => {
        // Inventory is unlocked. SQL validates it and rediscovers retained graphs
        // before the existing actor/target/Session permission locks below.
        const existing = await tx.staffGrant.findUnique({ where: { userId_capability: { userId: input.targetUserId, capability: input.capability } } });
        const source = existing ? { userId: existing.userId, capability: existing.capability,
          grantedAt: existing.grantedAt.toISOString(), revokedAt: existing.revokedAt?.toISOString() ?? null } : null;
        const noChange = input.grant === (!!existing && existing.revokedAt === null);
        const next = { userId: input.targetUserId, capability: input.capability,
          grantedAt: input.grant ? now.toISOString() : source?.grantedAt ?? now.toISOString(),
          revokedAt: input.grant ? null : now.toISOString() };
        const row: DiagnosticSourceRow = source
          ? { table: "staff_grants", key: { userId: input.targetUserId, capability: input.capability }, verb: "update", expected: { source }, next: noChange ? source : next }
          : { table: "staff_grants", key: { userId: input.targetUserId, capability: input.capability }, verb: "insert", expected: "absent", next };
        await withDiagnosticSourceCommand(tx, { operation: "staff_eligibility", roots: [
          { table: "users", key: { id: input.userId } }, { table: "users", key: { id: input.targetUserId } },
          { table: "sessions", key: { id: input.sessionId } },
          { table: "staff_grants", key: { userId: input.userId, capability: "staff.manage" } },
          { table: "staff_grants", key: { userId: input.userId, capability: "founder.control" } },
        ], rows: [row], actorUserId: input.userId, sessionId: input.sessionId, cutoff: null, campaign: null }, async () => {
          // Lock actor and target in a fixed order. Revocation and concurrent grant changes
          // share these User locks, preventing a stale management grant from committing.
          const users = await tx.$queryRaw<{ id: string; role: string; suspendedAt: Date | null; deletionScheduledAt: Date | null }[]>`
            SELECT "id", "role", "suspendedAt", "deletionScheduledAt" FROM "users"
            WHERE "id" IN (${input.userId}, ${input.targetUserId}) ORDER BY "id" FOR UPDATE`;
          const user = users.find((row) => row.id === input.userId);
          const target = users.find((row) => row.id === input.targetUserId);
          const sessions = await tx.$queryRaw<{ userId: string; expiresAt: Date; adminTotpExpiresAt: Date | null }[]>`
            SELECT "userId", "expiresAt", "adminTotpExpiresAt" FROM "sessions" WHERE "id" = ${input.sessionId} FOR UPDATE`;
          const session = sessions[0];
          if (!user || !session) throw new StaffAuthorityDenied("SESSION_REQUIRED");
          const grants = await tx.staffGrant.findMany({ where: { userId: input.userId, revokedAt: null } });
          // Caller time stamps the declared mutation; authority expires at execution.
          assertStaffGrantChange({ userId: user.id, sessionUserId: session.userId, role: user.role,
            suspended: !!user.suspendedAt, deleting: !!user.deletionScheduledAt,
            expiresAt: session.expiresAt, elevatedUntil: session.adminTotpExpiresAt,
            capabilities: grants.map((grant) => grant.capability) }, input, new Date());
          if (!target || (input.grant && (target.suspendedAt || target.deletionScheduledAt))) throw new StaffAuthorityDenied("GRANT_FORBIDDEN");
          const locked = await tx.staffGrant.findUnique({ where: { userId_capability: { userId: input.targetUserId, capability: input.capability } } });
          if (input.grant === (!!locked && locked.revokedAt === null)) throw staffNoChange;
          if (input.grant) await tx.staffGrant.upsert({ where: { userId_capability: { userId: input.targetUserId, capability: input.capability } }, create: { userId: input.targetUserId, capability: input.capability, grantedAt: now }, update: { revokedAt: null, grantedAt: now } });
          else await tx.staffGrant.updateMany({ where: { userId: input.targetUserId, capability: input.capability, revokedAt: null }, data: { revokedAt: now } });
          await tx.auditLog.create({ data: { actorId: input.userId, action: input.grant ? "STAFF_CAPABILITY_GRANTED" : "STAFF_CAPABILITY_REVOKED", targetType: "User", targetId: input.targetUserId,
            details: { capability: input.capability, reason: input.reason.trim(), previouslyActive: !!existing && !existing.revokedAt } } });
        });
      });
    } catch (error) {
      // Abort the declaration as well: a real no-op must not invalidate proofs.
      if (error !== staffNoChange) throw error;
    }
  }
}

const staffNoChange = Symbol("staff grant unchanged");

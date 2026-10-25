import { Inject, Injectable } from "@nestjs/common";
import { accountSourceCommand, withDiagnosticSourceCommand, PrismaService } from "@auto-tm/db";
import type {
  AccountDeletionUnitOfWork,
  AccountDeletionWrites,
} from "../domain/ports/AccountDeletionUnitOfWork";

/** Owns the complete scheduling transaction. Session revocation commits first
 * through its separate repository transaction in DeleteMe. */
@Injectable()
export class PrismaAccountDeletionUnitOfWork implements AccountDeletionUnitOfWork {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  run<T>(
    command: { readonly userId: string; readonly deletionScheduledAt: Date },
    work: (writes: AccountDeletionWrites) => Promise<T>,
  ): Promise<T> {
    // Snapshot callback authority before yielding to unlocked discovery.
    const userId = command.userId;
    const scheduledTime = command.deletionScheduledAt.getTime();
    if (!Number.isFinite(scheduledTime)) throw new Error("account_deletion_target");
    const deletionScheduledAt = new Date(scheduledTime);
    return this.prisma.$transaction(async (tx) => {
      const prepared = await accountSourceCommand(tx, { operation: "account_schedule", userId, deletionScheduledAt });
      return withDiagnosticSourceCommand(tx, prepared.command, async () => {
        let scheduled = false;
        let archived = false;
        const result = await work({
          scheduleDeletion: async (targetId, targetDate) => {
            if (targetId !== userId || targetDate.getTime() !== scheduledTime || scheduled || archived) {
              throw new Error("account_deletion_target");
            }
            // This User-first write also drains assigned Business enquiries,
            // including assignments outside the User's current membership.
            await tx.user.update({ where: { id: userId }, data: { deletionScheduledAt } });
            const membership = await tx.dealershipMember.findUnique({ where: { userId } });
            if (membership) {
              await tx.dealershipMember.delete({ where: { id: membership.id } });
              if (membership.role === "owner") {
                await tx.dealership.updateMany({
                  where: { id: membership.dealershipId, status: { not: "suspended" } },
                  data: { status: "recovery" },
                });
              }
              await tx.auditLog.create({ data: {
                id: prepared.membershipAuditId, createdAt: prepared.timestamp,
                actorId: userId, action: "BUSINESS_MEMBERSHIP_ENDED_FOR_DELETION",
                targetType: "Dealership", targetId: membership.dealershipId,
                details: { role: membership.role, recoveryRequired: membership.role === "owner" },
              } });
            }
            // Preparation already holds the complete source/collector prefix.
            // Rebaseline must precede any fresh actor-owned inventory evidence.
            const collector = await tx.$queryRaw<{ epoch: string }[]>`
              SELECT "epoch" FROM "measurement_state" WHERE "key"='collector' FOR UPDATE`;
            if (collector[0]) {
              await tx.measurementState.deleteMany({ where: { key: `inventory_baseline:${collector[0].epoch}` } });
            }
            // Exports carry no reverse actor map. Invalidate every artifact.
            await tx.measurementInvestigationExport.deleteMany();
            // FKs erase account visits/records/outbox and only linked current
            // guest visits. Prior independent guest visits remain independent.
            await tx.measurementPrincipal.deleteMany({ where: { userId } });
            await tx.dealershipInvitation.deleteMany({ where: { recipientUserId: userId } });
            const revoked = await tx.$queryRaw<{ capability: string }[]>`
              UPDATE "staff_grants" SET "revokedAt" = ${prepared.timestamp}::timestamp(3)
              WHERE "userId" = ${userId} AND "revokedAt" IS NULL RETURNING "capability"`;
            if (revoked.length) {
              await tx.auditLog.create({ data: {
                id: prepared.staffAuditId, createdAt: prepared.timestamp,
                actorId: userId, action: "STAFF_AUTHORITY_REVOKED_FOR_DELETION",
                targetType: "User", targetId: userId,
                details: { reason: "Account deletion scheduled", capabilities: revoked.map((grant) => grant.capability).sort() },
              } });
            }
            scheduled = true;
          },
          archiveActiveListings: async (sellerId) => {
            if (sellerId !== userId || !scheduled || archived) throw new Error("account_deletion_target");
            await tx.listing.updateMany({
              where: { sellerId, businessId: null, status: "active" },
              data: { status: "archived", archivedByDeletion: true },
            });
            archived = true;
          },
        });
        // Enforce callback completion even when a mandatory helper
        // currently has no matching rows.
        if (!scheduled || !archived) throw new Error("account_deletion_incomplete");
        return result;
      });
    });
  }
}

import { Inject, Injectable } from "@nestjs/common";
import { PrismaService } from "@auto-tm/db";
import type {
  AccountDeletionUnitOfWork,
  AccountDeletionWrites,
} from "../domain/ports/AccountDeletionUnitOfWork";

/**
 * Runs the deletion writes in one interactive Prisma transaction, so the
 * deletion schedule and the archived Listings commit together or roll back
 * together when the work throws.
 */
@Injectable()
export class PrismaAccountDeletionUnitOfWork implements AccountDeletionUnitOfWork {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  run<T>(work: (writes: AccountDeletionWrites) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(async (tx) =>
      work({
        scheduleDeletion: async (userId, deletionScheduledAt) => {
          await tx.user.update({
            where: { id: userId },
            data: { deletionScheduledAt },
          });
          const membership = await tx.dealershipMember.findUnique({ where: { userId } });
          if (membership) {
            await tx.$queryRaw`SELECT "id" FROM "dealerships" WHERE "id" = ${membership.dealershipId} FOR UPDATE`;
            await tx.dealershipMember.delete({ where: { id: membership.id } });
            if (membership.role === "owner") await tx.dealership.updateMany({ where: { id: membership.dealershipId, status: { not: "suspended" } }, data: { status: "recovery" } });
            await tx.auditLog.create({ data: { actorId: userId, action: "BUSINESS_MEMBERSHIP_ENDED_FOR_DELETION", targetType: "Dealership", targetId: membership.dealershipId, details: { role: membership.role, recoveryRequired: membership.role === "owner" } } });
          }
          // Erase measurement identities now, including raw facts/outbox and only
          // linked current guest visits by cascading FKs. Core recovery cannot revive them.
          await tx.measurementPrincipal.deleteMany({ where: { userId } });
          await tx.dealershipInvitation.deleteMany({ where: { recipientUserId: userId } });
          // Restoration creates a fresh ordinary identity session, never silently
          // reactivates staff grants that existed before the deletion request.
          const revoked = await tx.$queryRaw<{ capability: string }[]>`
            UPDATE "staff_grants" SET "revokedAt" = CURRENT_TIMESTAMP
            WHERE "userId" = ${userId} AND "revokedAt" IS NULL RETURNING "capability"`;
          if (revoked.length) await tx.auditLog.create({ data: {
            actorId: userId, action: "STAFF_AUTHORITY_REVOKED_FOR_DELETION", targetType: "User", targetId: userId,
            details: { reason: "Account deletion scheduled", capabilities: revoked.map((grant) => grant.capability).sort() },
          } });
        },
        archiveActiveListings: async (sellerId) => {
          await tx.listing.updateMany({
            where: { sellerId, businessId: null, status: "active" },
            data: { status: "archived", archivedByDeletion: true },
          });
        },
      }),
    );
  }
}

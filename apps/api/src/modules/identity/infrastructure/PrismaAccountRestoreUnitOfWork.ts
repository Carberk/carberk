import { Inject, Injectable } from "@nestjs/common";
import { accountSourceCommand, withDiagnosticSourceCommand, PrismaService } from "@auto-tm/db";
import type {
  AccountRestoreUnitOfWork,
  AccountRestoreWrites,
} from "../domain/ports/AccountRestoreUnitOfWork";

/** Restores personal inventory and the User schedule in one prepared transaction. */
@Injectable()
export class PrismaAccountRestoreUnitOfWork implements AccountRestoreUnitOfWork {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  run<T>(
    command: { readonly userId: string },
    work: (writes: AccountRestoreWrites) => Promise<T>,
  ): Promise<T | undefined> {
    const userId = command.userId;
    return this.prisma.$transaction(async (tx) => {
      const prepared = await accountSourceCommand(tx, { operation: "account_restore", userId });
      return withDiagnosticSourceCommand(tx, prepared.command, async () => {
        // Preparation holds the User fence. A stale discovered graph refuses
        // in SQL; an already-clear account never runs callback mutations.
        const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
        if (user.deletionScheduledAt === null) return undefined;
        let republished = false;
        let cleared = false;
        const result = await work({
          republishListingsArchivedByDeletion: async (sellerId) => {
            if (sellerId !== userId || republished || cleared) throw new Error("account_restore_target");
            const collector = await tx.$queryRaw<{ epoch: string }[]>`
              SELECT "epoch" FROM "measurement_state" WHERE "key"='collector' FOR UPDATE`;
            if (collector[0]) {
              await tx.measurementState.deleteMany({ where: { key: `inventory_baseline:${collector[0].epoch}` } });
            }
            // Restore preserves first publishedAt. It cannot bump Newest or
            // revive Business stock, membership, grants, Sessions or telemetry.
            await tx.listing.updateMany({
              where: { sellerId, businessId: null, status: "archived", archivedByDeletion: true },
              data: { status: "active", archivedByDeletion: false },
            });
            republished = true;
          },
          clearDeletionSchedule: async (targetId) => {
            if (targetId !== userId || !republished || cleared) throw new Error("account_restore_target");
            await tx.user.update({ where: { id: userId }, data: { deletionScheduledAt: null } });
            cleared = true;
          },
        });
        if (!republished || !cleared) throw new Error("account_restore_incomplete");
        return result;
      });
    });
  }
}

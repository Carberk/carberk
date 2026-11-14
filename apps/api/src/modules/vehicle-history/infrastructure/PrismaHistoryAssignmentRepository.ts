import { Inject, Injectable } from "@nestjs/common";
import { PrismaService, type Prisma } from "@auto-tm/db";
import type { HistoryAssignmentRepository, HistoryQueueQuery } from "../domain/HistoryAssignmentRepository";
import { HistoryRequestError } from "../domain/HistoryRequestError";

@Injectable()
export class PrismaHistoryAssignmentRepository implements HistoryAssignmentRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(operatorId: string, query: HistoryQueueQuery) {
    const scope: Prisma.VehicleHistoryRequestWhereInput = {
      ...(query.filter === "mine" ? { assignedOperatorId: operatorId } : query.filter === "unassigned"
        ? { assignedOperatorId: null } : { OR: [{ assignedOperatorId: null }, { assignedOperatorId: operatorId }] }),
      ...(query.search ? { id: { contains: query.search, mode: "insensitive" } } : {}),
    };
    const after = query.cursor ? await this.prisma.vehicleHistoryRequest.findFirst({
      where: { AND: [scope, { id: query.cursor }] }, select: { id: true, createdAt: true },
    }) : null;
    if (query.cursor && !after) throw new HistoryRequestError("HISTORY_OPERATOR_DENIED");
    const rows = await this.prisma.vehicleHistoryRequest.findMany({
      where: { AND: [scope, ...(after ? [{ OR: [
        { createdAt: { lt: after.createdAt } }, { createdAt: after.createdAt, id: { lt: after.id } },
      ] }] : [])] },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 51,
      select: { id: true, createdAt: true, assignmentVersion: true, assignedOperatorId: true },
    });
    return { items: rows.slice(0, 50).map(({ assignedOperatorId, ...row }) => ({ ...row, mine: assignedOperatorId === operatorId })),
      nextCursor: rows.length > 50 ? rows[49]?.id ?? null : null };
  }

  async claimUnassigned(operatorId: string, id: string, expectedVersion: number, confirmAuthority: () => Promise<void>) {
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM vehicle_history_requests WHERE id = ${id} FOR UPDATE`;
      // Waiting for another writer must not retain stale identity authority.
      await confirmAuthority();
      await tx.vehicleHistoryRequest.updateMany({
        where: { id, assignedOperatorId: null, assignmentVersion: expectedVersion },
        data: { assignedOperatorId: operatorId, assignmentVersion: { increment: 1 } },
      });
    });
  }

  async findAssigned(operatorId: string, id: string) {
    return this.prisma.vehicleHistoryRequest.findFirst({ where: { id, assignedOperatorId: operatorId },
      select: { id: true, createdAt: true, sourceListingId: true, assignedOperatorId: true, assignmentVersion: true } });
  }
}

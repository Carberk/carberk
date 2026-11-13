import { HistoryRequestError } from "../domain/HistoryRequestError";
import { Inject, Injectable } from "@nestjs/common";
import { PrismaService } from "@auto-tm/db";
import { type HistoryRequest, type HistoryRequestRepository } from "../domain/HistoryRequestRepository";

const select = { id: true, sourceListingId: true, createdAt: true } as const;
@Injectable()
export class PrismaHistoryRequestRepository implements HistoryRequestRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async create(input: { requesterId: string; sessionId: string; attemptKey: string; sourceListingId: string | null }): Promise<HistoryRequest> {
    const { sessionId, ...facts } = input;
    try {
      return await this.prisma.vehicleHistoryRequest.create({ data: { ...facts, creatorSessionId: sessionId }, select });
    } catch (error) {
      // The unique constraint arbitrates concurrent retries, including across API instances.
      if (!(error && typeof error === "object" && "code" in error && error.code === "P2002")) throw error;
      const original = await this.prisma.vehicleHistoryRequest.findUniqueOrThrow({
        where: { requesterId_attemptKey: { requesterId: input.requesterId, attemptKey: input.attemptKey } }, select,
      });
      if (original.sourceListingId !== input.sourceListingId) throw new HistoryRequestError("HISTORY_REQUEST_CONFLICT");
      return original;
    }
  }

  async find(requesterId: string, id: string) {
    return this.prisma.vehicleHistoryRequest.findFirst({ where: { id, requesterId }, select });
  }

  async list(requesterId: string, cursor?: string) {
    const after = cursor ? await this.find(requesterId, cursor) : null;
    if (cursor && !after) throw new HistoryRequestError("HISTORY_REQUEST_DENIED");
    const rows = await this.prisma.vehicleHistoryRequest.findMany({
      where: { requesterId, ...(after ? { OR: [
        { createdAt: { lt: after.createdAt } }, { createdAt: after.createdAt, id: { lt: after.id } },
      ] } : {}) },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 51, select,
    });
    return { items: rows.slice(0, 50), nextCursor: rows.length > 50 ? rows[49]?.id ?? null : null };
  }
}

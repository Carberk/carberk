import { Inject, Injectable } from "@nestjs/common";
import { PrismaService, type Prisma } from "@auto-tm/db";
import type { HistoryAssignmentRepository, HistoryQueueQuery, HistoryMessageRequest } from "../domain/HistoryAssignmentRepository";
import { HistoryRequestError } from "../domain/HistoryRequestError";
import { ConfigService } from "@nestjs/config";
import { Pool } from "pg";
import type { Env } from "../../../env.schema";

/** Separate from the operation pool: row-lock waiters cannot starve identity or
 * messaging. No callback timeout may release this fence before messaging settles. */
@Injectable()
export class HistoryMessageLocks {
  private readonly pool: Pool;
  constructor(@Inject(ConfigService) config: ConfigService<Env, true>) {
    this.pool = new Pool({ connectionString: config.get("DATABASE_URL", { infer: true }), max: 2, connectionTimeoutMillis: 5000 });
    this.pool.on("error", () => { /* A lost idle connection holds no request fence. */ });
  }
  async withRequest<T>(id: string, operation: (request: HistoryMessageRequest | null) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    // pg emits a checked-out connection failure on the client rather than pool.
    const connectionError = () => { /* Subsequent query/commit rejects safely. */ };
    client.on("error", connectionError);
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL lock_timeout = '5s'");
      const { rows } = await client.query<HistoryMessageRequest>(`SELECT id, "requesterId", "assignedOperatorId", "assignmentVersion"
        FROM vehicle_history_requests WHERE id = $1 FOR UPDATE`, [id]);
      const result = await operation(rows[0] ?? null);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally { client.removeListener("error", connectionError); client.release(); }
  }
  async onModuleDestroy() { await this.pool.end(); }
}

@Injectable()
export class PrismaHistoryAssignmentRepository implements HistoryAssignmentRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(HistoryMessageLocks) private readonly messageLocks: HistoryMessageLocks) {}

  withMessageLock<T>(id: string, operation: (request: HistoryMessageRequest | null) => Promise<T>): Promise<T> {
    return this.messageLocks.withRequest<T>(id, operation);
  }

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

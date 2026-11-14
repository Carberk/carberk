import { Inject, Injectable } from "@nestjs/common";
import { PrismaService, type Prisma } from "@auto-tm/db";
import type { HistoryAssignmentRepository, HistoryQueueQuery, HistoryQueueItem, HistoryMessageRequest, HistoryWaitingStore, HistoryMessageAuthority } from "../domain/HistoryAssignmentRepository";
import { assertHistoryWaitingProgress, type HistoryWaitingFacts, type HistoryWaitReason } from "../domain/HistoryWaiting";
import { HistoryRequestError } from "../domain/HistoryRequestError";
import { ConfigService } from "@nestjs/config";
import { Pool } from "pg";
import { isDeepStrictEqual } from "node:util";
import type { Env } from "../../../env.schema";
import { MESSAGE_AUTHORITY_FENCE_PORT, type MessageAuthorityFencePort } from "../../identity/identity.public";

type WaitingRow = Omit<Prisma.VehicleHistoryRequestGetPayload<true>, "publicMessageOrder" | "reminderOrder"> & {
  publicMessageOrder: string; reminderOrder: string | null;
};
function waitingFacts(row: WaitingRow): HistoryWaitingFacts {
  const outcome = row.reminderMessageId === null || row.reminderSenderId === null || row.reminderClientMessageId === null ||
    row.reminderText === null || row.reminderOrder === null || row.reminderSentAt === null ? null : {
      messageId: row.reminderMessageId, senderId: row.reminderSenderId, clientMessageId: row.reminderClientMessageId,
      text: row.reminderText, order: BigInt(row.reminderOrder), sentAt: row.reminderSentAt,
    };
  if (row.reminderUsed !== (outcome !== null)) throw new Error("Incoherent History waiting outcome");
  return {
    reason: row.waitingReason as HistoryWaitReason | null,
    since: row.waitingSince,
    version: row.waitingVersion,
    publicMessageId: row.publicMessageId,
    publicMessageOrder: BigInt(row.publicMessageOrder),
    used: row.reminderUsed,
    outcome,
    declined: row.declined,
    stopped: row.remindersStopped,
    sourceId: row.lifecycleSourceId,
    sourceVersion: row.lifecycleSourceVersion,
  };
}

/** Separate from the operation pool: row-lock waiters cannot starve identity or
 * messaging. No callback timeout may release this fence before messaging settles. */
@Injectable()
export class HistoryMessageLocks {
  private readonly pool: Pool;
  constructor(@Inject(ConfigService) config: ConfigService<Env, true>,
    @Inject(MESSAGE_AUTHORITY_FENCE_PORT) private readonly identityFence: MessageAuthorityFencePort) {
    this.pool = new Pool({ connectionString: config.get("DATABASE_URL", { infer: true }), max: 2, connectionTimeoutMillis: 5000 });
    this.pool.on("error", () => { /* A lost idle connection holds no request fence. */ });
  }
  async withRequest<T>(id: string, authority: HistoryMessageAuthority,
    operation: (request: HistoryMessageRequest | null, waiting: HistoryWaitingStore) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    let active = true;
    const assertActive = () => { if (!active) throw new Error("History waiting lock has ended"); };
    const waiting: HistoryWaitingStore = {
      read: async () => {
        assertActive();
        const { rows } = await client.query<WaitingRow>("SELECT * FROM vehicle_history_requests WHERE id = $1", [id]);
        if (!rows[0]) throw new HistoryRequestError("HISTORY_REQUEST_DENIED");
        return waitingFacts(rows[0]);
      },
      save: async (facts) => {
        assertActive();
        const previous = await waiting.read();
        if (isDeepStrictEqual(previous, facts)) return;
        assertHistoryWaitingProgress(previous, facts);
        const data = {
          waitingReason: facts.reason,
          waitingSince: facts.since,
          waitingVersion: facts.version,
          publicMessageId: facts.publicMessageId,
          publicMessageOrder: facts.publicMessageOrder,
          reminderUsed: facts.used,
          reminderMessageId: facts.outcome?.messageId ?? null,
          reminderSenderId: facts.outcome?.senderId ?? null,
          reminderClientMessageId: facts.outcome?.clientMessageId ?? null,
          reminderText: facts.outcome?.text ?? null,
          reminderOrder: facts.outcome?.order ?? null,
          reminderSentAt: facts.outcome?.sentAt ?? null,
          declined: facts.declined,
          remindersStopped: facts.stopped,
          lifecycleSourceId: facts.sourceId,
          lifecycleSourceVersion: facts.sourceVersion,
        };
        const columns = Object.keys(data).map((name, index) => `"${name}" = $${index + 2}`);
        await client.query(`UPDATE vehicle_history_requests SET ${columns.join(", ")} WHERE id = $1`, [id, ...Object.values(data)]);
      },
    };
    // pg emits a checked-out connection failure on the client rather than pool.
    const connectionError = () => { /* Subsequent query/commit rejects safely. */ };
    client.on("error", connectionError);
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL lock_timeout = '5s'");
      const { rows } = await client.query<HistoryMessageRequest>(`SELECT id, "requesterId", "assignedOperatorId", "assignmentVersion"
        FROM vehicle_history_requests WHERE id = $1 FOR UPDATE`, [id]);
      return await this.identityFence.withSession(authority, async () => {
        const result = await operation(rows[0] ?? null, waiting);
        await client.query("COMMIT");
        return result;
      });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally { active = false; client.removeListener("error", connectionError); client.release(); }
  }
  async onModuleDestroy() { await this.pool.end(); }
}

@Injectable()
export class PrismaHistoryAssignmentRepository implements HistoryAssignmentRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(HistoryMessageLocks) private readonly messageLocks: HistoryMessageLocks) {}

  withMessageLock<T>(id: string, authority: HistoryMessageAuthority,
    operation: (request: HistoryMessageRequest | null, waiting: HistoryWaitingStore) => Promise<T>): Promise<T> {
    return this.messageLocks.withRequest<T>(id, authority, operation);
  }

  async list(operatorId: string, query: HistoryQueueQuery) {
    const scope: Prisma.VehicleHistoryRequestWhereInput = {
      ...(query.filter === "mine" ? { assignedOperatorId: operatorId } : query.filter === "unassigned"
        ? { assignedOperatorId: null } : { OR: [{ assignedOperatorId: null }, { assignedOperatorId: operatorId }] }),
    };
    const select = { id: true, createdAt: true, requesterId: true, assignmentVersion: true, assignedOperatorId: true } as const;
    const after = query.cursor ? await this.prisma.vehicleHistoryRequest.findFirst({
      where: { AND: [scope, { id: query.cursor }] }, select,
    }) : null;
    if (query.cursor && !after) throw new HistoryRequestError("HISTORY_OPERATOR_DENIED");
    const rows = await this.prisma.vehicleHistoryRequest.findMany({
      where: { AND: [scope, ...(after ? [{ OR: [
        { createdAt: { lt: after.createdAt } }, { createdAt: after.createdAt, id: { lt: after.id } },
      ] }] : [])] },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 51,
      select,
    });
    return { items: rows.slice(0, 50), anchor: after, nextCursor: rows.length > 50 ? rows[49]?.id ?? null : null };
  }

  async confirmQueue(operatorId: string, query: HistoryQueueQuery, items: HistoryQueueItem[]) {
    if (!items.length) return;
    const count = await this.prisma.vehicleHistoryRequest.count({ where: {
      AND: [{ OR: items.map(({ id, assignmentVersion, assignedOperatorId }) => ({ id, assignmentVersion, assignedOperatorId })) },
        query.filter === "mine" ? { assignedOperatorId: operatorId } : query.filter === "unassigned"
          ? { assignedOperatorId: null } : { OR: [{ assignedOperatorId: null }, { assignedOperatorId: operatorId }] }],
    } });
    if (count !== items.length) throw new HistoryRequestError("HISTORY_ASSIGNMENT_CONFLICT");
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
      select: { id: true, requesterId: true, createdAt: true, sourceListingId: true, assignedOperatorId: true, assignmentVersion: true } });
  }
}

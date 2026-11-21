import { randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Pool } from "pg";
import type { Env } from "../../../env.schema";
import { MESSAGE_AUTHORITY_FENCE_PORT, type MessageAuthorityFencePort } from "../../identity/identity.public";
import type { HistoryPrivateFile, HistoryPrivateFileRepository, HistoryPrivateFileStore, HistoryFileAuthority } from "../domain/HistoryPrivateFile";
import type { HistoryMessageRequest } from "../domain/HistoryAssignmentRepository";

@Injectable()
export class PrismaHistoryPrivateFiles implements HistoryPrivateFileRepository {
  private readonly pool: Pool;
  constructor(@Inject(ConfigService) config: ConfigService<Env, true>,
    @Inject(MESSAGE_AUTHORITY_FENCE_PORT) private readonly fence: MessageAuthorityFencePort) {
    this.pool = new Pool({ connectionString: config.get("DATABASE_URL", { infer: true }), max: 2, connectionTimeoutMillis: 5000 });
    this.pool.on("error", () => undefined);
  }
  async run<T>(requestId: string, authority: HistoryFileAuthority | null,
    work: (request: HistoryMessageRequest | null, files: HistoryPrivateFileStore) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    const connectionError = () => undefined;
    client.on("error", connectionError);
    let active = true;
    const check = () => { if (!active) throw new Error("Private file transaction ended"); };
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL lock_timeout = '5s'");
      const requests = await client.query<HistoryMessageRequest>(`SELECT id, "requesterId", "assignedOperatorId", "assignmentVersion"
        FROM vehicle_history_requests WHERE id = $1 FOR NO KEY UPDATE`, [requestId]);
      const one = async (column: "id" | "attemptKey", value: string) => {
        check();
        return (await client.query<HistoryPrivateFile>(`SELECT * FROM history_private_files WHERE "requestId" = $1 AND "${column}" = $2`, [requestId, value])).rows[0] ?? null;
      };
      const files: HistoryPrivateFileStore = {
        async orderId() {
          check(); return (await client.query<{ id: string }>('SELECT id FROM vehicle_history_orders WHERE "requestId" = $1', [requestId])).rows[0]?.id ?? null;
        },
        attempt: (key) => one("attemptKey", key), find: (id) => one("id", id),
        async list() {
          check(); return (await client.query<HistoryPrivateFile>(`SELECT * FROM history_private_files WHERE "requestId" = $1 AND status <> 'deleted' ORDER BY "createdAt", id`, [requestId])).rows;
        },
        async create(input, now) {
          check();
          const row = await client.query<HistoryPrivateFile>(`INSERT INTO history_private_files
            (id, "requestId", "orderId", "attemptKey", purpose, policy, "contentType", "sizeBytes", "createdAt", "expiresAt")
            VALUES ($1, $2, $3, $4, 'payment_evidence', 'synthetic_payment_evidence_only', $5, $6, $7, $8) RETURNING *`,
          [randomUUID(), requestId, input.orderId, input.attemptKey, input.contentType, input.sizeBytes, now, new Date(now.getTime() + 86_400_000)]);
          const file = row.rows[0];
          if (!file) throw new Error("Private file staging failed");
          return file;
        },
        async save(file) {
          check(); await client.query(`UPDATE history_private_files SET status = $3, sha256 = $4, "submittedAt" = $5 WHERE "requestId" = $1 AND id = $2`,
            [requestId, file.id, file.status, file.sha256, file.submittedAt]);
        },
        async audit(actorId, sessionId, file, reason) {
          check(); await client.query(`INSERT INTO audit_logs (id, "actorId", action, "targetType", "targetId", details, "createdAt")
            VALUES ($1, $2, 'history.payment_evidence.read', 'HistoryPrivateFile', $3, $4::jsonb, now())`,
          [randomUUID(), actorId, file.id, JSON.stringify({ requestId, orderId: file.orderId, sessionId, purpose: "payment_evidence", reason })]);
        },
      };
      const complete = async () => { const result = await work(requests.rows[0] ?? null, files); await client.query("COMMIT"); return result; };
      return await (authority ? this.fence.withSession({ ...authority, ...(requests.rows[0] ? { recipientId: requests.rows[0].requesterId } : {}) }, complete) : complete());
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally { active = false; client.removeListener("error", connectionError); client.release(); }
  }
  async expired(now: Date) {
    return (await this.pool.query<{ requestId: string; id: string }>(`SELECT "requestId", id FROM history_private_files
      WHERE status IN ('pending', 'uploaded') AND "expiresAt" <= $1 ORDER BY "expiresAt", id LIMIT 50`, [now])).rows;
  }
  async onModuleDestroy() { await this.pool.end(); }
}

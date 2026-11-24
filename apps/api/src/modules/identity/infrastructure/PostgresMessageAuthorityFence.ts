import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Pool, type PoolClient } from "pg";
import type { Env } from "../../../env.schema";
import type { MessageAuthorityFencePort } from "../domain/ports/MessageAuthorityFencePort";

@Injectable()
export class PostgresMessageAuthorityFence implements MessageAuthorityFencePort {
  private readonly pool: Pool;
  constructor(@Inject(ConfigService) config: ConfigService<Env, true>) {
    // Waiters never occupy the pool used by identity reads or message commits.
    this.pool = new Pool({ connectionString: config.get("DATABASE_URL", { infer: true }), max: 2, connectionTimeoutMillis: 5000 });
    this.pool.on("error", () => undefined);
  }
  withUserLifecycle<T>(userId: string, work: () => Promise<T>): Promise<T> {
    return this.withLockedUsers([userId], work);
  }
  withSession<T>({ userId, sessionId, purpose, recipientId, requesterId }: Parameters<MessageAuthorityFencePort["withSession"]>[0],
    work: () => Promise<T>): Promise<T> {
    const users = recipientId ? [userId, recipientId] : [userId];
    return this.withLockedUsers(requesterId ? [...users, requesterId] : users, async (client) => {
      await client.query('SELECT id FROM sessions WHERE id = $1 AND "userId" = $2 FOR SHARE', [sessionId, userId]);
      if (purpose) await client.query('SELECT "userId" FROM staff_grants WHERE "userId" = ANY($1::text[]) AND purpose = $2::"StaffPurpose" ORDER BY "userId" FOR SHARE', [users, purpose]);
      return work();
    });
  }
  private async withLockedUsers<T>(userIds: string[], work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    const connectionError = () => { /* Query/commit reports connection failure. */ };
    client.on("error", connectionError);
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL lock_timeout = '5s'");
      await client.query("SELECT id FROM users WHERE id = ANY($1::text[]) ORDER BY id FOR SHARE", [userIds]);
      const result = await work(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally { client.removeListener("error", connectionError); client.release(); }
  }
  async onModuleDestroy() { await this.pool.end(); }
}

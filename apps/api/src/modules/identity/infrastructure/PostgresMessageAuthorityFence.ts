import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Pool } from "pg";
import type { Env } from "../../../env.schema";
import type { MessageAuthorityFencePort } from "../domain/ports/MessageAuthorityFencePort";

@Injectable()
export class PostgresMessageAuthorityFence implements MessageAuthorityFencePort {
  private readonly pool: Pool;
  constructor(@Inject(ConfigService) config: ConfigService<Env, true>) {
    // Waiters never occupy the pool used by identity reads or message commits.
    this.pool = new Pool({ connectionString: config.get("DATABASE_URL", { infer: true }), max: 2, connectionTimeoutMillis: 5000 });
    this.pool.on("error", () => { /* Idle connection failures retain no fence. */ });
  }
  async withSession<T>({ userId, sessionId, purpose }: Parameters<MessageAuthorityFencePort["withSession"]>[0], work: () => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    const connectionError = () => { /* Query/commit reports connection failure. */ };
    client.on("error", connectionError);
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL lock_timeout = '5s'");
      // Same User -> Session -> Grant order as identity's grant management.
      // SHARE blocks revocation/lifecycle writes but permits message FK checks.
      await client.query("SELECT id FROM users WHERE id = $1 FOR SHARE", [userId]);
      await client.query('SELECT id FROM sessions WHERE id = $1 AND "userId" = $2 FOR SHARE', [sessionId, userId]);
      if (purpose) await client.query('SELECT "userId" FROM staff_grants WHERE "userId" = $1 AND purpose = $2::"StaffPurpose" FOR SHARE', [userId, purpose]);
      const result = await work();
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally { client.removeListener("error", connectionError); client.release(); }
  }
  async onModuleDestroy() { await this.pool.end(); }
}

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const directory = new URL("../prisma/migrations", import.meta.url).pathname;
describe("Additive History assignment migration", () => {
  let container: StartedPostgreSqlContainer, db: Client;
  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:17-alpine").start();
    db = new Client({ connectionString: container.getConnectionUri() });
    await db.connect();
    const migrations = readdirSync(directory).filter((name) => /^\d/.test(name)).sort();
    const apply = async (names: string[]) => {
      for (const name of names) await db.query(readFileSync(join(directory, name, "migration.sql"), "utf8"));
    };
    await apply(migrations.filter((name) => name < "20261114030000"));
    await db.query(`INSERT INTO users (id, "updatedAt") VALUES ('customer', now()), ('operator', now());
      INSERT INTO vehicle_history_requests (id, "requesterId", "attemptKey", "creatorSessionId", "sourceListingId")
      VALUES ('legacy', 'customer', '10000000-0000-4000-8000-000000000001', 'original-session', '10000000-0000-4000-8000-000000000002')`);
    await apply(migrations.filter((name) => name >= "20261114030000"));
  });
  afterAll(async () => { await db?.end(); await container?.stop(); });

  it("preserves the existing enquiry and defaults it to unassigned version zero", async () => {
    expect((await db.query(`SELECT id, "requesterId", "attemptKey", "creatorSessionId", "sourceListingId",
      "assignedOperatorId", "assignmentVersion" FROM vehicle_history_requests`)).rows).toEqual([{
      id: "legacy", requesterId: "customer", attemptKey: "10000000-0000-4000-8000-000000000001",
      creatorSessionId: "original-session", sourceListingId: "10000000-0000-4000-8000-000000000002",
      assignedOperatorId: null, assignmentVersion: 0,
    }]);
  });
  it("refuses incoherent versions and nonexistent assignees while preserving assigned identity references", async () => {
    for (const [id, version] of [[null, 1], ["operator", 0], ["operator", -1]] as const) {
      await expect(db.query('UPDATE vehicle_history_requests SET "assignedOperatorId" = $1, "assignmentVersion" = $2', [id, version]))
        .rejects.toMatchObject({ code: "23514" });
    }
    await expect(db.query(`UPDATE vehicle_history_requests SET "assignedOperatorId" = 'absent', "assignmentVersion" = 1`))
      .rejects.toMatchObject({ code: "23503" });
    await db.query(`UPDATE vehicle_history_requests SET "assignedOperatorId" = 'operator', "assignmentVersion" = 1`);
    await expect(db.query(`DELETE FROM users WHERE id = 'operator'`)).rejects.toMatchObject({ code: "23503" });
  });
});

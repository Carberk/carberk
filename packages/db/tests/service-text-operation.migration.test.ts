import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Client } from "pg";
import { afterAll, beforeAll, expect, it } from "vitest";

const directory = new URL("../prisma/migrations", import.meta.url).pathname;
const columnMigration = "20261115010000_service_text_operation";
const indexMigration = "20261115010100_service_text_operation_unique";
let container: StartedPostgreSqlContainer, db: Client;
let legacy: Record<string, unknown>[];

beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:17-alpine").start();
  db = new Client({ connectionString: container.getConnectionUri() });
  await db.connect();
  for (const name of readdirSync(directory).filter((name) => /^\d/.test(name) && name < columnMigration).sort()) {
    await db.query(readFileSync(join(directory, name, "migration.sql"), "utf8"));
  }
  await db.query(`INSERT INTO users (id, "updatedAt") VALUES ('author-a', now()), ('author-b', now());
    INSERT INTO service_conversations (id, purpose, "objectId", "lastOrder")
      VALUES ('stream-a', 'vehicle_history', 'object-a', 1), ('stream-b', 'vehicle_history', 'object-b', 0);
    INSERT INTO service_messages (id, "conversationId", "senderId", "clientMessageId", text, "streamOrder", "createdAt")
      VALUES ('legacy', 'stream-a', 'author-a', 'legacy-intent', E'  Salam\nDünýä  ', 1, '2026-11-14T01:02:03.456Z')`);
  legacy = (await db.query("SELECT * FROM service_messages")).rows;
  await db.query(readFileSync(join(directory, columnMigration, "migration.sql"), "utf8"));
  // Separate calls, no BEGIN: a real concurrent index build rejects transaction wrappers.
  await db.query(readFileSync(join(directory, indexMigration, "migration.sql"), "utf8"));
});
afterAll(async () => { await db?.end(); await container?.stop({ removeVolumes: false }); });

it("preserves every legacy byte and nullable ordinary sends across both migrations", async () => {
  expect((await db.query("SELECT * FROM service_messages")).rows)
    .toEqual(legacy.map((row) => ({ ...row, operationKey: null })));
  for (const [id, sender, order] of [["normal-a", "author-a", 2], ["normal-b", "author-b", 3]]) {
    await db.query(`INSERT INTO service_messages (id, "conversationId", "senderId", "clientMessageId", text, "streamOrder")
      VALUES ($1, 'stream-a', $2, $1, E'  Ordinary\ntext  ', $3)`, [id, sender, order]);
  }
  expect((await db.query(`SELECT id, "operationKey", text FROM service_messages WHERE id LIKE 'normal-%' ORDER BY id`)).rows)
    .toEqual([
      { id: "normal-a", operationKey: null, text: "  Ordinary\ntext  " },
      { id: "normal-b", operationKey: null, text: "  Ordinary\ntext  " },
    ]);
  expect((await db.query(`SELECT is_nullable, column_default FROM information_schema.columns
    WHERE table_name = 'service_messages' AND column_name = 'operationKey'`)).rows)
    .toEqual([{ is_nullable: "YES", column_default: null }]);
});

it("enforces one operation across senders while preserving other streams and ordinary intent uniqueness", async () => {
  await db.query(`INSERT INTO service_messages
    (id, "conversationId", "senderId", "clientMessageId", text, "streamOrder", "operationKey")
    VALUES ('once-a', 'stream-a', 'author-a', 'attempt-a', 'Once', 4, 'operation')`);
  await expect(db.query(`INSERT INTO service_messages
    (id, "conversationId", "senderId", "clientMessageId", text, "streamOrder", "operationKey")
    VALUES ('duplicate', 'stream-a', 'author-b', 'attempt-b', 'Once', 5, 'operation')`))
    .rejects.toMatchObject({ code: "23505", constraint: "service_messages_conversationId_operationKey_key" });
  await db.query(`INSERT INTO service_messages
    (id, "conversationId", "senderId", "clientMessageId", text, "streamOrder", "operationKey")
    VALUES ('once-b', 'stream-b', 'author-b', 'attempt-b', 'Once', 1, 'operation')`);
  await expect(db.query(`INSERT INTO service_messages
    (id, "conversationId", "senderId", "clientMessageId", text, "streamOrder")
    VALUES ('reused-intent', 'stream-a', 'author-a', 'legacy-intent', 'Changed', 5)`))
    .rejects.toMatchObject({ code: "23505", constraint: "service_messages_conversationId_senderId_clientMessageId_key" });
  expect((await db.query(`SELECT id FROM service_messages WHERE "operationKey" = 'operation' ORDER BY id`)).rows)
    .toEqual([{ id: "once-a" }, { id: "once-b" }]);
  expect((await db.query(`SELECT indisunique, indisvalid, indisready FROM pg_index
    WHERE indexrelid = '"service_messages_conversationId_operationKey_key"'::regclass`)).rows)
    .toEqual([{ indisunique: true, indisvalid: true, indisready: true }]);
});

it("deploys the full immutable history without a custom transaction wrapper and has no schema drift", async () => {
  await db.query("CREATE DATABASE fresh_operation");
  const url = new URL(container.getConnectionUri()); url.pathname = "/fresh_operation";
  const run = (args: string[]) => execFileSync("pnpm", ["exec", "prisma", ...args], {
    cwd: new URL("..", import.meta.url).pathname,
    env: { ...process.env, DATABASE_URL: url.toString() }, encoding: "utf8", stdio: "pipe",
  });
  expect(run(["migrate", "deploy"])).toContain("All migrations have been successfully applied");
  expect(run(["migrate", "deploy"])).toContain("No pending migrations");
  expect(run(["migrate", "diff", "--from-config-datasource", "--to-schema", "prisma/schema.prisma", "--exit-code"]))
    .toContain("No difference detected");
});

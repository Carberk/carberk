import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Client } from "pg";
import { afterAll, beforeAll, expect, it } from "vitest";

const directory = new URL("../prisma/migrations", import.meta.url).pathname;
const migration = "20261115020000_history_waiting_facts";
let container: StartedPostgreSqlContainer, db: Client;
let legacy: Record<string, unknown>[];
beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:17-alpine").start();
  db = new Client({ connectionString: container.getConnectionUri() });
  await db.connect();
  for (const name of readdirSync(directory).filter((name) => /^\d/.test(name) && name < migration).sort()) {
    await db.query(readFileSync(join(directory, name, "migration.sql"), "utf8"));
  }
  await db.query(`INSERT INTO users (id, "updatedAt") VALUES ('customer', now()), ('operator', now());
    INSERT INTO vehicle_history_requests
      (id, "requesterId", "attemptKey", "creatorSessionId", "sourceListingId", "createdAt", "assignedOperatorId", "assignmentVersion")
    VALUES ('legacy-a', 'customer', '10000000-0000-4000-8000-000000000001', 'original-session',
        '10000000-0000-4000-8000-000000000003', '2026-11-14T01:02:03.456Z', 'operator', 7),
      ('legacy-b', 'customer', '10000000-0000-4000-8000-000000000002', 'other-session', null,
        '2026-11-14T04:05:06.789Z', null, 0)`);
  legacy = (await db.query("SELECT * FROM vehicle_history_requests ORDER BY id")).rows;
  await db.query(readFileSync(join(directory, migration, "migration.sql"), "utf8"));
});
afterAll(async () => { await db?.end(); await container?.stop({ removeVolumes: false }); });

it("preserves every assigned/unassigned legacy fact without inventing a waiting time", async () => {
  expect((await db.query("SELECT * FROM vehicle_history_requests ORDER BY id")).rows).toEqual(legacy.map((row) => ({
    ...row, waitingReason: null, waitingSince: null, waitingVersion: 0, publicMessageId: null, publicMessageOrder: "0",
    reminderUsed: false, reminderMessageId: null, reminderSenderId: null, reminderClientMessageId: null,
    reminderText: null, reminderOrder: null, reminderSentAt: null, declined: false, remindersStopped: false,
    lifecycleSourceId: null, lifecycleSourceVersion: 0,
  })));
});

it("refuses incoherent waiting/checkpoint/source/outcome combinations", async () => {
  for (const change of [
    `"waitingReason" = 'customer_answer'`, `"waitingSince" = now()`, `"waitingVersion" = -1`,
    `"waitingReason" = 'unknown', "waitingSince" = now(), "waitingVersion" = 1`,
    `"waitingReason" = 'quote_choice', "waitingSince" = now()`,
    `"publicMessageOrder" = 1`, `"publicMessageId" = 'checkpoint'`, `"publicMessageOrder" = -1`,
    `"lifecycleSourceId" = 'source'`, `"lifecycleSourceVersion" = 1`, `"lifecycleSourceVersion" = -1`,
    `"reminderUsed" = true`, `"reminderMessageId" = 'partial'`,
    `"reminderUsed" = true, "reminderMessageId" = 'm', "reminderSenderId" = 's',
      "reminderClientMessageId" = 'c', "reminderText" = 'notice', "reminderOrder" = 0, "reminderSentAt" = now()`,
  ]) {
    await expect(db.query(`UPDATE vehicle_history_requests SET ${change} WHERE id = 'legacy-a'`))
      .rejects.toMatchObject({ code: "23514" });
  }
});

it("stores coherent UTC millisecond facts and the exact original outcome without altering assignment", async () => {
  await db.query(`UPDATE vehicle_history_requests SET "waitingReason" = 'quote_choice',
    "waitingSince" = '2026-11-14T23:59:59.123Z', "waitingVersion" = 4,
    "publicMessageId" = 'checkpoint', "publicMessageOrder" = 9, "reminderUsed" = true,
    "reminderMessageId" = 'original', "reminderSenderId" = 'operator', "reminderClientMessageId" = 'intent',
    "reminderText" = E'  Salam\nDünýä  ', "reminderOrder" = 8, "reminderSentAt" = '2026-11-14T10:11:12.345Z',
    declined = true, "remindersStopped" = true, "lifecycleSourceId" = 'quote', "lifecycleSourceVersion" = 2
    WHERE id = 'legacy-a'`);
  expect((await db.query(`SELECT "waitingSince", "waitingVersion", "reminderText", "reminderSentAt",
    "reminderOrder", declined, "remindersStopped", "assignedOperatorId", "assignmentVersion"
    FROM vehicle_history_requests WHERE id = 'legacy-a'`)).rows).toEqual([{
    waitingSince: new Date("2026-11-14T23:59:59.123Z"), waitingVersion: 4, reminderText: "  Salam\nDünýä  ",
    reminderSentAt: new Date("2026-11-14T10:11:12.345Z"), reminderOrder: "8", declined: true,
    remindersStopped: true, assignedOperatorId: "operator", assignmentVersion: 7,
  }]);
});

it("deploys all committed migrations, reports current status and has no Prisma schema drift", async () => {
  await db.query("CREATE DATABASE fresh_waiting");
  const url = new URL(container.getConnectionUri()); url.pathname = "/fresh_waiting";
  const run = (args: string[]) => execFileSync("pnpm", ["exec", "prisma", ...args], {
    cwd: new URL("..", import.meta.url).pathname,
    env: { ...process.env, DATABASE_URL: url.toString() }, encoding: "utf8", stdio: "pipe",
  });
  expect(run(["migrate", "deploy"])).toContain("All migrations have been successfully applied");
  expect(run(["migrate", "status"])).toContain("Database schema is up to date");
  expect(run(["migrate", "deploy"])).toContain("No pending migrations");
  expect(run(["migrate", "diff", "--from-config-datasource", "--to-schema", "prisma/schema.prisma", "--exit-code"]))
    .toContain("No difference detected");
});

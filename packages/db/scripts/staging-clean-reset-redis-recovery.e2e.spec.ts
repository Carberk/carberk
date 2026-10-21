import { spawnSync, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { runInNewContext } from "node:vm";

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Client, Pool } from "pg";
import { GenericContainer, type StartedTestContainer } from "testcontainers";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type * as BullModule from "../../../apps/worker/node_modules/bullmq";
import type * as RedisModule from "../../../apps/worker/node_modules/ioredis";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const root = fileURLToPath(new URL("../../..", import.meta.url));
const localRequire = createRequire(import.meta.url);
const workerRequire = createRequire(new URL("../../../apps/worker/package.json", import.meta.url));
const bull = workerRequire("bullmq") as typeof BullModule;
const Redis = (workerRequire("ioredis") as typeof RedisModule).Redis;
// Same independent literal inventory and real BullMQ lifecycle fixture as the inventory spec.
const queueNames = ["video-transcode", "notification-fanout", "orphan-cleanup", "account-purge", "retired-upload-cleanup",
  "listing-view-retention", "measurement-retention", "measurement-outbox", "service-lifecycle", "service-push", "diagnostic-artifacts", "email-code"];
const candidate = "c".repeat(40), operationId = "e".repeat(32), reservationId = "f".repeat(32);
const markerKey = `staging-clean-reset:receipt:${operationId}`;
const identity = { projectId: "176ddec0-dd65-4087-b82c-798599fc2ebe", environmentId: "652abc79-fdb0-48b0-9f6c-ad0ff572d7b2",
  services: { api: "6db6f1b1-5c7a-4033-88d0-53f5f315bfc0", worker: "24aa02e0-25a9-4e80-9cc2-c1795ef82091" },
  origins: { database: "postgresql://postgres.railway.internal:5432/railway", redis: "redis://redis.railway.internal:6379/0" } };
const environment = () => ({ RAILWAY_PROJECT_ID: identity.projectId, RAILWAY_ENVIRONMENT_ID: identity.environmentId,
  RAILWAY_SERVICE_ID: identity.services.api, RAILWAY_ENVIRONMENT_NAME: "staging", APP_ENV: "staging", AUTOTM_COMMIT_SHA: candidate,
  DATABASE_URL: "postgresql://u:disposable-db-secret@postgres.railway.internal:5432/railway",
  REDIS_URL: "redis://:disposable-redis-secret@redis.railway.internal:6379/0" });
// Explicitly synthetic recorded controller context, like the synthetic target env above.
// This does NOT prove lease ownership, elapsed live closure, deployment status or safe live execution.
const binding = { owner: "operator-901", leaseCommit: "a".repeat(40),
  window: { operationId, candidate, closedAt: "2026-10-21T00:00:00.000Z", observedAt: "2026-10-21T00:15:00.000Z", elapsedSeconds: 900 },
  deployments: { api: [{ id: "api-deployment", status: "SUCCESS", sha: candidate }], worker: [{ id: "worker-deployment", status: "SUCCESS", sha: candidate }] } };
const base = { operation: "clean-reset", operationId, reservationId, candidate };
const pgRequest = (phase: string, expectedInventory?: unknown) => ({ ...base, phase,
  identity: { ...identity, origins: { database: identity.origins.database } }, ...(expectedInventory === undefined ? {} : { expectedInventory }) });
const redisInventoryRequest = () => ({ ...base, phase: "redis-inventoried", identity: structuredClone(identity) });
const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const hex64 = expect.stringMatching(/^[a-f0-9]{64}$/);
const digestShape = { schema: hex64, retained: hex64, disposable: hex64 };
const privateValue = "PRIVATE-OTP-654321-person@example.invalid";
const redacted = (value: unknown) => expect(JSON.stringify(value)).not.toMatch(/PRIVATE-OTP|654321|person@example|disposable-.*-secret|retain-secret|bull:|identity:reserved|redis:\/\/:|postgresql:\/\/u:/);
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).sort().map(key => `${JSON.stringify(key)}:${canonical(object[key])}`).join(",")}}`;
  }
  const encoded = JSON.stringify(value);
  if (encoded === undefined) throw new Error("Non-JSON receipt value");
  return encoded;
}
type RecordValue = Record<string, unknown>;
type Outcome = { code: number; failure: string; receipt?: RecordValue; sqlDiagnostics: string[] };

// Only the existing serialized program is executed. Real PG/Redis transports are remapped;
// no repository module, committed effect, rows receipt or future success state is faked.
describe("bounded Redis completion and completed-state recovery on disposable PostgreSQL and Redis", () => {
  let postgres: StartedPostgreSqlContainer;
  let redisContainer: StartedTestContainer;
  let databaseUrl: string;
  let admin: Pool;
  let redis: InstanceType<typeof Redis>;
  let monitor: InstanceType<typeof Redis>;
  let redisWrites = 0, fenceSequence = 0;
  const fences = new Map<string, () => void>();
  let connection: { host: string; port: number; password: string; maxRetriesPerRequest: null };
  let cleanResetProgram: (payload: unknown) => string;

  async function query(sql: string, values: unknown[] = []): Promise<RecordValue[]> {
    const client = new Client({ connectionString: databaseUrl });
    await client.connect();
    try { return (await client.query(sql, values)).rows as RecordValue[]; } finally { await client.end(); }
  }
  async function settle() {
    for (let attempt = 0; attempt < 100; attempt++) {
      const result = await admin.query("SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname=$1 AND backend_type='client backend'", [postgres.getDatabase()]);
      if (result.rows[0]?.count === 0) return;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error("Disposable target database did not settle");
  }
  async function storedRows() {
    return (await query("SELECT to_jsonb(r) AS value FROM staging_clean_reset.receipts r ORDER BY operation_id")).map(row => row["value"] as RecordValue);
  }
  async function storedRow() {
    const rows = await storedRows();
    expect(rows).toHaveLength(1);
    const row = rows[0];
    if (!row) throw new Error("Actual S2A receipt missing");
    return row;
  }
  // Keep committed_at in the independent immutability check, but never in the receipt digest.
  const immutable = (row: RecordValue) => Object.fromEntries(Object.entries(row).filter(([key]) => key !== "redis_state"));
  function rowsProjection(row: RecordValue) {
    const projection = Object.fromEntries(["operation_id", "reservation_id", "candidate", "project_id", "environment_id", "phase", "expected", "result"]
      .map(key => [key, row[key]]));
    expect(projection).toEqual({ operation_id: operationId, reservation_id: reservationId, candidate, project_id: identity.projectId,
      environment_id: identity.environmentId, phase: "rows", expected: digestShape, result: digestShape });
    expect(Object.keys(row).sort()).toEqual([...Object.keys(projection), "committed_at", ...(Object.hasOwn(row, "redis_state") ? ["redis_state"] : [])].sort());
    redacted(projection);
    return projection;
  }
  async function snapshotRedis() {
    const entries = [];
    for (const key of (await redis.keys("*")).sort()) {
      const dump = await redis.dumpBuffer(key);
      if (!dump) throw new Error("Disposable Redis changed during independent snapshot");
      entries.push({ keyDigest: hash(key), bytesDigest: hash(dump), expiresAt: Number(await redis.call("PEXPIRETIME", key)) });
    }
    return { entries, config: hash(JSON.stringify(await redis.config("GET", "requirepass", "maxmemory-policy", "appendonly"))) };
  }
  async function writeCount() {
    const token = `recovery-read-fence-${++fenceSequence}`;
    // The real server's MONITOR stream provides a fence after all preceding commands.
    // Retain a write count only, never command arguments, keys or job payloads.
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => { fences.delete(token); reject(new Error("Disposable Redis monitor fence missing")); }, 5000);
      fences.set(token, () => { clearTimeout(timeout); fences.delete(token); resolve(); });
      void redis.echo(token).catch(() => { clearTimeout(timeout); fences.delete(token); reject(new Error("Disposable Redis fence failed")); });
    });
    return redisWrites;
  }
  async function snapshot() {
    return { redis: await snapshotRedis(),
      pg: hash(canonical(await query("SELECT to_jsonb(r) AS value, xmin::text AS version, ctid::text AS location FROM staging_clean_reset.receipts r ORDER BY operation_id"))),
      writes: await writeCount() };
  }
  function receiptOf(result: Outcome) {
    expect({ code: result.code, failure: result.failure, sqlDiagnostics: result.sqlDiagnostics }).toEqual({ code: 0, failure: "", sqlDiagnostics: [] });
    expect(result.receipt).toBeDefined();
    if (!result.receipt) throw new Error("Actual fixed-program receipt missing");
    redacted(result.receipt);
    return result.receipt;
  }

  async function run(payload: unknown, env: Record<string, string> = environment(), dropCompletedOutput = false): Promise<Outcome> {
    await settle();
    const outcome: Outcome = { code: 0, failure: "", sqlDiagnostics: [] };
    const process = { env, exitCode: 0 };
    const clients: { disconnect: () => void }[] = [];
    const remap = (args: unknown[]) => {
      const [first, second] = args;
      const target = { host: connection.host, port: connection.port, password: connection.password };
      if (typeof first === "string") {
        if (first !== env["REDIS_URL"]) throw new Error("Unexpected Redis transport URL");
        return { ...(second && typeof second === "object" ? second : {}), ...target };
      }
      if (!first || typeof first !== "object") throw new Error("Unexpected Redis transport options");
      const options = first as RecordValue;
      if (options["url"] !== env["REDIS_URL"] && (options["host"] !== "redis.railway.internal" || Number(options["port"] ?? 6379) !== 6379))
        throw new Error("Unexpected Redis transport target");
      if (Number(options["db"] ?? 0) !== 0) throw new Error("Unexpected Redis transport database");
      return { ...options, url: undefined, ...target };
    };
    class TransportRedis extends Redis {
      constructor(...args: unknown[]) { super(remap(args)); clients.push(this); }
    }
    class TransportQueue extends bull.Queue {
      constructor(name: string, options: ConstructorParameters<typeof bull.Queue>[1]) {
        const supplied = options?.connection;
        if (!supplied || typeof supplied !== "object") throw new Error("Missing Redis transport");
        super(name, { ...options, connection: supplied instanceof Redis ? supplied : remap([supplied]) });
        clients.push({ disconnect: () => { void this.disconnect(); } });
      }
    }
    const redisModule = Object.defineProperties(TransportRedis, { Redis: { value: TransportRedis }, default: { value: TransportRedis } });
    const require = (name: string) => {
      if (name === "ioredis") return redisModule;
      if (name === "bullmq") return { ...bull, Queue: TransportQueue };
      if (name === "bullmq/package.json") return workerRequire(name);
      if (name === "node:child_process") return {
        spawnSync: (command: string, _args: string[], options: { input: string }) => {
          if (command !== "psql") throw new Error("Unsupported remote subprocess");
          const result = spawnSync(globalThis.process.execPath, [`${root}/scripts/testing/query-disposable-postgres.cjs`], {
            input: options.input, encoding: "utf8", timeout: 30000, env: { ...globalThis.process.env,
              STAGING_CONTROL_TEST_DATABASE_URL: databaseUrl, STAGING_TEST_DB_PACKAGE: `${packageRoot}/package.json`, STAGING_TEST_SQL_DIAGNOSTICS: "1" },
          });
          // Bounded SQLSTATE metadata only. Do not print SQL, stderr, connection values or rows.
          const diagnostic = result.stderr?.split(/\r?\n/).find(line => /^Disposable database SQL diagnostic: SQLSTATE=[A-Z0-9]{5}(?: position=[0-9]{1,10})?(?: internalPosition=[0-9]{1,10})?$/.test(line));
          if (diagnostic) outcome.sqlDiagnostics.push(diagnostic);
          return result;
        },
      };
      return localRequire(name);
    };
    try {
      await runInNewContext(cleanResetProgram(payload), { URL, Buffer, process, require, setTimeout, clearTimeout, console: {
        log: (line: string) => {
          const receipt = JSON.parse(line) as RecordValue;
          // Drop only actual final stdout after the real program has completed its effects.
          // This does not simulate the Lua/PG gap and supplies no receipt to the executor.
          if (dropCompletedOutput && receipt["phase"] === "redis") return;
          if (outcome.receipt) throw new Error("Multiple fixed-program receipts");
          outcome.receipt = receipt;
        },
        error: (line: string) => { outcome.failure += line; },
      } });
      outcome.code = process.exitCode;
      return outcome;
    } finally { for (const client of clients) client.disconnect(); }
  }
  async function refuses(payload: unknown, env = environment()) {
    const before = await snapshot();
    const result = await run(payload, env);
    expect(await snapshot()).toEqual(before);
    expect(result.code).toBe(1);
    expect(result.failure).toMatch(/^Clean reset refused/);
    expect(result.receipt).toBeUndefined();
    redacted(result);
  }

  beforeAll(async () => {
    ({ cleanResetProgram } = await import(pathToFileURL(`${root}/scripts/staging-clean-reset-remote.mjs`).href));
    expect(workerRequire("bullmq/package.json").version).toBe("5.76.8");
    postgres = await new PostgreSqlContainer("postgres:16-alpine").start();
    databaseUrl = postgres.getConnectionUri();
    const maintenance = new URL(databaseUrl); maintenance.pathname = "/postgres";
    admin = new Pool({ connectionString: maintenance.toString(), max: 1 });
    execFileSync("pnpm", ["prisma", "migrate", "deploy"], { cwd: packageRoot, env: { ...process.env, DATABASE_URL: databaseUrl }, stdio: "pipe" });
    await query(`INSERT INTO users(id,"displayName","updatedAt") VALUES('redis-reset-user','Disposable',now());
      INSERT INTO measurement_state(key,epoch) VALUES('global','redis-recovery-reference');`);
    redisContainer = await new GenericContainer("redis:7-alpine").withExposedPorts(6379)
      .withCommand(["redis-server", "--requirepass", "disposable-redis-secret", "--appendonly", "no"]).start();
    connection = { host: redisContainer.getHost(), port: redisContainer.getMappedPort(6379), password: "disposable-redis-secret", maxRetriesPerRequest: null };
    redis = new Redis(connection);
    expect(await redis.ping()).toBe("PONG");
    const queues = queueNames.map(name => new bull.Queue(name, { connection }));
    try {
      await Promise.all(queues.map(queue => queue.waitUntilReady()));
      const email = queues.find(queue => queue.name === "email-code");
      if (!email) throw new Error("Disposable email queue missing");
      const worker = new bull.Worker("email-code", undefined, { connection, autorun: false, skipStalledCheck: true });
      try {
        await email.add("disposable", { privateValue }, { jobId: "terminal-completed" });
        const completed = await worker.getNextJob("complete-token", { block: false });
        await completed.moveToCompleted({ privateValue }, "complete-token", false);
        await email.add("disposable", { privateValue }, { jobId: "terminal-failed" });
        const failed = await worker.getNextJob("fail-token", { block: false });
        await failed.moveToFailed(new Error(privateValue), "fail-token", false);
      } finally { await worker.close(); }
      for (const queue of queues) await queue.add("disposable", { privateValue }, { jobId: "queued-waiting" });
      await email.add("disposable", { privateValue }, { jobId: "delayed-job", delay: 86_400_000 });
      const future = Date.now() + 86_400_000;
      await email.add("legacy-repeat", { privateValue }, { repeat: { every: 86_400_000, startDate: future } });
      await email.upsertJobScheduler("scheduler", { every: 86_400_000, startDate: future }, { name: "scheduled", data: { privateValue } });
    } finally { await Promise.all(queues.map(queue => queue.close())); }
    await redis.set(`identity:reserved-phone-attempt:${"1".repeat(64)}`, "2");
    await redis.sadd("email:daily-sends:2026-10-21", "send-1");
    await redis.set("measurement:cap:v1:20261021:synthetic", "3");
    await redis.set("foreign:configuration", "retain-config");
    await redis.set("foreign:credential", "retain-secret");
    await redis.set("operations:development:snapshot", "retain-monitoring");
    const commands = await redis.call("COMMAND") as [string, number, string[], ...unknown[]][];
    const writeCommands = new Set(commands.filter(command => command[2].includes("write")).map(command => command[0].toLowerCase()));
    monitor = await redis.monitor();
    monitor.on("monitor", (_time: string, args: string[]) => {
      const command = args[0]?.toLowerCase();
      if (command && writeCommands.has(command)) redisWrites++;
      if (command === "echo" && args[1]) fences.get(args[1])?.();
    });
  }, 120000);
  afterAll(async () => { monitor?.disconnect(); redis?.disconnect(); await admin?.end(); await redisContainer?.stop(); await postgres?.stop(); });

  it("deletes only inventoried state, preserves rows authority, and replays exact completed state without writes", async () => {
    const inventoried = receiptOf(await run(pgRequest("inventoried")));
    expect(inventoried["phase"]).toBe("inventoried");
    expect(inventoried["digest"]).toEqual(digestShape);
    const rows = receiptOf(await run(pgRequest("rows", inventoried["digest"])));
    expect(rows).toEqual({ ...base, phase: "rows", environmentId: identity.environmentId, state: "completed", digest: digestShape });
    expect(await query("SELECT count(*)::int AS count FROM users")).toEqual([{ count: 0 }]);
    const originalRow = await storedRow();
    const projection = rowsProjection(originalRow);
    expect(projection["expected"]).toEqual(inventoried["digest"]);
    expect(projection["result"]).toEqual(rows["digest"]);
    const rowsReceiptDigest = hash(canonical(projection));
    const beforeInventory = await snapshotRedis();
    const writesBeforeInventory = await writeCount();
    const inventory = receiptOf(await run(redisInventoryRequest()));
    expect(await snapshotRedis()).toEqual(beforeInventory);
    expect(await writeCount()).toBe(writesBeforeInventory);
    expect(inventory).toEqual({ ...base, phase: "redis-inventoried", identity, state: "observed", digest: hex64, entries: expect.any(Array),
      queues: queueNames.map(name => ({ name, counts: { waiting: 1, delayed: name === "email-code" ? 3 : 0, completed: name === "email-code" ? 1 : 0,
        failed: name === "email-code" ? 1 : 0, active: 0, paused: 0, prioritized: 0, waitingChildren: 0 }, repeatRecords: name === "email-code" ? 2 : 0 })) });
    const entries = inventory["entries"] as unknown[];
    expect(entries.length).toBeGreaterThan(12);
    expect(hash(JSON.stringify(entries))).toBe(inventory["digest"]);
    const command = { ...base, phase: "redis", identity: structuredClone(identity), binding: structuredClone(binding),
      expectedInventory: { digest: inventory["digest"], rowsReceiptDigest } };
    const before = await snapshotRedis();
    // First intended new behavioral RED, after actual rows completion and actual Redis inventory.
    // Current source is predicted to return code=1 / "Clean reset refused: target" here.
    const completion = await run(command);
    expect({ code: completion.code, failure: completion.failure }).toEqual({ code: 0, failure: "" });
    const expectedReceipt = { ...base, phase: "redis", identity, state: "completed", rowsReceiptDigest, digest: hash("[]"), entryCount: 0 };
    expect(receiptOf(completion)).toEqual(expectedReceipt);
    const completedRow = await storedRow();
    expect(immutable(completedRow)).toEqual(immutable(originalRow));
    expect(rowsProjection(completedRow)).toEqual(projection);
    const state = completedRow["redis_state"] as RecordValue;
    expect(state).toEqual({ version: 1, state: "completed", operationId, reservationId, candidate, identity, binding, rowsReceiptDigest,
      preState: { digest: inventory["digest"], entryCount: entries.length }, postState: { digest: hash("[]"), entryCount: 0 },
      intentAt: expect.any(String), completedAt: expect.any(String) });
    for (const field of ["intentAt", "completedAt"]) {
      const value = state[field] as string;
      expect(new Date(value).toISOString()).toBe(value);
    }
    expect(Date.parse(state["completedAt"] as string)).toBeGreaterThanOrEqual(Date.parse(state["intentAt"] as string));
    redacted(state);
    const marker = await redis.get(markerKey);
    expect(marker).toBe(canonical(state));
    expect(await redis.pttl(markerKey)).toBe(-1);
    const preservedKeys = ["foreign:configuration", "foreign:credential", "operations:development:snapshot"];
    expect((await redis.keys("*")).sort()).toEqual([...preservedKeys, markerKey].sort());
    const after = await snapshotRedis();
    expect(after.config).toBe(before.config);
    expect(after.entries.filter(entry => entry.keyDigest !== hash(markerKey)))
      .toEqual(before.entries.filter(entry => preservedKeys.some(key => hash(key) === entry.keyDigest)));
    expect(await query("SELECT epoch FROM measurement_state WHERE key='global'")).toEqual([{ epoch: "redis-recovery-reference" }]);

    const assertReplay = async () => {
      const beforeReplay = await snapshot();
      expect(receiptOf(await run(command))).toEqual({ ...expectedReceipt, state: "observed" });
      expect(await snapshot()).toEqual(beforeReplay);
    };
    await assertReplay();
    // Drop a real replay stdout reply, then retry from the actual completed PostgreSQL record.
    const beforeDrop = await snapshot();
    expect(await run(command, environment(), true)).toEqual({ code: 0, failure: "", sqlDiagnostics: [] });
    expect(await snapshot()).toEqual(beforeDrop);
    await assertReplay();
    await redis.del(markerKey);
    await assertReplay(); // Completed PG authority + exact post-state permits read-only marker absence.
    if (marker === null) throw new Error("Actual completion marker missing");
    await redis.set(markerKey, marker); // Restore only bytes read from the actual fixed-program effect.

    // Adversarial changes start from real completed state, never hand-built positive receipts.
    const pendingMarker = { ...Object.fromEntries(Object.entries(state).filter(([key]) => !["postState", "completedAt"].includes(key))), state: "pending" };
    const variants = ["not-json", canonical(pendingMarker), canonical({ ...state, version: 2 }), canonical({ ...state, operationId: "d".repeat(32) }),
      canonical({ ...state, rowsReceiptDigest: "0".repeat(64) }), canonical({ ...state, postState: { digest: "0".repeat(64), entryCount: 0 } }),
      canonical({ ...state, extra: true })];
    for (const value of variants) {
      await redis.set(markerKey, value);
      try { await refuses(command); } finally { await redis.set(markerKey, marker); }
    }
    const unknownMarker = `staging-clean-reset:receipt:${"d".repeat(32)}`;
    await redis.set(unknownMarker, marker);
    try { await refuses(command); } finally { await redis.del(unknownMarker); }
    await redis.set("bull:email-code:unknown-metadata", privateValue);
    try { await refuses(command); } finally { await redis.del("bull:email-code:unknown-metadata"); }

    const invalid: unknown[] = [
      { ...command, quiesced: true }, { ...command, binding: { ...binding, owner: "other-owner" } },
      { ...command, binding: { ...binding, leaseCommit: "b".repeat(40) } },
      { ...command, binding: { ...binding, window: { ...binding.window, operationId: "d".repeat(32) } } },
      { ...command, binding: { ...binding, window: { ...binding.window, elapsedSeconds: 899 } } },
      { ...command, binding: { ...binding, deployments: { ...binding.deployments, worker: [{ id: "other-deployment", status: "SUCCESS", sha: candidate }] } } },
      { ...command, binding: { ...binding, extra: true } }, { ...command, operationId: [operationId] },
      { ...command, candidate: "d".repeat(40) }, { ...command, reservationId: "d".repeat(32) },
      { ...command, expectedInventory: { digest: inventory["digest"] } },
      { ...command, expectedInventory: { rowsReceiptDigest } },
      { ...command, expectedInventory: { ...command.expectedInventory, digest: [inventory["digest"]] } },
      { ...command, expectedInventory: { ...command.expectedInventory, digest: "0".repeat(64) } },
      { ...command, expectedInventory: { ...command.expectedInventory, rowsReceiptDigest: "0".repeat(64) } },
      { ...command, expectedInventory: { ...command.expectedInventory, extra: true } },
      { ...command, identity: { ...identity, services: { ...identity.services, worker: "other-worker" } } },
      { ...command, identity: { ...identity, services: { ...identity.services, api: "other-api" } } },
      { ...command, identity: { ...identity, origins: { database: identity.origins.database } } },
      { ...command, identity: { ...identity, origins: { ...identity.origins, database: "postgresql://other.internal:5432/railway" } } },
      { ...command, identity: { ...identity, origins: { ...identity.origins, redis: "redis://redis.railway.internal:6379/1" } } },
    ];
    for (const field of Object.keys(command)) invalid.push(Object.fromEntries(Object.entries(command).filter(([key]) => key !== field)));
    for (const field of Object.keys(binding)) invalid.push({ ...command, binding: Object.fromEntries(Object.entries(binding).filter(([key]) => key !== field)) });
    for (const field of Object.keys(binding.window)) invalid.push({ ...command, binding: { ...binding,
      window: Object.fromEntries(Object.entries(binding.window).filter(([key]) => key !== field)) } });
    for (const change of [{ owner: "bad_login" }, { leaseCommit: [binding.leaseCommit] }, { leaseCommit: "short" },
      { window: { ...binding.window, candidate: "d".repeat(40) } }, { window: { ...binding.window, extra: true } },
      { deployments: { ...binding.deployments, extra: [] } }, { deployments: { api: binding.deployments.api } },
      { deployments: { ...binding.deployments, worker: [{ ...binding.deployments.worker[0], status: "FAILED" }] } },
      { deployments: { ...binding.deployments, worker: [{ ...binding.deployments.worker[0], sha: "d".repeat(40) }] } },
      { deployments: { ...binding.deployments, worker: [...binding.deployments.worker, ...binding.deployments.worker] } }]) invalid.push({ ...command, binding: { ...binding, ...change } });
    for (const field of ["projectId", "environmentId"]) invalid.push({ ...command, identity: { ...identity, [field]: "other-target" } });
    for (const input of invalid) await refuses(input);
    await refuses(command, { ...environment(), APP_ENV: "production" });
    await refuses(command, { ...environment(), RAILWAY_ENVIRONMENT_NAME: "production" });
    await refuses(command, { ...environment(), REDIS_URL: "redis://:disposable-redis-secret@other.internal:6379/0" });
    await query("UPDATE staging_clean_reset.receipts SET redis_state=$1::jsonb WHERE operation_id=$2", [JSON.stringify({ ...state, version: 2 }), operationId]);
    try { await refuses(command); } finally {
      await query("UPDATE staging_clean_reset.receipts SET redis_state=$1::jsonb WHERE operation_id=$2", [JSON.stringify(state), operationId]);
    }
    await query("UPDATE staging_clean_reset.receipts SET result=$1::jsonb WHERE operation_id=$2", [JSON.stringify({ ...(projection["result"] as RecordValue), disposable: "0".repeat(64) }), operationId]);
    try { await refuses(command); } finally {
      await query("UPDATE staging_clean_reset.receipts SET result=$1::jsonb WHERE operation_id=$2", [JSON.stringify(projection["result"]), operationId]);
    }
    const beforeRestoredQueue = await snapshot();
    const queue = new bull.Queue("email-code", { connection });
    try { await queue.add("restored", { privateValue }, { jobId: "restored-after-completion" }); } finally { await queue.close(); }
    await refuses(command);
    // Remove only exact newly observed fixture keys, so the final missing-DB test has clean Redis post-state.
    for (const key of await redis.keys("*")) if (![...preservedKeys, markerKey].includes(key)) await redis.del(key);
    const afterRestoredQueue = await snapshot();
    expect({ redis: afterRestoredQueue.redis, pg: afterRestoredQueue.pg }).toEqual({ redis: beforeRestoredQueue.redis, pg: beforeRestoredQueue.pg });
    await query("DELETE FROM staging_clean_reset.receipts WHERE operation_id=$1", [operationId]);
    await refuses(command); // Marker and empty disposable state cannot replace missing DB authority.
  });
});

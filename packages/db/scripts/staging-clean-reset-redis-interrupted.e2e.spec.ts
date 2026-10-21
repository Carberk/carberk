import { spawnSync, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { runInNewContext } from "node:vm";

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Client, Pool } from "pg";
import { GenericContainer, type StartedTestContainer } from "testcontainers";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type * as BullModule from "../../../apps/worker/node_modules/bullmq";
import type * as RedisModule from "../../../apps/worker/node_modules/ioredis";

import { interruptRedis } from "./redis-interruption-transport";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const root = fileURLToPath(new URL("../../..", import.meta.url));
const localRequire = createRequire(import.meta.url);
const workerRequire = createRequire(new URL("../../../apps/worker/package.json", import.meta.url));
const bull = workerRequire("bullmq") as typeof BullModule;
const Redis = (workerRequire("ioredis") as typeof RedisModule).Redis;
// Preserve the established independent inventory and real BullMQ lifecycle fixture.
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
describe("real interrupted Redis intent and lost Lua reply on disposable transports", () => {
  let initialCompletionClassified = false;
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

  async function run(payload: unknown, env: Record<string, string> = environment(), interruption?: "before-lua" | "lua-reply"): Promise<Outcome> {
    await settle();
    const proxy = interruption ? await interruptRedis(connection, interruption) : undefined;
    const outcome: Outcome = { code: 0, failure: "", sqlDiagnostics: [] };
    const process = { env, exitCode: 0 };
    const clients: { disconnect: () => void }[] = [];
    const remap = (args: unknown[]) => {
      const [first, second] = args;
      const target = { host: connection.host, port: proxy?.port ?? connection.port, password: connection.password };
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
          if (outcome.receipt) throw new Error("Multiple fixed-program receipts");
          outcome.receipt = receipt;
        },
        error: (line: string) => { outcome.failure += line; },
      } });
      outcome.code = process.exitCode;
      return outcome;
    } finally {
      for (const client of clients) client.disconnect();
      if (proxy) {
        await proxy.close();
        expect(proxy.dropped()).toBe(interruption);
      }
    }
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

  beforeEach(async () => {
    redisWrites = 0;
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
  afterEach(async () => { monitor?.disconnect(); redis?.disconnect(); await admin?.end(); await redisContainer?.stop(); await postgres?.stop(); });

  async function prepare() {
    const inventoried = receiptOf(await run(pgRequest("inventoried")));
    const rows = receiptOf(await run(pgRequest("rows", inventoried["digest"])));
    expect(rows).toEqual({ ...base, phase: "rows", environmentId: identity.environmentId, state: "completed", digest: digestShape });
    const originalRow = await storedRow();
    const projection = rowsProjection(originalRow);
    expect(projection["expected"]).toEqual(inventoried["digest"]);
    expect(projection["result"]).toEqual(rows["digest"]);
    const rowsReceiptDigest = hash(canonical(projection));
    const inventory = receiptOf(await run(redisInventoryRequest()));
    expect(inventory["phase"]).toBe("redis-inventoried");
    const entries = inventory["entries"] as unknown[];
    expect(entries.length).toBeGreaterThan(12);
    expect(hash(JSON.stringify(entries))).toBe(inventory["digest"]);
    return { command: { ...base, phase: "redis", identity: structuredClone(identity), binding: structuredClone(binding),
      expectedInventory: { digest: inventory["digest"], rowsReceiptDigest } }, originalRow, inventory, entryCount: entries.length };
  }
  type Prepared = Awaited<ReturnType<typeof prepare>>;
  const preservedKeys = ["foreign:configuration", "foreign:credential", "operations:development:snapshot"];
  const empty = { digest: hash("[]"), entryCount: 0 };
  function expectedReceipt(setup: Prepared, state: "completed" | "observed") {
    return { ...base, phase: "redis", identity, state, rowsReceiptDigest: setup.command.expectedInventory.rowsReceiptDigest, ...empty };
  }
  function pendingState(setup: Prepared, value: unknown) {
    const pending = value as RecordValue;
    expect(pending).toEqual({ version: 1, state: "pending", operationId, reservationId, candidate, identity, binding,
      rowsReceiptDigest: setup.command.expectedInventory.rowsReceiptDigest,
      preState: { digest: setup.inventory["digest"], entryCount: setup.entryCount }, intentAt: expect.any(String) });
    const intentAt = pending["intentAt"] as string;
    expect(new Date(intentAt).toISOString()).toBe(intentAt);
    redacted(pending);
    return pending;
  }
  async function completedMarker(setup: Prepared, pending?: RecordValue) {
    const marker = await redis.get(markerKey);
    if (marker === null) throw new Error("SETUP BLOCKED: no actual completed Lua marker");
    const completed = JSON.parse(marker) as RecordValue;
    expect(completed).toEqual({ version: 1, state: "completed", operationId, reservationId, candidate, identity, binding,
      rowsReceiptDigest: setup.command.expectedInventory.rowsReceiptDigest,
      preState: { digest: setup.inventory["digest"], entryCount: setup.entryCount }, postState: empty,
      intentAt: pending?.["intentAt"] ?? expect.any(String), completedAt: expect.any(String) });
    for (const field of ["intentAt", "completedAt"]) {
      const value = completed[field] as string;
      expect(new Date(value).toISOString()).toBe(value);
    }
    expect(Date.parse(completed["completedAt"] as string)).toBeGreaterThanOrEqual(Date.parse(completed["intentAt"] as string));
    expect(marker).toBe(canonical(completed));
    expect(await redis.pttl(markerKey)).toBe(-1);
    expect((await redis.keys("*")).sort()).toEqual([...preservedKeys, markerKey].sort());
    redacted(completed);
    return completed;
  }
  async function preserved(before: Awaited<ReturnType<typeof snapshotRedis>>) {
    const after = await snapshotRedis();
    expect(after.config).toBe(before.config);
    expect(after.entries.filter(entry => entry.keyDigest !== hash(markerKey)))
      .toEqual(before.entries.filter(entry => preservedKeys.some(key => hash(key) === entry.keyDigest)));
    expect(await query("SELECT epoch FROM measurement_state WHERE key='global'")).toEqual([{ epoch: "redis-recovery-reference" }]);
    expect(await query("SELECT count(*)::int AS count FROM users")).toEqual([{ count: 0 }]);
  }

  it("classifies uninterrupted initial completion before any recovery RED", async () => {
    const setup = await prepare();
    const before = await snapshotRedis();
    const result = await run(setup.command);
    expect({ code: result.code, failure: result.failure }, "SETUP BLOCKED: initial completion is not the interrupted recovery RED")
      .toEqual({ code: 0, failure: "" });
    expect(receiptOf(result)).toEqual(expectedReceipt(setup, "completed"));
    const completed = await completedMarker(setup);
    const row = await storedRow();
    expect(row["redis_state"]).toEqual(completed);
    expect(immutable(row)).toEqual(immutable(setup.originalRow));
    await preserved(before);
    const beforeReplay = await snapshot();
    expect(receiptOf(await run(setup.command))).toEqual(expectedReceipt(setup, "observed"));
    expect(await snapshot()).toEqual(beforeReplay);
    initialCompletionClassified = true;
  });

  it("keeps actual pending without a marker closed with zero further writes", async () => {
    expect(initialCompletionClassified, "SETUP BLOCKED: uninterrupted completion must pass first").toBe(true);
    const setup = await prepare();
    const before = await snapshot();
    const result = await run(setup.command, environment(), "before-lua");
    expect(result.code).toBe(1);
    expect(result.failure).toMatch(/^Clean reset refused/);
    expect(result.receipt).toBeUndefined();
    redacted(result);
    const row = await storedRow();
    pendingState(setup, row["redis_state"]);
    expect(immutable(row)).toEqual(immutable(setup.originalRow));
    expect(await redis.get(markerKey)).toBeNull();
    expect(await snapshotRedis()).toEqual(before.redis);
    expect(await writeCount()).toBe(before.writes);
    // This is a control for existing refusal behavior, not the target RED.
    await refuses(setup.command);
    await refuses(setup.command);
  });

  it("recovers actual Lua completion after its transport reply is lost, then replays read-only", async () => {
    expect(initialCompletionClassified, "SETUP BLOCKED: uninterrupted completion must pass first").toBe(true);
    const setup = await prepare();
    const before = await snapshotRedis();
    const interrupted = await run(setup.command, environment(), "lua-reply");
    expect(interrupted.code).toBe(1);
    expect(interrupted.failure).toMatch(/^Clean reset refused/);
    expect(interrupted.receipt).toBeUndefined();
    redacted(interrupted);
    const row = await storedRow();
    const pending = pendingState(setup, row["redis_state"]);
    expect(immutable(row)).toEqual(immutable(setup.originalRow));
    const completed = await completedMarker(setup, pending);
    await preserved(before);
    const markerBytes = await redis.getBuffer(markerKey);
    if (markerBytes === null) throw new Error("Actual completed marker bytes missing");

    // Every negative fixture starts from real pending PG + real completed Lua proof.
    // Restore only captured actual proof, never manufacture positive authority.
    const invalidRequests = [
      { ...setup.command, binding: { ...binding, owner: "other-owner" } },
      { ...setup.command, binding: { ...binding, leaseCommit: "b".repeat(40) } },
      { ...setup.command, binding: { ...binding, window: { ...binding.window, closedAt: "2026-10-21T00:01:00.000Z",
        observedAt: "2026-10-21T00:16:00.000Z" } } },
      { ...setup.command, binding: { ...binding, deployments: { ...binding.deployments,
        worker: [{ id: "other-deployment", status: "SUCCESS", sha: candidate }] } } },
      { ...setup.command, reservationId: "d".repeat(32) }, { ...setup.command, operationId: "d".repeat(32) },
      { ...setup.command, expectedInventory: { ...setup.command.expectedInventory, rowsReceiptDigest: "0".repeat(64) } },
      { ...setup.command, expectedInventory: { ...setup.command.expectedInventory, digest: "0".repeat(64) } },
      { ...setup.command, identity: { ...identity, services: { ...identity.services, worker: "other-worker" } } },
    ];
    for (const command of invalidRequests) await refuses(command);
    await refuses(setup.command, { ...environment(), APP_ENV: "production" });
    const originalResult = setup.originalRow["result"];
    await query("UPDATE staging_clean_reset.receipts SET result=$1::jsonb WHERE operation_id=$2",
      [JSON.stringify({ ...(originalResult as RecordValue), disposable: "0".repeat(64) }), operationId]);
    try { await refuses(setup.command); } finally {
      await query("UPDATE staging_clean_reset.receipts SET result=$1::jsonb WHERE operation_id=$2", [JSON.stringify(originalResult), operationId]);
    }
    for (const invalidState of [{ ...pending, version: 2 }, { ...pending, extra: true },
      { ...pending, preState: { ...(pending["preState"] as RecordValue), entryCount: setup.entryCount + 1 } },
      { ...pending, intentAt: "2026-10-21T00:00:00.000Z" }]) {
      await query("UPDATE staging_clean_reset.receipts SET redis_state=$1::jsonb WHERE operation_id=$2", [JSON.stringify(invalidState), operationId]);
      try { await refuses(setup.command); } finally {
        await query("UPDATE staging_clean_reset.receipts SET redis_state=$1::jsonb WHERE operation_id=$2", [JSON.stringify(pending), operationId]);
      }
    }
    const invalidMarkers = ["not-json", JSON.stringify(completed, null, 2), canonical(pending),
      canonical({ ...completed, version: 2 }), canonical({ ...completed, extra: true }),
      canonical({ ...completed, operationId: "d".repeat(32) }),
      canonical({ ...completed, rowsReceiptDigest: "0".repeat(64) }),
      canonical({ ...completed, binding: { ...binding, owner: "other-owner" } }),
      canonical({ ...completed, preState: { ...(completed["preState"] as RecordValue), entryCount: setup.entryCount + 1 } }),
      canonical({ ...completed, intentAt: "2026-10-21T00:00:00.000Z" }),
      canonical({ ...completed, completedAt: "2026-10-21T00:00:00.000Z" }),
      canonical({ ...completed, completedAt: "invalid" }),
      canonical({ ...completed, postState: { digest: "0".repeat(64), entryCount: 0 } })];
    for (const marker of invalidMarkers) {
      await redis.set(markerKey, marker);
      try { await refuses(setup.command); } finally { await redis.set(markerKey, markerBytes); }
    }
    await redis.pexpire(markerKey, 86_400_000);
    try { await refuses(setup.command); } finally { await redis.set(markerKey, markerBytes); }
    await redis.del(markerKey);
    try { await refuses(setup.command); } finally { await redis.set(markerKey, markerBytes); }
    const reservedKey = `staging-clean-reset:receipt:${"d".repeat(32)}`;
    await redis.set(reservedKey, "unknown-control");
    try { await refuses(setup.command); } finally { await redis.del(reservedKey); }
    const restoredQueue = new bull.Queue("email-code", { connection });
    try { await restoredQueue.add("restored", { privateValue }, { jobId: "restored-before-recovery" }); } finally { await restoredQueue.close(); }
    try { await refuses(setup.command); } finally {
      // Exact independently observed fixture keys only; retain the captured proof and foreign state.
      for (const key of await redis.keys("*")) if (![...preservedKeys, markerKey].includes(key)) await redis.del(key);
    }
    expect(await redis.getBuffer(markerKey)).toEqual(markerBytes);
    expect(await storedRow()).toEqual(row);
    const beforeRecovery = await snapshot();

    // First target RED assertion. All setup above must pass on actual effects.
    // The assembled source returns code=1 and refuses every existing pending.
    const recovery = await run(setup.command);
    expect({ code: recovery.code, failure: recovery.failure }, "RECOVERY RED: real completed Lua effect, lost reply, actual pending PG intent")
      .toEqual({ code: 0, failure: "" });
    expect(receiptOf(recovery)).toEqual(expectedReceipt(setup, "completed"));
    const recoveredRow = await storedRow();
    expect(recoveredRow["redis_state"]).toEqual(completed);
    expect(immutable(recoveredRow)).toEqual(immutable(setup.originalRow));
    const afterRecovery = await snapshot();
    expect(afterRecovery.redis).toEqual(beforeRecovery.redis);
    expect(afterRecovery.writes).toBe(beforeRecovery.writes);
    expect(afterRecovery.pg).not.toBe(beforeRecovery.pg);
    // xmin/ctid and every receipt byte stay fixed on both subsequent executions.
    // This detects a repeated PostgreSQL completion write as well as Redis writes.
    for (let replay = 0; replay < 2; replay++) {
      expect(receiptOf(await run(setup.command))).toEqual(expectedReceipt(setup, "observed"));
      expect(await snapshot()).toEqual(afterRecovery);
    }
  });
});

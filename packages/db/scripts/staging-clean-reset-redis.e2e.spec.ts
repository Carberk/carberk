import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { runInNewContext } from "node:vm";

import { GenericContainer, type StartedTestContainer } from "testcontainers";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type * as BullModule from "../../../apps/worker/node_modules/bullmq";
import type * as RedisModule from "../../../apps/worker/node_modules/ioredis";

// Implementation proposal, not operator policy. Use the installed worker packages,
// without adding db dependencies or importing/booting the worker application.
const workerRequire = createRequire(new URL("../../../apps/worker/package.json", import.meta.url));
const bull = workerRequire("bullmq") as typeof BullModule;
const Redis = (workerRequire("ioredis") as typeof RedisModule).Redis;
const localRequire = createRequire(import.meta.url);
const root = fileURLToPath(new URL("../../..", import.meta.url));
// Independent literal inventory from watchdog.main.ts, app.module.ts and S1 QUEUES.
const queueNames = ["video-transcode", "notification-fanout", "orphan-cleanup", "account-purge", "retired-upload-cleanup",
  "listing-view-retention", "measurement-retention", "measurement-outbox", "service-lifecycle", "service-push", "diagnostic-artifacts", "email-code"];
const candidate = "c".repeat(40), operationId = "e".repeat(32), reservationId = "f".repeat(32);
// Existing CLI's pinned staging identity. These are identifiers, never live endpoints.
const identity = { projectId: "176ddec0-dd65-4087-b82c-798599fc2ebe", environmentId: "652abc79-fdb0-48b0-9f6c-ad0ff572d7b2",
  services: { api: "6db6f1b1-5c7a-4033-88d0-53f5f315bfc0", worker: "24aa02e0-25a9-4e80-9cc2-c1795ef82091" },
  origins: { database: "postgresql://postgres.railway.internal:5432/railway", redis: "redis://redis.railway.internal:6379/0" } };
const environment = () => ({ RAILWAY_PROJECT_ID: identity.projectId, RAILWAY_ENVIRONMENT_ID: identity.environmentId,
  RAILWAY_SERVICE_ID: identity.services.api, RAILWAY_ENVIRONMENT_NAME: "staging", APP_ENV: "staging", AUTOTM_COMMIT_SHA: candidate,
  DATABASE_URL: "postgresql://u:disposable-db-secret@postgres.railway.internal:5432/railway",
  REDIS_URL: "redis://:disposable-redis-secret@redis.railway.internal:6379/0" });
const request = () => ({ operation: "clean-reset", phase: "redis-inventoried", operationId, reservationId, candidate, identity: structuredClone(identity) });
const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const hex64 = expect.stringMatching(/^[a-f0-9]{64}$/);
const privateValue = "PRIVATE-OTP-654321-person@example.invalid";
type Receipt = { [key: string]: unknown; digest: string; entries: { keyDigest: string; contentDigest: string; type: string; count: number; expiresAt: number }[] };
type Outcome = { code: number; failure: string; receipt?: Receipt; connections: number };

// There is intentionally no deletion success test until receipt authority is decided.
// These tests exercise the existing serialized fixed program, never a future import.
describe("clean-reset Redis inventory and closed deletion on disposable Redis", () => {
  let container: StartedTestContainer;
  let redis: InstanceType<typeof Redis>;
  let connection: { host: string; port: number; password: string; maxRetriesPerRequest: null };
  let queues: InstanceType<typeof bull.Queue>[] = [];
  let cleanResetProgram: (payload: unknown) => string;

  function emailQueue() {
    const queue = queues.find(queue => queue.name === "email-code");
    if (!queue) throw new Error("Disposable email queue missing");
    return queue;
  }
  function receiptOf(result: Outcome) {
    expect(result.receipt).toBeDefined();
    if (!result.receipt) throw new Error("Inventory receipt missing");
    return result.receipt;
  }

  async function count(key: string, type: string) {
    switch (type) {
      case "string": return 1;
      case "hash": return redis.hlen(key);
      case "list": return redis.llen(key);
      case "set": return redis.scard(key);
      case "zset": return redis.zcard(key);
      case "stream": return redis.xlen(key);
      default: throw new Error("Unsupported disposable Redis type");
    }
  }

  async function snapshot() {
    const entries = [];
    // All keys, including foreign keys and any accidental receipt writes. DUMP and
    // absolute expiry avoid TTL countdown noise while preserving exact Redis bytes.
    for (const key of (await redis.keys("*")).sort()) {
      const bytes = await redis.dumpBuffer(key);
      if (!bytes) throw new Error("Disposable Redis changed during independent snapshot");
      entries.push({ key, dump: bytes.toString("base64"), expiresAt: Number(await redis.call("PEXPIRETIME", key)) });
    }
    return { entries, config: hash(JSON.stringify(await redis.config("GET", "requirepass", "maxmemory-policy", "appendonly"))) };
  }

  async function execute(payload: unknown, env: Record<string, string> = environment()): Promise<Outcome> {
    const outcome: Outcome = { code: 0, failure: "", connections: 0 };
    const process = { env, exitCode: 0 };
    const clients: { disconnect: () => void }[] = [];
    // Only transport is substituted. Identity still sees the canonical URL. Both
    // ioredis constructor forms and BullMQ connection options reach real Redis.
    const remap = (args: unknown[]): unknown[] => {
      outcome.connections++;
      const [first, second] = args;
      const target = { host: connection.host, port: connection.port, password: connection.password };
      if (typeof first === "string") {
        const url = new URL(first);
        if (url.toString() !== env["REDIS_URL"]) throw new Error("Unexpected Redis transport URL");
        return [{ ...(typeof second === "object" && second ? second : {}), ...target }];
      }
      if (!first || typeof first !== "object") throw new Error("Unexpected Redis transport options");
      const options = first as Record<string, unknown>;
      if (options["url"] !== env["REDIS_URL"] && (options["host"] !== "redis.railway.internal" || Number(options["port"] ?? 6379) !== 6379))
        throw new Error("Unexpected Redis transport target");
      if (Number(options["db"] ?? 0) !== 0) throw new Error("Unexpected Redis transport database");
      return [{ ...options, url: undefined, ...target }];
    };
    class TransportRedis extends Redis {
      constructor(...args: unknown[]) {
        super(remap(args)[0] as RedisModule.RedisOptions);
        clients.push(this);
      }
    }
    class TransportQueue extends bull.Queue {
      constructor(name: string, options: ConstructorParameters<typeof bull.Queue>[1]) {
        const supplied = options?.connection;
        if (!supplied || typeof supplied !== "object") throw new Error("Missing Redis transport");
        const mapped = supplied instanceof Redis ? supplied : remap([supplied])[0] as typeof connection;
        super(name, { ...options, connection: mapped });
        clients.push({ disconnect: () => { void this.disconnect(); } });
      }
    }
    const redisModule = Object.defineProperties(TransportRedis, { Redis: { value: TransportRedis }, default: { value: TransportRedis } });
    const require = (name: string) => {
      if (name === "ioredis") return redisModule;
      if (name === "bullmq") return { ...bull, Queue: TransportQueue };
      if (name === "bullmq/package.json") return workerRequire(name);
      if (name === "node:child_process" || name === "child_process") throw new Error("Redis-only proposal must not call subprocesses");
      return localRequire(name);
    };
    try {
      await runInNewContext(cleanResetProgram(payload), { URL, Buffer, process, require, setTimeout, clearTimeout, console: {
        log: (line: string) => { if (outcome.receipt) throw new Error("Multiple receipts"); outcome.receipt = JSON.parse(line) as Receipt; },
        error: (line: string) => { outcome.failure += line; },
      } });
      outcome.code = process.exitCode;
      return outcome;
    } finally { for (const client of clients) client.disconnect(); }
  }
  async function refuses(payload: unknown, failure: string, env = environment(), noConnection = false) {
    const before = await snapshot();
    const result = await execute(payload, env);
    expect(await snapshot()).toEqual(before);
    expect({ code: result.code, failure: result.failure, receipt: result.receipt }).toEqual({ code: 1, failure, receipt: undefined });
    if (noConnection) expect(result.connections).toBe(0);
    expect(JSON.stringify(result)).not.toMatch(/PRIVATE-OTP|654321|person@example|disposable-.*-secret/);
  }

  beforeAll(async () => {
    ({ cleanResetProgram } = await import(pathToFileURL(`${root}/scripts/staging-clean-reset-remote.mjs`).href));
    expect(workerRequire("bullmq/package.json").version).toBe("5.76.8");
    container = await new GenericContainer("redis:7-alpine").withExposedPorts(6379)
      .withCommand(["redis-server", "--requirepass", "disposable-redis-secret", "--appendonly", "no"]).start();
    connection = { host: container.getHost(), port: container.getMappedPort(6379), password: "disposable-redis-secret", maxRetriesPerRequest: null };
    redis = new Redis(connection);
    expect(await redis.ping()).toBe("PONG");
    queues = queueNames.map(name => new bull.Queue(name, { connection }));
    await Promise.all(queues.map(queue => queue.waitUntilReady()));
    const email = emailQueue();
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
    await redis.set(`identity:reserved-phone-attempt:${"1".repeat(64)}`, "2");
    await redis.sadd("email:daily-sends:2026-10-21", "send-1");
    await redis.set("measurement:cap:v1:20261021:synthetic", "3");
    await redis.set("foreign:configuration", "retain-config");
    await redis.set("foreign:credential", "retain-secret");
    // Q1 requires ledger-verified permanent tombstones. Without that SQL ledger,
    // their presence must refuse, never become a caller-supplied preservation rule.
  });
  afterAll(async () => {
    await Promise.all(queues.map(queue => queue.close()));
    redis?.disconnect();
    await container?.stop();
  });

  it("inventories all 12 queues, real lifecycle state and app keys without writes or private content", async () => {
    const email = emailQueue();
    expect(await email.getJobCounts("wait", "delayed", "completed", "failed", "active"))
      .toEqual({ wait: 1, delayed: 3, completed: 1, failed: 1, active: 0 });
    expect(await email.getRepeatableJobs()).toHaveLength(2);
    const before = await snapshot();
    const result = await execute(request());
    expect(await snapshot()).toEqual(before);
    // Precise first expected behavioral RED on 380ac19c: code 1, target refusal.
    expect({ code: result.code, failure: result.failure }).toEqual({ code: 0, failure: "" });
    expect(result.receipt).toEqual({ operation: "clean-reset", phase: "redis-inventoried", operationId, reservationId, candidate,
      identity, state: "observed", digest: hex64,
      queues: queueNames.map(name => ({ name, counts: { waiting: 1, delayed: name === "email-code" ? 3 : 0,
        completed: name === "email-code" ? 1 : 0, failed: name === "email-code" ? 1 : 0, active: 0, paused: 0, prioritized: 0, waitingChildren: 0 },
      repeatRecords: name === "email-code" ? 2 : 0 })),
      entries: expect.any(Array) });
    const receipt = receiptOf(result);
    expect(receipt.entries).toHaveLength(before.entries.filter(entry => !entry.key.startsWith("foreign:")).length);
    for (const entry of before.entries.filter(entry => !entry.key.startsWith("foreign:"))) {
      expect(receipt.entries).toContainEqual({ keyDigest: hash(entry.key), contentDigest: hash(Buffer.from(entry.dump, "base64")),
        type: await redis.type(entry.key), count: await count(entry.key, await redis.type(entry.key)), expiresAt: entry.expiresAt });
    }
    for (const entry of receipt.entries) expect(Number.isSafeInteger(entry.count) && entry.count >= 0).toBe(true);
    expect(JSON.stringify(result)).not.toMatch(/PRIVATE-OTP|654321|person@example|disposable-.*-secret|retain-secret/);
    expect(await snapshot()).toEqual(before);
  });

  it("rejects missing, extra, coerced and cross-target claims before opening Redis", async () => {
    const inputs: unknown[] = [{ ...request(), quiesced: true }, { ...request(), operationId: [operationId] },
      { ...request(), candidate: "d".repeat(40) }, { ...request(), identity: { ...identity, origins: { database: identity.origins.database } } }];
    inputs.push({ ...request(), identity: { ...identity, services: { ...identity.services, extra: "unknown" } } },
      { ...request(), identity: { ...identity, origins: { ...identity.origins, quiesced: true } } },
      { ...request(), identity: { ...identity, services: { api: identity.services.api } } });
    for (const key of ["operation", "phase", "operationId", "reservationId", "candidate", "identity"]) {
      inputs.push(Object.fromEntries(Object.entries(request()).filter(([field]) => field !== key)));
    }
    for (const field of ["projectId", "environmentId"] as const) inputs.push({ ...request(), identity: { ...identity, [field]: "other-target" } });
    for (const role of ["api", "worker"] as const) inputs.push({ ...request(), identity: { ...identity, services: { ...identity.services, [role]: "other-service" } } });
    for (const origin of ["redis://redis.railway.internal:6379/1", "redis://other.internal:6379/0", [identity.origins.redis]])
      inputs.push({ ...request(), identity: { ...identity, origins: { ...identity.origins, redis: origin } } });
    for (const input of inputs) await refuses(input, "Clean reset refused: target", environment(), true);
    for (const change of [{ APP_ENV: "production" }, { RAILWAY_ENVIRONMENT_NAME: "production" }, { REDIS_URL: "redis://:disposable-redis-secret@other.internal:6379/0" }])
      await refuses(request(), "Clean reset refused: target", { ...environment(), ...change }, true);
  });

  it("refuses unknown queues, unknown queue metadata, unverified control tombstones and a worker heartbeat without writes", async () => {
    for (const [key, value, failure] of [
      ["bull:unknown-queue:wait", privateValue, "unknown Redis application state"],
      ["bull:email-code:unrecognized-metadata", privateValue, "unknown Redis application state"],
      [`bull:email-code:de:campaign-cf_${"9".repeat(32)}-request`, "disposed:unverified", "Redis control disposition unavailable"],
      ["operations:development:worker", "present", "Redis producer or active job present"],
    ] as const) {
      await redis.set(key, value);
      try { await refuses(request(), `Clean reset refused: ${failure}`); } finally { await redis.del(key); }
    }
  });

  it("refuses an actual active BullMQ job and leaves its lock, job and unrelated keys intact", async () => {
    const worker = new bull.Worker("video-transcode", undefined, { connection, autorun: false, skipStalledCheck: true });
    try {
      const job = await worker.getNextJob("active-token", { block: false });
      try {
        expect(await job.getState()).toBe("active");
        await refuses(request(), "Clean reset refused: Redis producer or active job present");
      } finally { await job.moveToCompleted({}, "active-token", false); }
    } finally { await worker.close(); }
  });

  it("fresh reads detect producer drift; every deletion/retry stays closed without durable receipt authority", async () => {
    const first = await execute(request());
    expect([first.code, first.failure]).toEqual([0, ""]);
    const email = emailQueue();
    await email.add("late-producer", { privateValue }, { jobId: "late-job" });
    const fresh = await execute(request());
    expect([fresh.code, fresh.failure]).toEqual([0, ""]);
    expect(fresh.receipt?.digest).toEqual(hex64);
    expect(fresh.receipt?.digest).not.toBe(first.receipt?.digest);
    const late = await email.getJob("late-job");
    if (!late) throw new Error("Late producer job missing");
    await late.updateData({ privateValue, changed: true });
    const changed = await execute(request());
    expect([changed.code, changed.failure]).toEqual([0, ""]);
    expect(receiptOf(changed).entries).toHaveLength(receiptOf(fresh).entries.length);
    expect(receiptOf(changed).digest).not.toBe(receiptOf(fresh).digest);
    const deletion = { ...request(), phase: "redis", expectedInventory: { digest: receiptOf(first).digest } };
    await refuses(deletion, "Clean reset refused: Redis completion receipt authority unavailable");
    await refuses(deletion, "Clean reset refused: Redis completion receipt authority unavailable");
    for (const change of [{ operationId: "a".repeat(32) }, { reservationId: "b".repeat(32) }, { candidate: "d".repeat(40) }])
      await refuses({ ...deletion, ...change }, "Clean reset refused: Redis completion receipt authority unavailable", { ...environment(), AUTOTM_COMMIT_SHA: change.candidate ?? candidate });
    await refuses({ ...deletion, expectedInventory: { digest: [receiptOf(first).digest] } }, "Clean reset refused: target", environment(), true);
  });
});

#!/usr/bin/env node
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { lstat, readFile, rm } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseEnv } from "node:util";
import { adminOrigin, cli as adminAccess, health, localConfig } from "./admin-access.mjs";
import { FixtureError, localApi } from "./local-signin.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const IDS = ["12530000-0000-4000-8000-000000000001", "12530000-0000-4000-8000-000000000002"];
const MODELS = ["user", "otpRequest", "session", "staffGrant", "totpEnrollment", "vehicleHistoryRequest",
  "serviceConversation", "serviceMessage", "serviceReceipt", "serviceMessageOffer", "auditLog"];
const HELP = "Local History fixture: init|run --api <loopback/api/v1> --admin <loopback-origin> " +
  "--api-env <absolute-private-file> --api-log <absolute-private-log> --expected-db <owned_ui> " +
  "[init only: --reason <initial-fixture-reason>]. run stdin: delivered, read, unassigned, incoming, facts, quit. " +
  "Assigned local runtime ownership is required. No retry, reset or browser authentication.";

function optionsFor(argv) {
  const options = { mode: argv[0] };
  const flags = { "--api": "api", "--admin": "admin", "--api-env": "envFile",
    "--api-log": "log", "--expected-db": "database", "--reason": "reason" };
  for (let i = 1; i < argv.length; i++) {
    const key = Object.hasOwn(flags, argv[i]) ? flags[argv[i]] : undefined;
    if (!key || options[key] !== undefined || !argv[i + 1] || argv[i + 1].startsWith("--")) {
      throw new FixtureError("Invalid or duplicate arguments; use --help");
    }
    options[key] = argv[++i];
  }
  if (!["init", "run"].includes(options.mode) || !isAbsolute(options.envFile ?? "") ||
      !isAbsolute(options.log ?? "") || !/^[a-z][a-z0-9_]*_ui$/.test(options.database ?? "")) {
    throw new FixtureError("Select init/run, absolute private files and an explicit owned _ui database");
  }
  if (options.mode === "init" ? !options.reason?.trim() || options.reason.length > 240 : options.reason !== undefined) {
    throw new FixtureError("Only init requires an explicit initial-fixture reason, at most 240 characters");
  }
  return options;
}

async function configuration(options, ports) {
  for (const [file, mode] of [[dirname(options.envFile), 0o700], [options.envFile, 0o600]]) {
    const stat = await ports.lstat(file);
    assert(!stat.isSymbolicLink() && (stat.mode & 0o777) === mode, "Private configuration permissions");
  }
  const env = parseEnv(await ports.readFile(options.envFile, "utf8"));
  const api = localApi(options.api), admin = adminOrigin(options.admin);
  localConfig(env, api);
  const database = new URL(env.DATABASE_URL), redis = new URL(env.REDIS_URL);
  assert(database.port && database.pathname === "/" + options.database);
  assert(redis.protocol === "redis:" && ["127.0.0.1", "localhost", "[::1]"].includes(redis.hostname));
  assert(redis.port && redis.pathname === "/0" && !redis.search && !redis.hash);
  const storage = new URL(env.MINIO_ENDPOINT);
  assert(storage.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(storage.hostname));
  assert(storage.port && storage.origin === env.MINIO_ENDPOINT && env.MINIO_PUBLIC_URL === env.MINIO_ENDPOINT);
  assert(env.REVIEW_DEMO_ACCOUNT_ENABLED === "false" && env.REVIEW_DEMO_ACCOUNTS_JSON === "[]");
  assert(env.TESTER_ACCOUNTS_JSON === "[]" && env.VEHICLE_HISTORY_SYNTHETIC_ENABLED === "true");
  assert(env.VEHICLE_HISTORY_SYNTHETIC_USER_IDS === IDS.join(","));
  const canonical = await ports.readFile(join(ROOT, "packages/db/scripts/ui-fixture.ts"), "utf8");
  const actors = ["UNNAMED_ID", "BUYER_ID"].map((label, index) => {
    const phone = canonical.match(new RegExp('id: ' + label + ',\\s*phone: "([^"]+)"'))?.[1];
    assert(/^\+993\d{8}$/.test(phone ?? ""), "Canonical controlled actor unavailable");
    return { id: IDS[index], phone, displayName: ["Ayna · Local History", "Merdan · Local History"][index] };
  });
  assert(actors[0].phone !== actors[1].phone);
  return { env, api, admin, actors };
}

async function databaseFor(env) {
  const previous = process.env.DATABASE_URL;
  try {
    process.env.DATABASE_URL = env.DATABASE_URL;
    const { PrismaService } = createRequire(import.meta.url)(join(ROOT, "packages/db/dist/src"));
    return new PrismaService();
  } finally {
    if (previous === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previous;
  }
}

async function initialize(config, options, ports) {
  const db = await ports.dbFactory(config.env);
  try {
    await db.$transaction(async tx => {
      for (const model of MODELS) {
        if (await tx[model].count() !== 0) throw new FixtureError("Target is occupied; no fixture changes");
      }
      await tx.user.createMany({ data: config.actors.map((actor, index) => ({
        ...actor, phoneVerifiedAt: new Date(ports.now()), nameNumber: 1253 + index, locale: "tk",
      })) });
      await tx.staffGrant.create({ data: { userId: IDS[0], purpose: "vehicle_history" } });
      await tx.auditLog.create({ data: { actorId: null, action: "synthetic_fixture.history_initial_authority",
        targetType: "User", targetId: IDS[0], details: { source: "local-history-ui-fixture", reason: options.reason } } });
      assert.equal(await tx.session.count(), 0);
      assert.equal(await tx.totpEnrollment.count(), 0);
    }, { isolationLevel: "Serializable" });
    ports.out(JSON.stringify({ initializedUserIds: IDS, users: 2, grants: 1, seededSessions: 0 }));
  } finally { await db.onModuleDestroy(); }
}

async function run(config, options, ports, progress) {
  const { api, admin, env, actors } = config;
  await health(api, "api", ports, env.APP_ENV);
  async function http(route, method = "GET", body, token) {
    progress.stage = method + " " + route;
    const response = await ports.fetch(api.href + route, {
      method, redirect: "error", signal: AbortSignal.timeout(10_000),
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: "Bearer " + token } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (!response.ok) throw new FixtureError("HTTP refusal " + response.status + "; stop without retry");
    return response.json();
  }
  async function privateCode(kind, actor, metadata = []) {
    let record;
    const status = await adminAccess([kind, "--api", api.href, "--admin", admin.origin,
      "--api-env", options.envFile, "--phone", actor.phone, ...metadata], {
      ...ports, out: value => { record = JSON.parse(value); }, err: () => {},
    });
    assert(status === 0 && record?.codeFile, "Private authentication helper refused");
    try {
      assert(Date.parse(record.expiresAt) > ports.now());
      const code = (await ports.readFile(record.codeFile, "utf8")).trim();
      assert(/^\d{6}$/.test(code));
      return code;
    } finally { await ports.rm(record.directory, { recursive: true }); }
  }
  let browserEligibleAt;
  async function signIn(actor, operator) {
    const requestedAt = new Date(ports.now()).toISOString();
    const request = await http("/auth/otp/request", "POST", { phone: actor.phone });
    assert(Number.isFinite(request.resendInSeconds) && request.resendInSeconds >= 0);
    if (operator) browserEligibleAt = new Date(Date.parse(requestedAt) + request.resendInSeconds * 1000).toISOString();
    const code = await privateCode("otp", actor, ["--api-log", options.log,
      "--request-id", request.requestId, "--requested-at", requestedAt]);
    const session = await http("/auth/otp/verify", "POST", { phone: actor.phone, code, deviceLabel: "Local History fixture" });
    assert(session.user.id === actor.id && session.user.role === "buyer" && typeof session.accessToken === "string");
    if (operator) {
      const purpose = "?purpose=vehicle-history";
      const status = await http("/auth/admin/totp/status" + purpose, "GET", undefined, session.accessToken);
      if (!status.enrolled) await http("/auth/admin/totp/enroll" + purpose, "POST", {}, session.accessToken);
      const totp = await privateCode("totp", actor, ["--purpose", "vehicle-history"]);
      await http("/auth/admin/totp/verify" + purpose, "POST", { code: totp }, session.accessToken);
    }
    return session.accessToken;
  }
  const operator = await signIn(actors[0], true), requester = await signIn(actors[1], false);
  const requests = [], outgoing = [];
  for (let index = 0; index < 2; index++) {
    const created = await http("/vehicle-history/requests", "POST", { attemptKey: ports.uuid() }, requester);
    const selected = await http("/vehicle-history/operator/requests/" + created.id + "/claim", "POST",
      { expectedAssignmentVersion: 0 }, operator);
    assert(selected.id === created.id && selected.mine && selected.assignmentVersion === 1);
    assert.equal(selected.assignedOperator.id, actors[0].id);
    requests.push(selected.id);
  }
  const customerPath = "/vehicle-history/requests/" + requests[0];
  const operatorPath = "/vehicle-history/operator/requests/" + requests[0];
  for (let index = 0; index < 3; index++) outgoing.push(await http(operatorPath + "/messages", "POST",
    { expectedAssignmentVersion: 1, clientMessageId: ports.uuid(), text: "Synthetic operator reply " + (index + 1) }, operator));
  for (let index = 0; index < 50; index++) await http(customerPath + "/messages", "POST",
    { clientMessageId: ports.uuid(), text: index === 0 ? "Uzyn habar — Длинный текст — Long message\n".repeat(65) :
      "Synthetic requester message " + (index + 1) }, requester);
  ports.out(JSON.stringify({ requestIds: requests, assignmentVersion: 1, operatorTexts: 3,
    requesterTexts: 50, operatorBrowserResendEligibleAt: browserEligibleAt, stages: ["delivered", "read", "unassigned", "incoming", "facts", "quit"] }));
  let nextStage = 0;
  let unassignedCreated = false, incomingCreated = false;
  for await (const command of ports.input) {
    progress.stage = "stdin stage";
    if (command === "quit") return;
    if (command === "unassigned") {
      assert(!unassignedCreated, "Unassigned stage already used; no additional write");
      unassignedCreated = true;
      const created = await http("/vehicle-history/requests", "POST", { attemptKey: ports.uuid() }, requester);
      assert.match(created.id, /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i);
      assert(created.status === "enquiry" && created.assignmentVersion === 0 && created.assignedOperator === null);
      assert(!requests.includes(created.id));
      ports.out(JSON.stringify({ stage: command, unassignedRequestId: created.id, assignmentVersion: 0 }));
      continue;
    }
    if (command === "incoming") {
      assert(!incomingCreated, "Incoming stage already used; no additional send");
      incomingCreated = true;
      const incoming = await http(customerPath + "/messages", "POST", { clientMessageId: ports.uuid(),
        text: "Synthetic update after the desk loaded" }, requester);
      assert.match(incoming.id, /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i);
      assert(incoming.order === "54" && incoming.author.id === actors[1].id && incoming.author.kind === "requester");
      ports.out(JSON.stringify({ stage: command, incomingMessageId: incoming.id, order: incoming.order }));
      continue;
    }
    if (command === "facts") {
      const { VehicleHistorySchemas } = createRequire(import.meta.url)(join(ROOT, "packages/contracts/dist"));
      const facts = VehicleHistorySchemas.HistoryReceiptsSchema.parse(await http(customerPath + "/receipts", "GET", undefined, requester));
      assert(facts.items.every(fact => (fact.assignmentVersion === 0) === (fact.participantId === actors[1].id)));
      ports.out(JSON.stringify({ stage: command, requestId: requests[0], receiptFacts: facts.items }));
      continue;
    }
    assert.equal(command, ["delivered", "read"][nextStage], "Use the next deliberate stage");
    let cursor, order = 0n;
    const fetched = new Set(), cursors = new Set();
    do {
      const page = await http(customerPath + "/messages" + (cursor ? "?cursor=" + cursor : ""), "GET", undefined, requester);
      for (const message of page.items) {
        assert.equal(BigInt(message.order), ++order);
        assert(!fetched.has(message.id));
        fetched.add(message.id);
      }
      cursor = page.nextCursor;
      assert(!cursor || (!cursors.has(cursor) && fetched.has(cursor)), "Unusable contiguous page cursor");
      if (cursor) cursors.add(cursor);
    } while (cursor);
    const message = outgoing[nextStage === 0 ? 1 : 0];
    assert(fetched.has(message.id), "Send success is not fetched evidence");
    const receipt = await http(customerPath + "/receipts", "POST",
      { cursor: message.id, kind: nextStage === 0 ? "received" : "read" }, requester);
    assert(receipt.participantId === actors[1].id && receipt.assignmentVersion === 0);
    assert.equal(receipt.receivedOrder, "2");
    assert.equal(receipt.readOrder, nextStage === 0 ? "0" : "1");
    nextStage++;
    ports.out(JSON.stringify({ stage: command, requestId: requests[0],
      receivedOrder: receipt.receivedOrder, readOrder: receipt.readOrder }));
  }
}

export async function cli(argv, overrides = {}) {
  const ports = { lstat, readFile, rm, fetch, now: Date.now, uuid: randomUUID,
    dbFactory: databaseFor, out: console.log, err: console.error, ...overrides };
  const progress = { stage: "configuration" };
  let ownedInput;
  try {
    if (argv.length === 1 && argv[0] === "--help") { ports.out(HELP); return 0; }
    const options = optionsFor(argv), config = await configuration(options, ports);
    if (options.mode === "init") {
      progress.stage = "initial empty fixture";
      await initialize(config, options, ports);
    } else {
      if (!ports.input) ports.input = ownedInput = createInterface({ input: process.stdin, terminal: false });
      await run(config, options, ports, progress);
    }
    return 0;
  } catch (error) {
    ports.err("History fixture stopped at " + progress.stage + "; " +
      (error instanceof FixtureError ? error.message : "raw diagnostics suppressed; no retry"));
    return 1;
  } finally { ownedInput?.close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = await cli(process.argv.slice(2));
}

import assert from "node:assert/strict";
import { test } from "node:test";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { randomBytes, randomUUID } from "node:crypto";
import { readFile, rm } from "node:fs/promises";
import { cli } from "./history-ui-fixture.mjs";

const NOW = Date.parse("2026-11-15T10:00:00.000Z");
const IDS = ["12530000-0000-4000-8000-000000000001", "12530000-0000-4000-8000-000000000002"];
const ARGS = ["--api", "http://127.0.0.1:3067/api/v1", "--admin", "http://localhost:3068",
  "--api-env", "/selected-history/api.env", "--api-log", "/selected-history/api.log",
  "--expected-db", "vh1277_ui"];
const INIT = ["init", ...ARGS, "--reason", "Explicit initial synthetic fixture"];
const MODELS = ["user", "otpRequest", "session", "staffGrant", "totpEnrollment", "vehicleHistoryRequest",
  "serviceConversation", "serviceMessage", "serviceReceipt", "serviceMessageOffer", "auditLog"];

function databaseBoundary(state) {
  state.rows = Object.fromEntries(MODELS.map(model => [model, []]));
  return {
    async $transaction(work, options) {
      assert.equal(options.isolationLevel, "Serializable");
      const draft = structuredClone(state.rows);
      const tx = Object.fromEntries(MODELS.map(model => [model, { count: async () => draft[model].length }]));
      tx.user.createMany = async ({ data }) => { draft.user.push(...data); };
      tx.staffGrant.create = async ({ data }) => { draft.staffGrant.push(data); };
      tx.auditLog.create = async ({ data }) => {
        if (state.auditFailure) throw new Error(state.secret);
        draft.auditLog.push(data);
      };
      await work(tx);
      state.rows = draft;
    },
    async onModuleDestroy() { state.closed++; },
  };
}

async function boundary(commands = []) {
  const canonical = await readFile(new URL("../packages/db/scripts/ui-fixture.ts", import.meta.url), "utf8");
  const phones = ["UNNAMED_ID", "BUYER_ID"].map(label =>
    canonical.match(new RegExp('id: ' + label + ',\\s*phone: "([^"]+)"'))[1]);
  const state = { output: [], errors: [], trace: [], messages: [], requests: [], removed: [],
    secret: randomBytes(32).toString("hex"), log: "", closed: 0, spawns: [], ack: [] };
  state.env = [
    "APP_ENV=development", "NODE_ENV=development", "SMS_DRIVER=mock", "OTP_TEST_MODE=false",
    "OTP_TEST_CODE_RESPONSE=false", "PORT=3067", "DATABASE_URL=postgresql://fixture:" + state.secret + "@127.0.0.1:5485/vh1277_ui",
    "REDIS_URL=redis://127.0.0.1:6445/0", "MINIO_ENDPOINT=http://127.0.0.1:9095",
    "MINIO_PUBLIC_URL=http://127.0.0.1:9095", "REVIEW_DEMO_ACCOUNT_ENABLED=false",
    "REVIEW_DEMO_ACCOUNTS_JSON=[]", "TESTER_ACCOUNTS_JSON=[]", "VEHICLE_HISTORY_SYNTHETIC_ENABLED=true",
    "VEHICLE_HISTORY_SYNTHETIC_USER_IDS=" + IDS.join(","), "TOTP_SECRET_ENCRYPTION_KEY=" + state.secret,
  ].join("\n");
  state.code = String(100000 + randomBytes(2).readUInt16BE());
  state.tokens = [randomUUID(), randomUUID()];
  const db = databaseBoundary(state);
  const ports = {
    now: () => NOW, uuid: randomUUID,
    lstat: async file => ({ mode: file.endsWith(".env") ? 0o100600 : 0o40700, isSymbolicLink: () => false }),
    readFile: async (file, encoding) => {
      if (file === "/selected-history/api.env") return state.env;
      if (file === "/selected-history/api.log") return state.log;
      return readFile(file, encoding);
    },
    rm: async (directory, options) => { state.removed.push(directory); await rm(directory, options); },
    dbFactory: async () => db,
    out: value => state.output.push(JSON.parse(value)),
    err: value => state.errors.push(value),
    input: (async function* () { yield* commands; })(),
    spawn: (...args) => {
      state.spawns.push(args);
      const child = new EventEmitter();
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      queueMicrotask(() => {
        child.stdout.emit("data", Buffer.from(state.code + "\n"));
        child.emit("exit", 0);
        child.emit("close", 0);
      });
      return child;
    },
    fetch: async (url, init = {}) => {
      const parsed = new URL(url), path = parsed.pathname;
      const body = init.body ? JSON.parse(init.body) : undefined;
      const request = { path, method: init.method ?? "GET", body, query: parsed.searchParams };
      state.trace.push(request);
      const fault = await state.fault?.(request);
      if (fault) return fault;
      if (path === "/healthz") return Response.json({ service: "api", environment: "development" });
      if (path.endsWith("/auth/otp/request")) {
        const id = randomUUID();
        state.log += new Date(NOW).toISOString() + " [mock] OTP for ***" + body.phone.slice(-4) +
          " (req " + id.slice(0, 8) + "): " + state.code + "\n";
        return Response.json({ requestId: id, resendInSeconds: 60 });
      }
      if (path.endsWith("/auth/otp/verify")) {
        assert.equal(body.code, state.code);
        const index = phones.indexOf(body.phone);
        assert(index >= 0);
        return Response.json({ user: { id: IDS[index], role: "buyer" }, accessToken: state.tokens[index] });
      }
      if (path.includes("/auth/admin/totp/")) {
        assert.equal(parsed.searchParams.get("purpose"), "vehicle-history");
        if (path.endsWith("/status")) return Response.json({ enrolled: !!state.elevated, elevated: !!state.elevated });
        if (path.endsWith("/verify")) {
          assert.equal(body.code, state.code);
          state.elevated = true;
        }
        return Response.json({});
      }
      if (path.endsWith("/vehicle-history/desk") && init.headers.Authorization === "Bearer " + state.tokens[0]) {
        return Response.json({ mode: "synthetic", actor: { id: IDS[0] } });
      }
      if (path === "/api/v1/vehicle-history/requests" && request.method === "POST") {
        const item = { id: randomUUID(), sourceListingId: null, createdAt: new Date(NOW).toISOString(),
          status: "enquiry", assignmentVersion: 0, assignedOperator: null };
        state.requests.push(item);
        return Response.json(item);
      }
      if (path.endsWith("/claim")) {
        assert.equal(body.expectedAssignmentVersion, 0);
        return Response.json({ ...state.requests.at(-1), mine: true, assignmentVersion: 1,
          requester: null, assignedOperator: { id: IDS[0], displayName: null, nameNumber: 1253 } });
      }
      if (path.endsWith("/messages") && request.method === "POST") {
        const operator = path.includes("/operator/");
        assert.equal(init.headers.Authorization, "Bearer " + state.tokens[operator ? 0 : 1]);
        const message = { id: randomUUID(), kind: "TEXT", clientMessageId: body.clientMessageId,
          text: body.text, order: String(state.messages.length + 1), createdAt: new Date(NOW).toISOString(),
          author: { id: IDS[operator ? 0 : 1], displayName: null, nameNumber: operator ? 1253 : 1254,
            kind: operator ? "operator" : "requester" } };
        state.messages.push(message);
        return Response.json(message);
      }
      if (path.endsWith("/messages")) {
        const cursor = parsed.searchParams.get("cursor");
        const start = cursor ? state.messages.findIndex(message => message.id === cursor) + 1 : 0;
        const items = state.messages.slice(start, start + 50);
        return Response.json({ items, nextCursor: start + 50 < state.messages.length ? items.at(-1).id : null });
      }
      if (path.endsWith("/receipts") && request.method === "POST") {
        state.ack.push(body);
        return Response.json({ participantId: IDS[1], assignmentVersion: 0,
          receivedOrder: "2", readOrder: body.kind === "read" ? "1" : "0" });
      }
      throw new Error("Unexpected network operation");
    },
  };
  return { state, ports };
}

function assertPrivate(state) {
  const printed = JSON.stringify([state.output, state.errors]);
  for (const secret of [state.secret, state.code, ...state.tokens]) assert(!printed.includes(secret));
}

test("help imports safely and performs no external work", async () => {
  const output = [];
  assert.equal(await cli(["--help"], {
    out: value => output.push(value),
    readFile: async () => { throw new Error("help must not read files"); },
    fetch: async () => { throw new Error("help must not use HTTP"); },
    dbFactory: async () => { throw new Error("help must not open a database"); },
  }), 0);
  assert.match(output[0], /init\|run/);
});

test("unknown, duplicate and mode-inappropriate arguments refuse before external access", async () => {
  for (const args of [["init", ...ARGS], ["run", ...ARGS, "--reason", "unrelated"],
    ["run", ...ARGS, "--api", ARGS[1]], ["run", ...ARGS, "--promote", "yes"]]) {
    let reads = 0;
    assert.equal(await cli(args, { err: () => {}, readFile: async () => { reads++; } }), 1);
    assert.equal(reads, 0);
  }
});

test("remote, bypass and mismatched targets refuse before DB or authentication", async () => {
  for (const [before, after] of [["APP_ENV=development", "APP_ENV=production"],
    ["OTP_TEST_MODE=false", "OTP_TEST_MODE=true"], ["OTP_TEST_CODE_RESPONSE=false", "OTP_TEST_CODE_RESPONSE=true"],
    ["SMS_DRIVER=mock", "SMS_DRIVER=gateway"], ["PORT=3067", "PORT=9999"],
    ["@127.0.0.1:5485", "@example.com:5485"], ["/vh1277_ui", "/another_ui"],
    ["VEHICLE_HISTORY_SYNTHETIC_ENABLED=true", "VEHICLE_HISTORY_SYNTHETIC_ENABLED=false"]]) {
    const { state, ports } = await boundary();
    state.env = state.env.replace(before, after);
    let dbCalls = 0;
    ports.dbFactory = async () => { dbCalls++; throw new Error("DB must remain unopened"); };
    assert.equal(await cli(INIT, ports), 1);
    assert.equal(dbCalls, 0);
    assert.equal(state.trace.length, 0);
    assertPrivate(state);
  }
});

test("private env permissions and symlinks refuse before external work", async () => {
  for (const symlink of [true, false]) {
    const { state, ports } = await boundary();
    ports.lstat = async () => ({ mode: 0o100644, isSymbolicLink: () => symlink });
    assert.equal(await cli(INIT, ports), 1);
    assert.equal(state.trace.length, 0);
    assert.equal(state.rows.user.length, 0);
  }
});

test("initial fixture is exactly two default buyers, one purpose grant and an honest audit", async () => {
  const { state, ports } = await boundary();
  assert.equal(await cli(INIT, ports), 0);
  assert.deepEqual(state.rows.user.map(user => user.id), IDS);
  assert(state.rows.user.every(user => !Object.hasOwn(user, "role")));
  assert.deepEqual(state.rows.staffGrant, [{ userId: IDS[0], purpose: "vehicle_history" }]);
  assert.equal(state.rows.auditLog[0].actorId, null);
  assert.equal(state.rows.auditLog[0].details.reason, "Explicit initial synthetic fixture");
  assert.equal(state.rows.session.length, 0);
  assert.equal(state.rows.totpEnrollment.length, 0);
  assert.equal(state.trace.length, 0);
  assert.equal(state.closed, 1);
  assertPrivate(state);
});

test("occupied target refuses with no partial changes", async () => {
  const { state, ports } = await boundary();
  state.rows.user.push({ id: randomUUID() });
  const before = structuredClone(state.rows);
  assert.equal(await cli(INIT, ports), 1);
  assert.deepEqual(state.rows, before);
  assert.match(state.errors[0], /occupied/);
});

test("a failed audit rolls back every boundary write and reports no initialization success", async () => {
  const { state, ports } = await boundary();
  state.auditFailure = true;
  assert.equal(await cli(INIT, ports), 1);
  assert(state.rows.user.length === 0 && state.rows.staffGrant.length === 0 && state.rows.auditLog.length === 0);
  assert.equal(state.output.length, 0);
  assert.equal(state.closed, 1);
  assertPrivate(state);
});

test("ordinary login, explicit contiguous fetch and requester-v0 receipts produce factual progress", async () => {
  const { state, ports } = await boundary(["delivered", "read", "quit"]);
  assert.equal(await cli(["run", ...ARGS], ports), 0, state.errors.join("\n"));
  assert.equal(state.trace.filter(request => request.path.endsWith("/auth/otp/request")).length, 2);
  assert.equal(state.requests.length, 2);
  assert.equal(state.messages.filter(message => message.author.kind === "operator").length, 3);
  assert.equal(state.messages.filter(message => message.author.kind === "requester").length, 50);
  assert(state.messages[3].text.includes("\n") && state.messages[3].text.length > 2000);
  assert.deepEqual(state.ack, [{ cursor: state.messages[1].id, kind: "received" },
    { cursor: state.messages[0].id, kind: "read" }]);
  assert.equal(state.trace.filter(request => request.path.endsWith("/messages") && request.method === "GET").length, 4);
  assert.deepEqual(state.output.slice(1).map(result => [result.stage, result.receivedOrder, result.readOrder]),
    [["delivered", "2", "0"], ["read", "2", "1"]]);
  assert.equal(state.removed.length, 3);
  assert(state.spawns[0][1].includes("vehicle-history"));
  assertPrivate(state);
});

test("piped commands survive fixture preparation and quit after the requested stage", { timeout: 2000 }, async () => {
  const { state, ports } = await boundary();
  const stdin = new PassThrough();
  delete ports.input;
  const fixture = cli(["run", ...ARGS], { ...ports, stdin });
  stdin.end("unassigned\nquit\n");
  assert.equal(await fixture, 0, state.errors.join("\n"));
  assert.equal(state.requests.length, 3);
  assert.equal(state.output[1].stage, "unassigned");
});

test("protected OTP refusal stops without another request or alternate actor", async () => {
  const { state, ports } = await boundary();
  state.fault = request => request.path.endsWith("/auth/otp/request") ? Response.json({}, { status: 429 }) : undefined;
  assert.equal(await cli(["run", ...ARGS], ports), 1);
  assert.equal(state.trace.filter(request => request.path.endsWith("/auth/otp/request")).length, 1);
  assert.equal(state.requests.length, 0);
  assertPrivate(state);
});

test("skipped fetched prefix cannot authorize acknowledgement from send results", async () => {
  const { state, ports } = await boundary(["delivered"]);
  state.fault = request => request.path.endsWith("/messages") && request.method === "GET"
    ? Response.json({ items: state.messages.slice(1, 4), nextCursor: null }) : undefined;
  assert.equal(await cli(["run", ...ARGS], ports), 1);
  assert.equal(state.ack.length, 0);
  assert.equal(state.output.length, 1);
});

test("unknown Received outcome stops before Read without claiming receipt success", async () => {
  const { state, ports } = await boundary(["delivered", "read"]);
  state.fault = request => {
    if (request.path.endsWith("/receipts")) throw new Error(state.secret);
  };
  assert.equal(await cli(["run", ...ARGS], ports), 1);
  assert.equal(state.trace.filter(request => request.path.endsWith("/receipts")).length, 1);
  assert.equal(state.output.length, 1);
  assertPrivate(state);
});

test("a deliberate unassigned stage creates one unclaimed request and refuses repetition", async () => {
  const { state, ports } = await boundary(["unassigned", "unassigned"]);
  assert.equal(await cli(["run", ...ARGS], ports), 1);
  assert.equal(state.requests.length, 3);
  assert.equal(state.trace.filter(request => request.path.endsWith("/claim")).length, 2);
  assert.equal(state.output.at(-1).assignmentVersion, 0);
});

test("a deliberate incoming stage sends once to the selected request and refuses repetition", async () => {
  const { state, ports } = await boundary(["incoming", "incoming"]);
  assert.equal(await cli(["run", ...ARGS], ports), 1);
  assert.equal(state.requests.length, 2);
  assert.equal(state.messages.length, 54);
  assert.equal(state.trace.at(-1).path, "/api/v1/vehicle-history/requests/" + state.requests[0].id + "/messages");
  assert.equal(state.messages.at(-1).author.id, IDS[1]);
  assert.deepEqual(state.output.at(-1), { stage: "incoming", incomingMessageId: state.messages.at(-1).id, order: "54" });
  assertPrivate(state);
});

test("facts reads durable requester-v0 progress without another acknowledgement or login", async () => {
  const { state, ports } = await boundary();
  let dbCalls = 0;
  ports.dbFactory = async () => { dbCalls++; throw new Error("facts must not open a database"); };
  const durable = [
    { participantId: IDS[0], assignmentVersion: 1, receivedOrder: "53", readOrder: "50" },
    { participantId: IDS[1], assignmentVersion: 0, receivedOrder: "3", readOrder: "2" },
  ];
  let start, spawns;
  ports.input = (async function* () {
    yield "delivered";
    yield "read";
    start = state.trace.length;
    spawns = state.spawns.length;
    yield "facts";
    yield "quit";
  })();
  state.fault = request => request.path.endsWith("/receipts") && request.method === "GET"
    ? Response.json({ items: durable }) : undefined;
  const fetch = ports.fetch;
  ports.fetch = async (url, init) => {
    if (new URL(url).pathname.endsWith("/receipts") && init.method === "GET") {
      assert.equal(init.headers.Authorization, "Bearer " + state.tokens[1]);
    }
    return fetch(url, init);
  };
  assert.equal(await cli(["run", ...ARGS], ports), 0);
  assert.deepEqual(state.output.at(-1), { stage: "facts", requestId: state.requests[0].id, receiptFacts: durable });
  assert.deepEqual(state.trace.slice(start).map(request =>
    [request.method, request.path, request.body, [...request.query]]),
  [["GET", "/api/v1/vehicle-history/requests/" + state.requests[0].id + "/receipts", undefined, []]]);
  assert.equal(dbCalls, 0);
  assert.equal(state.spawns.length, spawns);
  assert.equal(state.ack.length, 2);
  assertPrivate(state);
});

test("facts stops on unavailable or malformed facts without writes, retry or cached success", async () => {
  for (const variant of ["unavailable", "transport", "requester-version", "foreign-zero", "orders", "extra"]) {
    const { state, ports } = await boundary();
    let dbCalls = 0;
    ports.dbFactory = async () => { dbCalls++; throw new Error("facts must not open a database"); };
    let start;
    ports.input = (async function* () {
      start = state.trace.length;
      yield "facts";
      yield "facts";
      yield "delivered";
    })();
    state.fault = request => {
      if (!request.path.endsWith("/receipts") || request.method !== "GET") return;
      if (variant === "transport") throw new Error(state.secret);
      if (variant === "unavailable") return Response.json({}, { status: 503 });
      const fact = { participantId: IDS[1], assignmentVersion: 0, receivedOrder: "3", readOrder: "2" };
      if (variant === "requester-version") fact.assignmentVersion = 1;
      if (variant === "foreign-zero") fact.participantId = IDS[0];
      if (variant === "orders") fact.readOrder = "4";
      if (variant === "extra") fact.token = state.secret;
      return Response.json({ items: [fact] });
    };
    assert.equal(await cli(["run", ...ARGS], ports), 1);
    assert.deepEqual(state.trace.slice(start).map(request =>
      [request.method, request.path, request.body, [...request.query]]),
    [["GET", "/api/v1/vehicle-history/requests/" + state.requests[0].id + "/receipts", undefined, []]]);
    assert.equal(dbCalls, 0);
    assert.equal(state.spawns.length, 1);
    assert.equal(state.ack.length, 0);
    assert.equal(state.output.length, 1);
    assertPrivate(state);
  }
});

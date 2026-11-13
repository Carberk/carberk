import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createServer } from "node:http";
import { EventEmitter } from "node:events";

import { cli } from "./admin-access.mjs";

const ID = "abcdef01-1234-4567-89ab-123456789abc";
const NOW = Date.parse("2026-11-14T02:00:00.000Z");
const baseArgs = ["--api", "http://127.0.0.1:4306/api/v1", "--admin", "http://localhost:4301", "--api-env", "/tmp/selected-api.env"];
function boundary(overrides = {}) {
  const output = [], errors = [], requests = [], executions = [];
  return {
    output, errors, requests, executions,
    out: value => output.push(value), err: value => errors.push(value), now: () => NOW + 1000,
    readFile: async () => "APP_ENV=test\nNODE_ENV=test\nSMS_DRIVER=mock\nOTP_TEST_MODE=false\nOTP_TEST_CODE_RESPONSE=false\nPORT=4306\nDATABASE_URL=postgresql://fixture:selected-secret@127.0.0.1:5432/selected\nTOTP_SECRET_ENCRYPTION_KEY=selected-key\n",
    fetch: async (url, init) => {
      requests.push([String(url), init]);
      return Response.json({ service: String(url).includes(":4301") ? "admin" : "api", environment: "test" });
    },
    execFile: async (...args) => { executions.push(args); return { stdout: "852013\n", stderr: "Valid for 29s more.\n" }; },
    ...overrides,
  };
}

test("check names the exact browser and API origins without spending a code", async () => {
  const ports = boundary();
  assert.equal(await cli(["check", ...baseArgs], ports), 0);
  assert.deepEqual(JSON.parse(ports.output[0]), {
    status: "ready", api: "http://127.0.0.1:4306/api/v1", admin: "http://localhost:4301",
    loginUrl: "http://localhost:4301/login", session: "Verify and reuse the existing browser identity first; no code requested.",
  });
  assert.equal(ports.executions.length, 0);
  assert(ports.requests.every(([, init]) => !init.method || init.method === "GET"));
});

test("TOTP uses the selected API database/key and never prints the process output", async () => {
  const directory = await mkdtemp(join("/tmp", "admin-access-test-"));
  const ports = boundary({ tempRoot: directory });
  try {
    assert.equal(await cli(["totp", ...baseArgs, "--phone", "+99365000901"], ports), 0, ports.errors.join("\n"));
    const result = JSON.parse(ports.output[0]);
    assert.equal(await readFile(result.codeFile, "utf8"), "852013");
    assert.equal(ports.executions[0][2].env.DATABASE_URL, "postgresql://fixture:selected-secret@127.0.0.1:5432/selected");
    assert.equal(ports.executions[0][2].env.TOTP_SECRET_ENCRYPTION_KEY, "selected-key");
    assert.equal(result.expiresAt, "2026-11-14T02:00:30.000Z");
    assert.doesNotMatch(JSON.stringify({ output: ports.output, errors: ports.errors }), /852013|selected-secret|selected-key/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("refuses remote and production targets before credential retrieval", async () => {
  for (const variant of ["remote-api", "remote-admin", "production", "remote-db", "CI-bypass"]) {
    let reads = 0;
    const config = await boundary().readFile();
    const ports = boundary({ readFile: async () => {
      reads++;
      return config.replace("APP_ENV=test", variant === "production" ? "APP_ENV=production" : "APP_ENV=test")
        .replace("@127.0.0.1:5432", variant === "remote-db" ? "@example.com:5432" : "@127.0.0.1:5432")
        .replace("OTP_TEST_MODE=false", variant === "CI-bypass" ? "OTP_TEST_MODE=true" : "OTP_TEST_MODE=false");
    } });
    const args = [...baseArgs];
    if (variant === "remote-api") args[1] = "https://example.com/api/v1";
    if (variant === "remote-admin") args[3] = "https://example.com";
    assert.equal(await cli(["totp", ...args, "--phone", "+99365000901"], ports), 1, variant);
    assert.equal(ports.requests.length, 0, variant);
    assert.equal(ports.executions.length, 0, variant);
    assert(reads <= 1);
    assert.match(ports.errors.join("\n"), variant.startsWith("remote-") && variant !== "remote-db" ? /loopback/ : /development\/test|nonlocal/);
    assert.doesNotMatch(ports.errors.join("\n"), /selected-secret|selected-key/);
  }
});

test("serve preserves another process already listening on the selected Admin port", async () => {
  const server = createServer((request, response) => response.end("owned by another agent"));
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  let started = false;
  const ports = boundary({ spawn: () => {
    started = true;
    const child = new EventEmitter();
    queueMicrotask(() => child.emit("exit", 0));
    return child;
  } });
  const args = [...baseArgs]; args[3] = `http://127.0.0.1:${port}`;
  try {
    assert.equal(await cli(["serve", ...args], ports), 1);
    assert.equal(started, false);
    assert.match(ports.errors.join("\n"), /PORT_IN_USE/);
    assert.equal(await (await fetch(`http://127.0.0.1:${port}`)).text(), "owned by another agent");
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test("serve starts its own Admin with the exact API and browser origins", async () => {
  const probe = createServer();
  await new Promise(resolve => probe.listen(0, "127.0.0.1", resolve));
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  let launch;
  const ports = boundary({ spawn: (...args) => {
    launch = args;
    const child = new EventEmitter();
    queueMicrotask(() => child.emit("exit", 0));
    return child;
  } });
  const args = [...baseArgs]; args[3] = `http://localhost:${port}`;
  assert.equal(await cli(["serve", ...args], ports), 0, ports.errors.join("\n"));
  assert.deepEqual(launch[1], ["--filter", "@auto-tm/admin", "exec", "next", "dev", "--hostname", "127.0.0.1", "--port", String(port)]);
  assert.equal(launch[2].env.API_BASE_URL, "http://127.0.0.1:4306/api/v1");
  assert.equal(launch[2].env.ADMIN_ORIGIN, `http://localhost:${port}`);
  assert.equal(launch[2].env.NODE_ENV, "development");
  assert.notEqual(launch[2].env.TOTP_SECRET_ENCRYPTION_KEY, "selected-key");
});

test("near-expiry TOTP is refused without creating a code file", async () => {
  const directory = await mkdtemp(join("/tmp", "admin-access-test-"));
  const ports = boundary({ tempRoot: directory, now: () => NOW + 29_000 });
  try {
    assert.equal(await cli(["totp", ...baseArgs, "--phone", "+99365000901"], ports), 1);
    assert.match(ports.errors.join("\n"), /TOTP_WINDOW_ENDING/);
    assert.equal(ports.output.length, 0);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("TOTP subprocess diagnostics cannot expose its code or selected key", async () => {
  const ports = boundary({ execFile: async () => { throw new Error("852013 selected-key private-password"); } });
  assert.equal(await cli(["totp", ...baseArgs, "--phone", "+99365000901"], ports), 1);
  assert.match(ports.errors.join("\n"), /TOTP_UNAVAILABLE/);
  assert.doesNotMatch(JSON.stringify({ output: ports.output, errors: ports.errors }), /852013|selected-key|private-password/);
});

test("the selected local env cannot disguise a running production API", async () => {
  const ports = boundary({ fetch: async () => Response.json({ service: "api", environment: "production" }) });
  assert.equal(await cli(["totp", ...baseArgs, "--phone", "+99365000901"], ports), 1);
  assert.match(ports.errors.join("\n"), /TARGET_MISMATCH/);
  assert.equal(ports.executions.length, 0);
});
test("an agent gets only a private file for the exact Admin OTP request", async () => {
  const directory = await mkdtemp(join("/tmp", "admin-access-test-"));
  const server = createServer((request, response) => {
    assert.equal(request.method, "GET");
    assert.equal(request.url, "/healthz");
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ service: "api", environment: "test" }));
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  const envFile = join(directory, "api.env"), logFile = join(directory, "api.log");
  await writeFile(envFile, `APP_ENV=test\nNODE_ENV=test\nSMS_DRIVER=mock\nOTP_TEST_MODE=false\nOTP_TEST_CODE_RESPONSE=false\nPORT=${port}\nDATABASE_URL=postgresql://fixture:private-password@127.0.0.1:5432/fixture\n`);
  await writeFile(logFile, `2026-11-14T02:00:00.000Z [mock] OTP for ***0901 (req abcdef01): 709814\n`);
  const output = [], errors = [];
  try {
    const exit = await cli(["otp", "--api", `http://127.0.0.1:${port}/api/v1`, "--admin", "http://127.0.0.1:4301", "--api-env", envFile, "--api-log", logFile, "--phone", "+99365000901", "--request-id", ID, "--requested-at", "2026-11-14T02:00:00.000Z"], {
      now: () => NOW + 1000, out: value => output.push(value), err: value => errors.push(value), tempRoot: directory,
    });
    assert.equal(exit, 0, errors.join("\n"));
    const result = JSON.parse(output[0]);
    assert.equal(await readFile(result.codeFile, "utf8"), "709814");
    assert.equal((await stat(result.codeFile)).mode & 0o777, 0o600);
    assert.equal((await stat(result.directory)).mode & 0o777, 0o700);
    assert.doesNotMatch(JSON.stringify({ output, errors }), /709814|private-password/);
    assert.equal(result.kind, "otp");
  } finally {
    await new Promise(resolve => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  }
});

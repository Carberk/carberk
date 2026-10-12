import assert from "node:assert/strict";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { spawn } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const helper = fileURLToPath(new URL("../apps/mobile/scripts/native-session.mjs", import.meta.url));
const expoDir = fileURLToPath(new URL("../apps/mobile/.expo", import.meta.url));
const API = "api-autotm-rewrite-pr-841.up.railway.app";
const MEDIA = "https://minio-autotm-rewrite-pr-841.up.railway.app";
const SERVED = `https://${API}/api/v1;wss://${API}/ws/chat;${MEDIA}`;

async function fixture(t, mode) {
  const dir = fs.mkdtempSync("/tmp/native-session-test-");
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const railway = path.join(dir, "railway");
  fs.writeFileSync(railway, `#!/usr/bin/env node\nconsole.log(JSON.stringify({ RAILWAY_PUBLIC_DOMAIN: "${API}", MINIO_PUBLIC_URL: "${MEDIA}", DATABASE_URL: "PRIVATE-SECRET" }));\n`, { mode: 0o755 });
  fs.writeFileSync(path.join(dir, "pnpm"), `#!/usr/bin/env node
if (process.argv.includes("start")) {
  const fs = require("node:fs");
  fs.writeFileSync(${JSON.stringify(path.join(dir, "started"))}, String(process.pid));
  ${mode === "signal" ? 'process.kill(process.pid, "SIGKILL");' : ""}
  process.on("SIGINT", () => { fs.writeFileSync(${JSON.stringify(path.join(dir, "stopped"))}, "yes"); process.exit(0); });
  setInterval(() => {}, 1000);
}
`, { mode: 0o755 });
  const preload = path.join(dir, "fetch.mjs");
  const bundle = mode === "ok" ? SERVED : "http://localhost:3006/api/v1";
  fs.writeFileSync(preload, `globalThis.fetch = async (url) => {
    const target = String(url);
    if (target.endsWith("/readyz")) return new Response("", { status: ${mode === "unready" ? 503 : 200} });
    if (target.endsWith("/status")) {
      if (${mode === "signal"}) throw new Error("not listening");
      return new Response("packager-status:running");
    }
    if (target.includes(".bundle")) {
      await new Promise(resolve => setTimeout(resolve, 150));
      return new Response(${JSON.stringify(bundle)}, { status: ${mode === "bundle-http" ? 500 : 200} });
    }
    return new Response("", { status: 403 });
  };`);
  return { dir, env: { ...process.env, RAILWAY_CLI: railway, NODE_OPTIONS: `--import=${preload}`, PATH: `${dir}:${process.env.PATH}` } };
}

function start(env, args) {
  const child = spawn(process.execPath, [helper, ...args], { env });
  const result = { child, output: "" };
  for (const stream of [child.stdout, child.stderr]) stream.on("data", chunk => { result.output += chunk; });
  result.exited = new Promise(resolve => child.on("exit", resolve));
  return result;
}

async function run(env, args) {
  const result = start(env, args);
  return { code: await result.exited, output: result.output };
}

const metroArgs = port => ["metro", "--env", "pr-841", "--port", String(port)];

async function listen(host) {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, host, resolve);
  });
  return server;
}

async function freePort() {
  const server = await listen();
  const { port } = server.address();
  await new Promise(resolve => server.close(resolve));
  return port;
}

function receiptFor(t, port) {
  const receipt = path.join(expoDir, `native-session-${port}.json`);
  t.after(() => fs.rmSync(receipt, { force: true }));
  return receipt;
}

for (const host of [undefined, "127.0.0.1", "::1"]) {
  test(`refuses an occupied port and leaves the existing listener alive: ${host ?? "wildcard"}`, async t => {
    const { dir, env } = await fixture(t, "occupied");
    let server;
    try {
      server = await listen(host);
    } catch (error) {
      if (host === "::1" && ["EADDRNOTAVAIL", "EAFNOSUPPORT"].includes(error.code)) return t.skip("no IPv6 loopback");
      throw error;
    }
    t.after(() => server.close());
    const { code, output } = await run(env, metroArgs(server.address().port));
    assert.equal(code, 1);
    assert.match(output, /occupied or unavailable/);
    assert.equal(server.listening, true);
    assert.equal(fs.existsSync(path.join(dir, "started")), false);
    assert.doesNotMatch(output, /PRIVATE-SECRET/);
  });
}

test("refuses an unready API before starting Metro", async t => {
  const { dir, env } = await fixture(t, "unready");
  const { code, output } = await run(env, metroArgs(8841));
  assert.equal(code, 1);
  assert.match(output, /readyz answered 503/);
  assert.equal(fs.existsSync(path.join(dir, "started")), false);
  assert.doesNotMatch(output, /PRIVATE-SECRET/);
});

for (const mode of ["missing-origins", "bundle-http"]) {
  test(`stops its own Metro when the served bundle fails: ${mode}`, async t => {
    const { dir, env } = await fixture(t, mode);
    const { code, output } = await run(env, metroArgs(await freePort()));
    assert.equal(code, 1);
    assert.match(output, mode === "bundle-http" ? /bundle answered 500/ : /served bundle lacks/);
    assert.equal(fs.readFileSync(path.join(dir, "stopped"), "utf8"), "yes");
    assert.doesNotMatch(output, /PRIVATE-SECRET/);
  });
}

test("fails fast when Metro is killed by a signal before it is ready", { timeout: 30000 }, async t => {
  const { env } = await fixture(t, "signal");
  const { code, output } = await run(env, metroArgs(await freePort()));
  assert.equal(code, 1);
  assert.match(output, /Metro exited before it was ready/);
});

test("writes the session receipt and leaves its Metro running on success", { timeout: 30000 }, async t => {
  const { dir, env } = await fixture(t, "ok");
  const port = await freePort();
  const receipt = receiptFor(t, port);
  const session = start(env, metroArgs(port));
  let metroPid;
  t.after(async () => {
    if (metroPid) try { process.kill(-metroPid, "SIGKILL"); } catch { /* already stopped */ }
    session.child.kill("SIGKILL");
    await session.exited;
  });
  while (!session.output.includes("OK: Metro serves")) {
    if (session.child.exitCode !== null) assert.fail(session.output);
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  metroPid = Number(fs.readFileSync(path.join(dir, "started"), "utf8"));
  const written = JSON.parse(fs.readFileSync(receipt, "utf8"));
  assert.equal(written.EXPO_PUBLIC_API_URL, `https://${API}/api/v1`);
  assert.equal(written.EXPO_PUBLIC_MEDIA_URL, MEDIA);
  assert.equal(fs.existsSync(path.join(dir, "stopped")), false);
  assert.equal(session.child.exitCode, null);
  assert.doesNotMatch(session.output, /PRIVATE-SECRET/);
});

test("ios refuses without a receipt from native:metro on the selected port", async t => {
  const { env } = await fixture(t, "ok");
  const port = await freePort();
  receiptFor(t, port);
  const { code, output } = await run(env, ["ios", "--udid", "TEST-DEVICE", "--port", String(port)]);
  assert.equal(code, 1);
  assert.match(output, /Start native:metro in this worktree on the selected port/);
});

for (const mode of ["missing-origins", "bundle-http"]) {
  test(`ios refuses a Metro bundle that does not match the session receipt: ${mode}`, async t => {
    const { env } = await fixture(t, mode);
    const port = await freePort();
    fs.mkdirSync(expoDir, { recursive: true });
    fs.writeFileSync(receiptFor(t, port), JSON.stringify({
      EXPO_PUBLIC_API_URL: `https://${API}/api/v1`,
      EXPO_PUBLIC_WS_URL: `wss://${API}/ws/chat`,
      EXPO_PUBLIC_MEDIA_URL: MEDIA,
    }));
    const { code, output } = await run(env, ["ios", "--udid", "TEST-DEVICE", "--port", String(port)]);
    assert.equal(code, 1);
    assert.match(output, /does not match this guarded session/);
    assert.doesNotMatch(output, /==> pod install/);
  });
}

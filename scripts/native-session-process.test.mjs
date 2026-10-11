import assert from "node:assert/strict";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { spawn } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const helper = fileURLToPath(new URL("../apps/mobile/scripts/native-session.mjs", import.meta.url));

async function fixture(t, mode) {
  const dir = fs.mkdtempSync("/tmp/native-session-test-");
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const railway = path.join(dir, "railway");
  fs.writeFileSync(railway, '#!/usr/bin/env node\nconsole.log(JSON.stringify({ RAILWAY_PUBLIC_DOMAIN: "api.example", MINIO_PUBLIC_URL: "https://media.example", DATABASE_URL: "PRIVATE-SECRET" }));\n', { mode: 0o755 });
  fs.writeFileSync(path.join(dir, "pnpm"), `#!/usr/bin/env node
if (process.argv.includes("start")) {
  const fs = require("node:fs");
  fs.writeFileSync(${JSON.stringify(path.join(dir, "started"))}, String(process.pid));
  process.on("SIGINT", () => { fs.writeFileSync(${JSON.stringify(path.join(dir, "stopped"))}, "yes"); process.exit(0); });
  setInterval(() => {}, 1000);
}
`, { mode: 0o755 });
  const preload = path.join(dir, "fetch.mjs");
  fs.writeFileSync(preload, `globalThis.fetch = async (url) => {
    const target = String(url);
    if (target.endsWith("/readyz")) return new Response("", { status: ${mode === "unready" ? 503 : 200} });
    if (target.endsWith("/status")) return new Response("packager-status:running");
    if (target.includes(".bundle")) {
      await new Promise(resolve => setTimeout(resolve, 150));
      return new Response("http://localhost:3006/api/v1", { status: ${mode === "bundle-http" ? 500 : 200} });
    }
    return new Response("", { status: 403 });
  };`);
  return { dir, env: { ...process.env, RAILWAY_CLI: railway, NODE_OPTIONS: `--import=${preload}`, PATH: `${dir}:${process.env.PATH}` } };
}

async function run(env, port) {
  const child = spawn(process.execPath, [helper, "metro", "--env", "pr-841", "--port", String(port)], { env });
  let output = "";
  for (const stream of [child.stdout, child.stderr]) stream.on("data", chunk => { output += chunk; });
  const code = await new Promise(resolve => child.on("exit", resolve));
  return { code, output };
}

async function listen() {
  const server = net.createServer();
  await new Promise(resolve => server.listen(0, resolve));
  return server;
}

test("refuses an occupied port and leaves the existing listener alive", async t => {
  const { dir, env } = await fixture(t, "occupied");
  const server = await listen();
  t.after(() => server.close());
  const { code, output } = await run(env, server.address().port);
  assert.equal(code, 1);
  assert.match(output, /occupied or unavailable/);
  assert.equal(server.listening, true);
  assert.equal(fs.existsSync(path.join(dir, "started")), false);
  assert.doesNotMatch(output, /PRIVATE-SECRET/);
});

test("refuses an unready API before starting Metro", async t => {
  const { dir, env } = await fixture(t, "unready");
  const { code, output } = await run(env, 8841);
  assert.equal(code, 1);
  assert.match(output, /readyz answered 503/);
  assert.equal(fs.existsSync(path.join(dir, "started")), false);
  assert.doesNotMatch(output, /PRIVATE-SECRET/);
});

for (const mode of ["missing-origins", "bundle-http"]) {
  test(`stops its own Metro when the served bundle fails: ${mode}`, async t => {
    const { dir, env } = await fixture(t, mode);
    const server = await listen();
    const port = server.address().port;
    await new Promise(resolve => server.close(resolve));
    const { code, output } = await run(env, port);
    assert.equal(code, 1);
    assert.match(output, mode === "bundle-http" ? /bundle answered 500/ : /served bundle lacks/);
    assert.equal(fs.readFileSync(path.join(dir, "stopped"), "utf8"), "yes");
    assert.doesNotMatch(output, /PRIVATE-SECRET/);
  });
}

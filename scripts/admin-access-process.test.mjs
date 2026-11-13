import assert from "node:assert/strict";
import { test } from "node:test";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { createServer as tcpServer, connect } from "node:net";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

async function until(check) {
  for (let i = 0; i < 150; i++) { if (await check()) return; await delay(20); }
  throw new Error("Owned process fixture did not settle");
}

async function fixture(mode) {
  const directory = await mkdtemp("/tmp/admin-process-test-");
  const api = createServer((req, res) => { res.setHeader("content-type", "application/json"); res.end(JSON.stringify({ service: "api", environment: "test" })); });
  await new Promise(done => api.listen(0, "127.0.0.1", done));
  const apiPort = api.address().port;
  const database = tcpServer();
  const connections = new Set();
  database.on("connection", socket => { connections.add(socket); socket.on("close", () => connections.delete(socket)); });
  await new Promise(done => database.listen(0, "127.0.0.1", done));
  const dbPort = database.address().port;
  const probe = tcpServer();
  await new Promise(done => probe.listen(0, "127.0.0.1", done));
  const adminPort = probe.address().port;
  await new Promise(done => probe.close(done));
  await writeFile(join(directory, "api.env"), `APP_ENV=test\nNODE_ENV=test\nSMS_DRIVER=mock\nOTP_TEST_MODE=false\nOTP_TEST_CODE_RESPONSE=false\nPORT=${apiPort}\nDATABASE_URL=postgresql://fixture:fixture@127.0.0.1:${dbPort}/fixture\nTOTP_SECRET_ENCRYPTION_KEY=fixture-key\n`);
  await writeFile(join(directory, "worker.cjs"), `
    const fs=require('node:fs'),net=require('node:net');
    process.on('SIGTERM',()=>{}); // Exercise escalation, not just polite shutdown.
    const ready=()=>fs.writeFileSync(process.env.ADMIN_TEST_DIR+'/worker.pid',String(process.pid));
    if(process.argv[2]==='totp')net.connect(new URL(process.env.DATABASE_URL).port,'127.0.0.1',ready);
    else net.createServer(s=>s.end()).listen(Number(process.env.PORT),'127.0.0.1',ready);
  `);
  await writeFile(join(directory, "pnpm"), `#!${process.execPath}\nconst fs=require('node:fs'),{spawn}=require('node:child_process');fs.writeFileSync(process.env.ADMIN_TEST_DIR+'/pnpm.pid',String(process.pid));spawn(process.execPath,[process.env.ADMIN_TEST_DIR+'/worker.cjs',process.argv.includes('admin:totp')?'totp':'serve'],{stdio:'inherit'});`, { mode: 0o700 });
  const args = [mode, "--api", `http://127.0.0.1:${apiPort}/api/v1`, "--admin", `http://127.0.0.1:${adminPort}`, "--api-env", join(directory, "api.env"), ...(mode === "totp" ? ["--phone", "+99365000901"] : [])];
  const entry = new URL("./admin-access.mjs", import.meta.url).href;
  const driver = spawn(process.execPath, ["--input-type=module", "-e", `import {cli} from ${JSON.stringify(entry)};process.exitCode=await cli(${JSON.stringify(args)},{totpTimeoutMs:300});`], {
    env: { ...process.env, PATH: `${directory}:${process.env.PATH}`, ADMIN_TEST_DIR: directory }, stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  driver.stdout.on("data", chunk => { output += chunk; });
  driver.stderr.on("data", chunk => { output += chunk; });
  const exited = new Promise(done => driver.once("exit", code => done(code)));
  return { driver, exited, connections, adminPort, directory, output: () => output,
    ready: () => until(async () => { try { return /^\d+$/.test(await readFile(join(directory, "worker.pid"), "utf8")); } catch { return false; } }),
    async cleanup() {
      if (driver.exitCode === null) driver.kill("SIGKILL");
      for (const name of ["worker.pid", "pnpm.pid"]) {
        try { process.kill(Number(await readFile(join(directory, name), "utf8")), "SIGKILL"); } catch { /* exact owned fixture already gone */ }
      }
      for (const socket of connections) socket.destroy();
      await Promise.all([new Promise(done => api.close(done)), new Promise(done => database.close(done))]);
      await rm(directory, { recursive: true, force: true });
    },
  };
}

for (const signal of ["SIGINT", "SIGTERM"]) test(`serve ${signal} releases its real descendant's port before exiting`, async () => {
  const f = await fixture("serve");
  try {
    await f.ready();
    f.driver.kill(signal);
    await Promise.race([f.exited, delay(3000).then(() => { throw new Error("helper shutdown timed out"); })]);
    const occupied = await new Promise(done => {
      const socket = connect(f.adminPort, "127.0.0.1");
      socket.once("connect", () => { socket.destroy(); done(true); });
      socket.once("error", () => done(false));
    });
    assert.equal(occupied, false, "descendant retained its port after helper exit");
  } finally { await f.cleanup(); }
});

test("TOTP timeout releases its real descendant's database connection before returning", async () => {
  const f = await fixture("totp");
  try {
    await f.ready();
    assert.equal(f.connections.size, 1);
    await Promise.race([f.exited, delay(3000).then(() => { throw new Error("TOTP timeout did not terminate its process tree"); })]);
    assert.match(f.output(), /TOTP_UNAVAILABLE/);
    await until(() => f.connections.size === 0);
    assert.doesNotMatch(f.output(), /fixture-key/);
  } finally { await f.cleanup(); }
});

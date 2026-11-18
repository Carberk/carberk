import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { connect, createServer } from "node:net";
import { dirname, join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const helper = fileURLToPath(new URL("./local-api-start.mjs", import.meta.url));
const root = resolve(dirname(helper), "..");
const secret = "synthetic-private-api-diagnostic";

async function until(check) {
  for (let i = 0; i < 200; i++) {
    if (await check()) return;
    await delay(20);
  }
  throw new Error("Owned API fixture did not settle");
}

async function listen(host = "127.0.0.1", port = 0) {
  const server = createServer(socket => {
    socket.on("error", () => {});
    socket.end("foreign-owner");
  });
  await new Promise((done, fail) => {
    server.once("error", fail);
    server.listen(port, host, done);
  });
  return server;
}

async function freePort() {
  const server = await listen();
  const port = server.address().port;
  await new Promise(done => server.close(done));
  return port;
}

async function fixture(t) {
  const directory = await mkdtemp("/tmp/local-api-test-");
  const sessions = [];
  await writeFile(join(directory, "pnpm"), `#!${process.execPath}
const fs = require("node:fs"), { spawn } = require("node:child_process");
const directory = process.env.API_TEST_DIRECTORY;
fs.writeFileSync(directory + "/launch.json", JSON.stringify({ pid: process.pid, cwd: process.cwd(), args: process.argv.slice(2), port: process.env.PORT, origin: process.env.LISTING_VIDEO_API_ORIGIN }));
console.log("OTP 654321 " + process.env.API_TEST_SECRET);
console.error("credential " + process.env.API_TEST_SECRET);
if (process.env.API_TEST_MODE === "fail") process.exit(7);
const worker = spawn(process.execPath, [directory + "/worker.cjs"], { stdio: ["ignore", "inherit", "inherit", "ipc"] });
if (process.env.API_TEST_MODE === "orphan") worker.once("message", () => process.exit(9));
`, { mode: 0o700 });
  await writeFile(join(directory, "worker.cjs"), `
const fs = require("node:fs"), net = require("node:net");
if (["stubborn", "orphan"].includes(process.env.API_TEST_MODE)) process.on("SIGTERM", () => {});
net.createServer(socket => socket.end("owned-api")).listen(Number(process.env.PORT), "127.0.0.1", () => {
  fs.writeFileSync(process.env.API_TEST_DIRECTORY + "/worker.pid", String(process.pid));
  process.send("ready");
});
`);
  t.after(async () => {
    for (const session of sessions) {
      if (session.child.exitCode === null && session.child.signalCode === null) {
        session.child.kill("SIGTERM");
        await until(() => session.child.exitCode !== null || session.child.signalCode !== null);
      }
      const metadata = session.metadata();
      if (metadata) await rm(metadata.directory, { recursive: true, force: true });
    }
    for (const file of ["worker.pid", "launch.json"]) {
      try {
        const value = await readFile(join(directory, file), "utf8");
        const pid = file === "worker.pid" ? Number(value) : JSON.parse(value).pid;
        try { process.kill(pid, "SIGKILL"); } catch (error) { if (error.code !== "ESRCH") throw error; }
      } catch (error) { if (error.code !== "ENOENT") throw error; }
    }
    await rm(directory, { recursive: true, force: true });
  });
  return {
    directory,
    start(port, mode = "normal", path = `${directory}:${process.env.PATH}`) {
      const child = spawn(process.execPath, ["--input-type=module", "-e", "process.umask(0o022); await import(process.argv[1]);", helper, "--port", String(port)], {
        cwd: "/tmp",
        env: { ...process.env, PATH: path, API_TEST_DIRECTORY: directory, API_TEST_SECRET: secret, API_TEST_MODE: mode },
        stdio: ["ignore", "pipe", "pipe"],
      });
      let stdout = "", stderr = "";
      child.stdout.on("data", chunk => { stdout += chunk; });
      child.stderr.on("data", chunk => { stderr += chunk; });
      const session = {
        child,
        closed: new Promise(done => child.once("close", (code, signal) => done({ code, signal }))),
        output: () => stdout + stderr,
        metadata: () => {
          const line = stdout.trim().split("\n")[0];
          return line ? JSON.parse(line) : undefined;
        },
      };
      sessions.push(session);
      return session;
    },
    async ready() {
      await until(async () => {
        try { return /^\d+$/.test(await readFile(join(directory, "worker.pid"), "utf8")); }
        catch (error) { if (error.code === "ENOENT") return false; throw error; }
      });
    },
  };
}

test("owned API startup creates a unique private log under umask022 and prints only public session metadata", { timeout: 15000 }, async t => {
  const f = await fixture(t);
  const metadata = [];
  for (let i = 0; i < 2; i++) {
    const port = await freePort();
    const session = f.start(port, "fail");
    assert.equal((await session.closed).code, 7);
    const info = session.metadata();
    assert(info);
    assert.deepEqual(Object.keys(info).sort(), ["directory", "logFile", "pid", "port", "processGroup", "status", "worktree"]);
    assert.equal(info.status, "starting-owned-api");
    assert.equal(info.pid, session.child.pid);
    assert.equal(info.port, port);
    assert.equal(info.worktree, root);
    assert.equal(info.logFile, join(info.directory, "api.log"));
    assert.equal((await stat(info.directory)).mode & 0o777, 0o700);
    assert.equal((await stat(info.logFile)).mode & 0o777, 0o600);
    assert.equal((await stat(info.logFile)).uid, process.getuid());
    const launch = JSON.parse(await readFile(join(f.directory, "launch.json"), "utf8"));
    assert.equal(info.processGroup, launch.pid);
    assert.deepEqual(launch, { pid: info.processGroup, cwd: root, args: ["--filter", "@auto-tm/api", "dev"], port: String(port), origin: `http://localhost:${port}` });
    const log = await readFile(info.logFile, "utf8");
    assert.match(log, /OTP 654321 synthetic-private-api-diagnostic/);
    assert.match(log, /credential synthetic-private-api-diagnostic/);
    assert.doesNotMatch(session.output(), /654321|synthetic-private-api-diagnostic|credential/);
    metadata.push(info);
  }
  assert.notEqual(metadata[0].directory, metadata[1].directory);
});

async function responseAt(port, host = "127.0.0.1") {
  return await new Promise((done, fail) => {
    const socket = connect({ port, host });
    let body = "";
    socket.setTimeout(1000, () => socket.destroy(new Error("Fixture connection timed out")));
    socket.on("data", chunk => { body += chunk; });
    socket.once("end", () => done(body));
    socket.once("error", fail);
  });
}

for (const host of ["127.0.0.1", "0.0.0.0", "::1"]) {
  test(`a busy ${host} port preserves its owner without launching an API`, { timeout: 15000 }, async t => {
    const f = await fixture(t);
    const server = await listen(host);
    t.after(() => new Promise(done => server.close(done)));
    const port = server.address().port;
    const session = f.start(port);
    assert.equal((await session.closed).code, 1);
    assert.match(session.output(), /PORT_IN_USE/);
    assert.equal(session.metadata(), undefined);
    await assert.rejects(readFile(join(f.directory, "launch.json")), { code: "ENOENT" });
    assert.equal(await responseAt(port, host === "::1" ? host : "127.0.0.1"), "foreign-owner");
    assert.doesNotMatch(session.output(), /654321|synthetic-private-api-diagnostic/);
  });
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  test(`${signal} stops only owned descendants, escalating when they ignore SIGTERM`, { timeout: 15000 }, async t => {
    const f = await fixture(t);
    const foreign = await listen();
    t.after(() => new Promise(done => foreign.close(done)));
    const port = await freePort();
    const session = f.start(port, "stubborn");
    await f.ready();
    const metadata = session.metadata();
    const worker = Number(await readFile(join(f.directory, "worker.pid"), "utf8"));
    assert.equal(await responseAt(port), "owned-api");
    session.child.kill(signal);
    assert.deepEqual(await session.closed, { code: signal === "SIGINT" ? 130 : 143, signal: null });
    await assert.rejects(responseAt(port), { code: "ECONNREFUSED" });
    assert.throws(() => process.kill(worker, 0), { code: "ESRCH" });
    assert.throws(() => process.kill(-metadata.processGroup, 0), { code: "ESRCH" });
    assert.equal(await responseAt(foreign.address().port), "foreign-owner");
    assert.doesNotMatch(session.output(), /654321|synthetic-private-api-diagnostic/);
  });
}

test("an exited launcher is reaped and its remaining owned descendants stop before the helper returns", { timeout: 15000 }, async t => {
  const f = await fixture(t);
  const port = await freePort();
  const session = f.start(port, "orphan");
  await f.ready();
  assert.deepEqual(await session.closed, { code: 9, signal: null });
  await assert.rejects(responseAt(port), { code: "ECONNREFUSED" });
  assert.throws(() => process.kill(-session.metadata().processGroup, 0), { code: "ESRCH" });
  assert.doesNotMatch(session.output(), /654321|synthetic-private-api-diagnostic/);
});

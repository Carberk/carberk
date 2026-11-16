import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { startSession, sessionRequest } from "./local-env-session.mjs";

async function setup(t) {
  const directory = await mkdtemp("/tmp/carberk-session-");
  t.after(() => rm(directory, { recursive: true, force: true }));
  const reservation = createServer();
  await new Promise(accept => reservation.listen(0, "127.0.0.1", accept));
  const port = reservation.address().port;
  await new Promise(accept => reservation.close(accept));
  return { directory, app: "api", identity: randomBytes(32).toString("hex"), port,
    env: { PATH: process.env.PATH }, cwd: process.cwd(),
    launch: [process.execPath, "-e", `require('http').createServer((req,res)=>res.end('ready')).listen(${port},'127.0.0.1')`] };
}

test("authenticated sessions resume and stop only their own process group", async t => {
  const spec = await setup(t);
  t.after(() => sessionRequest(spec.directory, spec.app, spec.identity, "stop"));
  const first = await startSession(spec);
  const again = await startSession(spec);
  assert.equal(first.pid, again.pid);
  await assert.rejects(sessionRequest(spec.directory, spec.app, "foreign", "stop"), /Unproven/);
  assert.equal((await fetch(`http://127.0.0.1:${spec.port}/readyz`)).status, 200);
  await sessionRequest(spec.directory, spec.app, spec.identity, "stop");
  await assert.rejects(fetch(`http://127.0.0.1:${spec.port}/readyz`));
  assert.equal(await sessionRequest(spec.directory, spec.app, spec.identity, "status"), undefined);
});

test("a launch collision refuses without trusting or stopping an unrelated healthy server", async t => {
  const spec = await setup(t);
  const foreign = createServer((req, res) => res.end("foreign"));
  await new Promise(accept => foreign.listen(spec.port, "127.0.0.1", accept));
  t.after(() => new Promise(accept => foreign.close(accept)));
  await assert.rejects(startSession(spec), /failed readiness or port ownership/);
  assert.equal(await (await fetch(`http://127.0.0.1:${spec.port}/readyz`)).text(), "foreign");
});

test("a lost guardian cannot cause orphaned applications to be adopted or replaced", async t => {
  const spec = await setup(t);
  const session = await startSession(spec);
  t.after(() => { try { process.kill(-session.pid, "SIGKILL"); } catch (error) { if (error.code !== "ESRCH") throw error; } });
  process.kill(session.pid, "SIGKILL");
  await delay(100);
  await assert.rejects(startSession(spec), /Lost api guardian with live group/);
  await assert.rejects(sessionRequest(spec.directory, spec.app, spec.identity, "stop"), /No signals/);
  assert.equal(await (await fetch(`http://127.0.0.1:${spec.port}/readyz`)).text(), "ready");
});

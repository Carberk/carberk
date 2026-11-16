import { spawn, execFile } from "node:child_process";
import { createServer, request } from "node:http";
import { open, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { createRequire } from "node:module";
import { setTimeout as delay } from "node:timers/promises";

const exec = promisify(execFile);
const SELF = fileURLToPath(import.meta.url);

export async function sessionRequest(directory, app, identity, action) {
  const body = await new Promise((accept, reject) => {
    const req = request({ socketPath: join(directory, app + ".sock"), path: "/" + action, method: "POST", headers: { authorization: identity }, timeout: 2000 }, response => {
      let body = "";
      response.on("data", data => { body += data; });
      response.on("end", () => response.statusCode === 200 ? accept(body) : reject(new Error(`Unproven ${app} session; refusing control`)));
    });
    req.on("timeout", () => req.destroy(new Error(`Unresponsive ${app} control socket; inspect private logs`)));
    req.on("error", error => ["ENOENT", "ECONNREFUSED"].includes(error.code) ? accept(undefined) : reject(error));
    req.end();
  });
  if (body === undefined) {
    let receipt;
    try { receipt = JSON.parse(await readFile(join(directory, app + ".session.json"), "utf8")); }
    catch (error) { if (error.code !== "ENOENT") throw error; }
    if (receipt) {
      const groups = (await exec("ps", ["-axo", "pgid="])).stdout.trim().split(/\s+/).map(Number);
      if (groups.includes(receipt.group)) throw new Error(`Lost ${app} guardian with live group ${receipt.group}; preserve infrastructure and inspect private logs/processes. No signals or replacement launch authorized by this receipt`);
    }
    return undefined;
  }
  const value = JSON.parse(body);
  if (value.identity !== identity || value.app !== app) throw new Error(`Foreign ${app} session; no changes`);
  if (action === "stop") {
    for (let count = 0; count < 70; count++) {
      if (!await sessionRequest(directory, app, identity, "status")) return value;
      await delay(200);
    }
    throw new Error(`Owned ${app} shutdown incomplete; inspect private logs`);
  }
  return value;
}

export async function startSession({ directory, app, identity, port, env, cwd, launch }) {
  const existing = await sessionRequest(directory, app, identity, "status");
  if (existing) return existing;
  await rm(join(directory, app + ".sock"), { force: true });
  const file = join(directory, app + ".launch.json");
  await writeFile(file, JSON.stringify({ directory, app, identity, port, env, cwd, launch }), { mode: 0o600 });
  const log = await open(join(directory, app + ".log"), "a", 0o600);
  let child;
  try {
    child = spawn(process.execPath, [SELF, file], { cwd, detached: true, env: { PATH: env.PATH }, stdio: ["ignore", log.fd, log.fd] });
    await new Promise((accept, reject) => { child.once("spawn", accept); child.once("error", reject); });
    child.unref();
  } finally { await log.close(); }
  for (let count = 0; count < 500; count++) {
    const status = await sessionRequest(directory, app, identity, "status");
    if (!status && (child.exitCode !== null || child.signalCode !== null)) throw new Error(`${app} guardian exited; inspect ${directory}/${app}.log, then stop/up`);
    if (status?.status === "ready") return status;
    if (status?.status === "failed") {
      await sessionRequest(directory, app, identity, "stop");
      throw new Error(`${app} failed readiness or port ownership; inspect ${directory}/${app}.log, then stop/up`);
    }
    await delay(200);
  }
  await sessionRequest(directory, app, identity, "stop");
  throw new Error(`${app} did not start; inspect ${directory}/${app}.log, then stop/up`);
}

async function serve(spec) {
  const { directory, app, identity, env, cwd, port } = spec;
  let status = "starting", child;
  let stopping = false;
  const socket = join(directory, app + ".sock");
  const stop = () => {
    if (stopping) return;
    stopping = true;
    status = "stopping";
    process.on("SIGTERM", () => {});
    process.kill(-process.pid, "SIGTERM");
    setTimeout(() => process.kill(-process.pid, "SIGKILL"), 5000);
  };
  const server = createServer((req, res) => {
    if (req.method !== "POST" || req.headers.authorization !== identity || !["/status", "/stop"].includes(req.url)) {
      res.writeHead(403).end(); return;
    }
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ identity, app, status, pid: process.pid }));
    if (req.url === "/stop") setTimeout(stop, 20);
  });
  await new Promise((accept, reject) => { server.once("error", reject); server.listen(socket, accept); });
  await writeFile(join(directory, app + ".session.json"), JSON.stringify({ group: process.pid }), { mode: 0o600 });
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  const target = app === "metro" ? "mobile" : app;
  const manifestPath = join(cwd, "apps", target, "package.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const require = createRequire(manifestPath);
  const start = manifest.scripts.start?.match(/^node ([a-zA-Z0-9/.-]+)$/);
  if (["api", "worker"].includes(app) && !start && !spec.launch) throw new Error("Unsupported package start command");
  const launch = spec.launch ?? (["api", "worker"].includes(app)
    ? [process.execPath, start[1]]
    : [process.execPath, ...(app === "metro" ? ["--dns-result-order=ipv4first"] : []), require.resolve(app === "metro" ? "expo/bin/cli" : "next/dist/bin/next"), app === "metro" ? "start" : "dev", "--port", String(port), ...(app === "metro" ? ["--localhost"] : ["--hostname", "127.0.0.1"])]);
  child = spawn(launch[0], launch.slice(1), { cwd: join(cwd, "apps", target), env, stdio: ["ignore", "inherit", "inherit"] });
  child.once("error", () => { status = "failed"; });
  child.once("exit", () => { if (!stopping) status = "failed"; });
  for (let count = 0; count < 450 && status === "starting"; count++) {
    try {
      const listeners = (await exec("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"])).stdout.trim().split(/\s+/).filter(Boolean);
      if (listeners.length) {
        for (const pid of listeners) {
          const group = (await exec("ps", ["-o", "pgid=", "-p", pid])).stdout.trim();
          if (Number(group) !== process.pid) throw new Error("Foreign port listener");
        }
        const response = await fetch(`http://127.0.0.1:${port}/${app === "metro" ? "status" : ["api", "worker"].includes(app) ? "readyz" : "healthz"}`, { signal: AbortSignal.timeout(1500), redirect: "error" });
        if (response.ok) status = "ready";
      }
    } catch (error) {
      if (error.message === "Foreign port listener") status = "failed";
    }
    if (status === "starting") await delay(200);
  }
  if (status === "starting") status = "failed";
}

if (process.argv[1] === SELF && process.argv[2]) {
  try { await serve(JSON.parse(await readFile(process.argv[2], "utf8"))); }
  catch { console.error("Owned session failed; inspect launch configuration"); process.exit(1); }
}

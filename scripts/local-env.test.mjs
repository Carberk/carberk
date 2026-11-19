import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rename, rm, symlink, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { parseEnv } from "node:util";
import { command, localEnv } from "./local-env.mjs";
import { sessionRequest, startSession } from "./local-env-session.mjs";

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), "local-env-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const output = [], commands = [];
  const run = async (command, args) => {
    commands.push([command, ...args]);
    if (command === "git") return args.includes("--show-toplevel") ? process.cwd() : args.includes("ls-files") ? "" : "test-source";
    if (command === "docker") {
      if (args[0] === "ps" || args[0] === "volume" || args[0] === "network") return "";
      if (args.includes("port")) return "127.0.0.1:" + ({ postgres: 45101, redis: 45102, minio: 45103 }[args.at(-2)]);
      return "";
    }
    return "";
  };
  const options = { root, run, out: value => output.push(value) };
  return { root, commands, options, output };
}

test("command JSON stays parseable and failed diagnostics stay in private logs", async t => {
  const f = await fixture(t), log = join(f.root, "command.log");
  const output = await command(process.execPath, ["-e", "console.log('{\"writes\":0}'); console.error('private diagnostic')"], { log });
  assert.deepEqual(JSON.parse(output), { writes: 0 });
  await assert.rejects(command(process.execPath, ["-e", "console.error('private credential'); process.exit(1)"], { log }), error => error.message.includes(log) && !error.message.includes("private credential"));
  assert.match(await readFile(log, "utf8"), /private credential/);
});

test("a named runtime resumes its identity and publishes only nonsecret endpoints", async t => {
  const f = await fixture(t);
  const first = await localEnv(["up", "1356-a", "--infra-only"], f.options);
  const second = await localEnv(["up", "1356-a", "--infra-only"], f.options);
  assert.equal(first.project, second.project);
  assert.equal(first.identity, second.identity);
  assert.match(first.endpoints.minio, /^http:\/\/127.0.0.1:45103$/);
  assert(!JSON.stringify(f.output).includes("minioadmin"));
  const env = await readFile(join(first.directory, "api.env"), "utf8");
  assert.match(env, /LISTING_VIDEO_API_ORIGIN="http:\/\/127.0.0.1:/);
  assert.match(env, /REDIS_URL="redis:\/\/127.0.0.1:45102\/0"/);
  const configs = Object.fromEntries(await Promise.all(["api", "worker", "admin", "web", "metro"].map(async app => [app, parseEnv(await readFile(join(first.directory, app + ".env"), "utf8"))])));
  assert.equal(configs.worker.DATABASE_URL, "postgresql://auto_tm_ci:auto_tm_ci_pass@127.0.0.1:45101/local_ui");
  assert.notEqual(configs.worker.PORT, configs.api.PORT);
  for (const config of Object.values(configs)) {
    assert.equal(config.MINIO_PUBLIC_URL, "http://127.0.0.1:45103");
    assert.equal(config.API_BASE_URL, first.endpoints.api);
  }
  assert.equal(configs.metro.EXPO_PUBLIC_WS_URL, first.endpoints.api.replace("http:", "ws:") + "/ws/chat");
  for (const app of ["admin", "web", "metro"]) {
    assert(!configs[app].DATABASE_URL && !configs[app].JWT_ACCESS_SECRET && !configs[app].MINIO_SECRET_KEY);
  }
  const state = JSON.parse(await readFile(join(first.directory, "state.json")));
  for (const key of ["controlSecret", "storageSecret", "accessSecret", "refreshSecret", "sessionSecret", "totpSecret"]) assert(!JSON.stringify(f.output).includes(state[key]));
});

test("generated Next and Expo declarations preserve source identity while app edits invalidate it", async t => {
  const f = await fixture(t), checkout = join(f.root, "source");
  await mkdir(join(checkout, "apps/web"), { recursive: true });
  await mkdir(join(checkout, "apps/mobile/.expo/types"), { recursive: true });
  const next = join(checkout, "apps/web/next-env.d.ts"), router = join(checkout, "apps/mobile/.expo/types/router.d.ts"), app = join(checkout, "apps/mobile/app.ts");
  for (const file of [next, router, app]) await writeFile(file, "export {};\n");
  for (const args of [["init"], ["config", "user.name", "Fixture"], ["config", "user.email", "fixture@example.invalid"], ["add", "."], ["commit", "-m", "Fixture source"]]) await command("git", args, { cwd: checkout });
  const original = f.options.run;
  f.options.run = (cmd, args, options) => cmd === "git" ? command(cmd, args, { cwd: checkout }) : original(cmd, args, options);
  const first = await localEnv(["up", "1356-a", "--infra-only"], f.options);
  await writeFile(next, 'import "./.next/dev/types/routes.d.ts";\n');
  await writeFile(router, "export type Route = '/';\n");
  const generated = await localEnv(["up", "1356-a", "--infra-only"], f.options);
  assert.deepEqual(generated.source, first.source);
  await writeFile(app, "export const changed = true;\n");
  const edited = await localEnv(["up", "1356-a", "--infra-only"], f.options);
  assert.notEqual(edited.source.diff, first.source.diff);
});

test("incompatible profiles refuse before external operations or fixture writes", async t => {
  const f = await fixture(t);
  await localEnv(["up", "1356-a", "--infra-only"], f.options);
  f.commands.length = 0;
  await assert.rejects(localEnv(["up", "1356-a", "--profile", "history"], f.options), /no writes.*second named runtime/);
  assert.deepEqual(f.commands.map(row => row[0]), ["git"]);
  await assert.rejects(localEnv(["up", "1356-b", "--profile", "history,native"], f.options), /separate names/);
});

test("a worktree cannot adopt another worktree's named runtime", async t => {
  const f = await fixture(t);
  const result = await localEnv(["up", "1356-a", "--infra-only"], f.options);
  const file = join(result.directory, "state.json");
  const state = JSON.parse(await readFile(file));
  state.owner = "/another-worktree";
  await writeFile(file, JSON.stringify(state), { mode: 0o600 });
  f.commands.length = 0;
  await assert.rejects(localEnv(["stop", "1356-a"], f.options), /belongs to/);
  assert.deepEqual(f.commands.map(row => row[0]), ["git"]);
});

test("quota reset refuses an empty profile before issuing a database command", async t => {
  const f = await fixture(t);
  await localEnv(["up", "1356-a", "--infra-only"], f.options);
  f.commands.length = 0;
  await assert.rejects(localEnv(["reset-signin-quota", "1356-a"], f.options), /prepared History or native runtime/);
  assert(!f.commands.some(row => row.includes("exec")));
});

test("foreign project containers, networks and volumes block changes", async t => {
  for (const kind of ["container", "network", "volume"]) {
    const f = await fixture(t);
    await localEnv(["up", "1356-a", "--infra-only"], f.options);
    const original = f.options.run;
    f.options.run = async (cmd, args, options) => {
      if (cmd === "docker") {
        if (args[0] === "ps" && kind === "container" || args[0] === kind && args[1] === "ls") return "foreign";
        if (args.includes("inspect")) return JSON.stringify([{ Config: { Labels: {} }, Labels: {} }]);
      }
      return original(cmd, args, options);
    };
    f.commands.length = 0;
    await assert.rejects(localEnv(["stop", "1356-a"], f.options), new RegExp("Foreign " + kind));
    assert(!f.commands.some(row => row.includes("stop") || row.includes("up")));
  }
});

test("an unlabelled volume occupying an expected name refuses before Compose or migrations", async t => {
  for (const volume of ["postgres-data", "redis-data", "minio-data"]) {
    const f = await fixture(t);
    const first = await localEnv(["up", "1356-a", "--infra-only"], f.options);
    const name = first.project + "_" + volume, original = f.options.run;
    f.options.run = async (cmd, args, options) => {
      if (cmd === "docker" && args[0] === "volume") {
        if (args[1] === "ls" && args.some(arg => arg.startsWith("name="))) return name;
        if (args[1] === "inspect" && args[2] === name) return JSON.stringify([{ Name: name, Labels: {} }]);
      }
      return original(cmd, args, options);
    };
    f.commands.length = 0;
    await assert.rejects(localEnv(["up", "1356-a", "--infra-only"], f.options), /Foreign volume/);
    assert(!f.commands.some(row => row.includes("up") || row.includes("db:migrate:deploy")));
  }
});

test("changed Docker bindings cannot overwrite the environment of a live owned session", async t => {
  const f = await fixture(t);
  const first = await localEnv(["up", "1356-a", "--infra-only"], f.options);
  const state = JSON.parse(await readFile(join(first.directory, "state.json")));
  const envFile = join(first.directory, "api.env"), before = await readFile(envFile, "utf8");
  await startSession({ directory: first.directory, app: "api", identity: state.controlSecret,
    port: state.ports.api, env: { PATH: process.env.PATH }, cwd: process.cwd(),
    launch: [process.execPath, "-e", `require('http').createServer((req,res)=>res.end('ready')).listen(${state.ports.api},'127.0.0.1')`] });
  t.after(() => sessionRequest(first.directory, "api", state.controlSecret, "stop"));
  const original = f.options.run;
  f.options.run = async (cmd, args, options) => {
    if (cmd === "docker") {
      if (args[0] === "ps") return "owned-postgres owned-redis owned-minio";
      if (args[0] === "container" && args[1] === "inspect") return JSON.stringify([{ Config: { Labels: { "io.carberk.local-env": state.identity } }, State: { Running: true, Status: "running" } }]);
      if (args.includes("port") && args.at(-2) === "minio") return "127.0.0.1:45104";
    }
    return original(cmd, args, options);
  };
  await assert.rejects(localEnv(["up", "1356-a", "--infra-only"], f.options), /bindings changed.*stop\/up/);
  assert((await readFile(envFile, "utf8")) === before, "Live environment file changed");
  assert.deepEqual(JSON.parse(await readFile(join(first.directory, "state.json"))).dockerPorts, { postgres: 45101, redis: 45102, minio: 45103 });
  assert.equal(await (await fetch(first.endpoints.api + "/readyz")).text(), "ready");
});

test("same-name creation serializes while a different named runtime can proceed", async t => {
  const f = await fixture(t);
  let release, entered;
  const started = new Promise(accept => { entered = accept; });
  const held = new Promise(accept => { release = accept; });
  const original = f.options.run;
  let firstUp = true;
  f.options.run = async (cmd, args, options) => {
    if (cmd === "docker" && args.includes("up") && firstUp) { firstUp = false; entered(); await held; }
    return original(cmd, args, options);
  };
  const creating = localEnv(["up", "1356-a", "--infra-only"], f.options);
  await started;
  await assert.rejects(localEnv(["up", "1356-a", "--infra-only"], f.options), /operation busy/);
  let other, first;
  try { other = await localEnv(["up", "1356-b", "--infra-only"], f.options); }
  finally { release(); first = await creating; }
  assert.equal((await localEnv(["up", "1356-a", "--infra-only"], f.options)).identity, first.identity);
  assert.notEqual(other.project, first.project);
});

test("unexpected nonloopback Docker publications refuse before app launch", async t => {
  const f = await fixture(t);
  const original = f.options.run;
  f.options.run = (cmd, args, options) => cmd === "docker" && args.includes("port") ? "0.0.0.0:45101" : original(cmd, args, options);
  await assert.rejects(localEnv(["up", "1356-a", "--infra-only"], f.options), /one loopback port/);
  assert(!f.commands.some(row => row[0] === "pnpm"));
});

test("an occupied stopped app binding is reallocated without touching its listener", async t => {
  const f = await fixture(t);
  const first = await localEnv(["up", "1356-a", "--infra-only"], f.options);
  const server = createServer();
  await new Promise(accept => server.listen(new URL(first.endpoints.api).port, "127.0.0.1", accept));
  t.after(() => new Promise(accept => server.close(accept)));
  const next = await localEnv(["up", "1356-a", "--infra-only"], f.options);
  assert.notEqual(first.endpoints.api, next.endpoints.api);
  assert(server.listening);
});

test("partial Docker startup retains identity and has a data-preserving recovery", async t => {
  const f = await fixture(t);
  const original = f.options.run;
  f.options.run = async (cmd, args, options) => {
    if (cmd === "docker" && args.includes("up")) throw new Error("Docker startup interrupted");
    return original(cmd, args, options);
  };
  await assert.rejects(localEnv(["up", "1356-a", "--infra-only"], f.options), /interrupted/);
  f.options.run = original;
  const partial = await localEnv(["status", "1356-a"], f.options);
  assert.equal(partial.phase, "starting-infra");
  await localEnv(["stop", "1356-a"], f.options);
  assert.equal((await localEnv(["up", "1356-a", "--infra-only"], f.options)).identity, partial.identity);
  assert(!f.commands.some(row => row.includes("down") || row.includes("rm") || row.includes("prune")));
});

test("untrusted state symlinks are refused", async t => {
  const f = await fixture(t);
  const result = await localEnv(["up", "1356-a", "--infra-only"], f.options);
  const file = join(result.directory, "state.json");
  await rename(file, file + ".owned");
  await symlink(file + ".owned", file);
  await assert.rejects(localEnv(["stop", "1356-a"], f.options), /owned private file/);
});

test("corrupt private state does not disclose its contents", async t => {
  const f = await fixture(t);
  const result = await localEnv(["up", "1356-a", "--infra-only"], f.options);
  await writeFile(join(result.directory, "state.json"), "credential-should-not-appear", { mode: 0o600 });
  await assert.rejects(localEnv(["stop", "1356-a"], f.options), error => error.message.includes("state is invalid") && !error.message.includes("credential-should-not-appear"));
});


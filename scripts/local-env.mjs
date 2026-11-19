#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { lstat, mkdir, readFile, realpath, rename, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs, parseEnv } from "node:util";
import { setTimeout as delay } from "node:timers/promises";
import YAML from "yaml";
import { sessionRequest, startSession } from "./local-env-session.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "io.carberk.local-env";
const APPS = ["api", "worker", "admin", "web", "metro"];
const DOCKER_PORTS = [["postgres", 5432], ["redis", 6379], ["minio", 9000]];
const GENERATED = [":(exclude)apps/web/next-env.d.ts", ":(exclude)apps/mobile/.expo/types/router.d.ts"];
const HELP = "pnpm local-env up|status|stop|reset-signin-quota <ticket-name>. up accepts --profile empty|history|native, --with admin,web,metro and --infra-only. reset-signin-quota clears completed or expired synthetic phone sign-ins in the owned named runtime.";
const digest = value => createHash("sha256").update(value).digest("hex");
const secret = () => randomBytes(32).toString("hex");

export function command(command, args, { cwd = ROOT, env = process.env, log } = {}) {
  return new Promise((accept, reject) => {
    const child = spawn(command, args, { cwd, env, stdio: ["ignore", "pipe", "pipe"] });
    let output = "", diagnostics = "";
    child.stdout.on("data", data => { output += data; diagnostics += data; });
    child.stderr.on("data", data => { diagnostics += data; });
    child.once("error", () => reject(new Error(`${command} could not start; check installation`)));
    child.once("close", async code => {
      try {
        if (log) await writeFile(log, diagnostics, { mode: 0o600 });
        if (code !== 0) throw new Error(`${command} failed${log ? `; inspect private log ${log}` : "; diagnostics suppressed"}`);
        accept(output.trim());
      } catch (error) { reject(error); }
    });
  });
}

function systemEnv() {
  return Object.fromEntries(["PATH", "HOME", "TMPDIR", "LANG", "LC_ALL", "SHELL", "USER", "DOCKER_HOST", "DOCKER_CONTEXT"]
    .filter(key => process.env[key] !== undefined).map(key => [key, process.env[key]]));
}

async function privateDirectory(directory) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const stat = await lstat(directory);
  if (stat.isSymbolicLink() || stat.uid !== process.getuid() || (stat.mode & 0o777) !== 0o700) {
    throw new Error(`Require owned private directory: ${directory}`);
  }
}

async function json(file) {
  try {
    const stat = await lstat(file);
    if (stat.isSymbolicLink() || stat.uid !== process.getuid() || (stat.mode & 0o777) !== 0o600) throw new Error(`Require owned private file: ${file}`);
    try { return JSON.parse(await readFile(file, "utf8")); }
    catch { throw new Error(`Private runtime state is invalid; inspect ${file}; no adoption or reset`); }
  } catch (error) { if (error.code === "ENOENT") return undefined; throw error; }
}

async function save(directory, state) {
  const file = join(directory, "state.json");
  await writeFile(file + ".tmp", JSON.stringify(state), { mode: 0o600 });
  await rename(file + ".tmp", file);
}

async function reserve(port = 0) {
  const server = createServer();
  await new Promise((accept, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", accept);
  });
  return { port: server.address().port, close: () => new Promise(accept => server.close(accept)) };
}

async function bindings(previous = {}) {
  const held = [];
  try {
    for (const app of APPS) {
      let server;
      try { server = await reserve(previous[app] ?? 0); }
      catch (error) { if (error.code !== "EADDRINUSE") throw error; server = await reserve(); }
      held.push({ app, ...server });
    }
    return Object.fromEntries(held.map(({ app, port }) => [app, port]));
  } finally { await Promise.all(held.map(server => server.close())); }
}

function optionsFor(argv) {
  const { values, positionals } = parseArgs({ args: argv, allowPositionals: true, options: {
    profile: { type: "string" }, with: { type: "string" }, "infra-only": { type: "boolean" },
  } });
  const [operation, name] = positionals;
  if (positionals.length !== 2 || !["up", "status", "stop", "reset-signin-quota"].includes(operation) || !/^\d+-[a-z0-9][a-z0-9-]{0,39}$/.test(name)) throw new Error(HELP);
  if (values.profile && !["empty", "history", "native"].includes(values.profile)) throw new Error("Choose one profile: empty, history or native; use separate names for History and native");
  const apps = values.with ? values.with.split(",") : [];
  if (new Set(apps).size !== apps.length || apps.some(app => !["admin", "web", "metro"].includes(app))) throw new Error("--with accepts admin,web,metro");
  if (operation !== "up" && Object.keys(values).length) throw new Error("Launch options belong to up only");
  if (values["infra-only"] && (apps.length || values.profile && values.profile !== "empty")) throw new Error("--infra-only requires the empty profile without apps");
  return { operation, name, profile: values.profile, apps, infraOnly: values["infra-only"] };
}

async function ownedResources(state, run, config) {
  const containers = [];
  for (const [kind, args] of [
    ["container", ["ps", "-aq", "--filter", `label=com.docker.compose.project=${state.project}`]],
    ["volume", ["volume", "ls", "-q", "--filter", `label=com.docker.compose.project=${state.project}`]],
    ["network", ["network", "ls", "-q", "--filter", `label=com.docker.compose.project=${state.project}`]],
  ]) {
    let ids = (await run("docker", args)).split(/\s+/).filter(Boolean);
    if (kind === "volume") {
      const expected = new Set(Object.keys(config.volumes).map(name => state.project + "_" + name));
      const named = (await run("docker", ["volume", "ls", "-q", "--filter", `name=${state.project}_`])).split(/\s+/).filter(name => expected.has(name));
      ids = [...new Set([...ids, ...named])];
    }
    for (const id of ids) {
      let inspect;
      try { inspect = JSON.parse(await run("docker", [kind, "inspect", id]))[0]; }
      catch { throw new Error(`Cannot verify ${kind} ownership; inspect Docker locally; no changes`); }
      const labels = kind === "container" ? inspect.Config.Labels : inspect.Labels;
      if (labels?.[LABEL] !== state.identity) throw new Error(`Foreign ${kind} in ${state.project}; no adoption or changes`);
      if (kind === "container") containers.push({ id, service: labels["com.docker.compose.service"], status: inspect.State?.Status, health: inspect.State?.Health?.Status, running: inspect.State?.Running });
    }
  }
  return containers;
}

async function environments(state, directory) {
  const endpoint = app => `http://127.0.0.1:${state.ports[app]}`;
  const api = endpoint("api"), media = `http://127.0.0.1:${state.dockerPorts.minio}`;
  const common = {
    APP_ENV: "development", NODE_ENV: "development", CARBERK_LOCAL_ENV: "true", HOST: "127.0.0.1",
    AUTOTM_COMMIT_SHA: state.source.sha, DATABASE_URL: `postgresql://auto_tm_ci:auto_tm_ci_pass@127.0.0.1:${state.dockerPorts.postgres}/${state.database}`,
    REDIS_URL: `redis://127.0.0.1:${state.dockerPorts.redis}/0`, MINIO_ENDPOINT: media, MINIO_PUBLIC_URL: media,
    MINIO_ACCESS_KEY: "minioadmin", MINIO_SECRET_KEY: state.storageSecret, MINIO_REGION: "us-east-1",
    LISTING_VIDEO_BUCKET_REGION: "us-east-1", LISTING_VIDEO_API_ORIGIN: api,
    JWT_ACCESS_SECRET: state.accessSecret, JWT_REFRESH_SECRET: state.refreshSecret,
    TOTP_SECRET_ENCRYPTION_KEY: state.totpSecret, SMS_DRIVER: "mock", EMAIL_DRIVER: "mock", PUSH_TRANSPORT: "test",
    REVIEW_DEMO_ACCOUNT_ENABLED: "false", REVIEW_DEMO_ACCOUNTS_JSON: "[]", TESTER_ACCOUNTS_JSON: "[]",
    VEHICLE_HISTORY_SYNTHETIC_ENABLED: String(state.profile === "history"),
    VEHICLE_HISTORY_SYNTHETIC_USER_IDS: state.profile === "history" ? "12530000-0000-4000-8000-000000000001,12530000-0000-4000-8000-000000000002" : "",
    LISTING_VIDEO_UPLOADS_ENABLED: String(state.profile === "native"),
    LISTING_VIDEO_UPLOAD_TESTER_USER_IDS: state.profile === "native" ? "f1000000-0000-4000-8000-000000000001" : "",
    LISTING_VIDEO_VIEW_TESTER_USER_IDS: state.profile === "native" ? "f1000000-0000-4000-8000-000000000001,f1000000-0000-4000-8000-000000000010" : "",
    API_BASE_URL: api, NEXT_PUBLIC_API_URL: api + "/api/v1", NEXT_PUBLIC_MINIO_PUBLIC_URL: media,
    ADMIN_ORIGIN: endpoint("admin"), SESSION_SECRET: state.sessionSecret,
    WEB_BASE_URL: endpoint("web"), NEXT_PUBLIC_OG_IMAGE_BASE_URL: endpoint("web") + "/api/og",
    EXPO_PUBLIC_API_URL: api + "/api/v1", EXPO_PUBLIC_WS_URL: api.replace("http:", "ws:") + "/ws/chat",
    EXPO_PUBLIC_MEDIA_URL: media, EXPO_PUBLIC_WEB_URL: endpoint("web"), EXPO_PUBLIC_ENV: "development",
    EXPO_PUBLIC_VEHICLE_HISTORY_SYNTHETIC: String(state.profile === "history"),
    EXPO_NO_DOTENV: "1", __NEXT_PROCESSED_ENV: "true", CI: "1",
    WORKER_CONCURRENCY_VIDEO_TRANSCODE: "1", FFMPEG_THREADS: "1",
  };
  const configs = {};
  for (const app of APPS) {
    const template = parseEnv(await readFile(join(ROOT, "apps", app === "metro" ? "mobile" : app, ".env.template"), "utf8"));
    const env = { ...template, ...common, PORT: String(state.ports[app]) };
    if (!["api", "worker"].includes(app)) {
      for (const key of ["DATABASE_URL", "REDIS_URL", "JWT_ACCESS_SECRET", "JWT_REFRESH_SECRET", "TOTP_SECRET_ENCRYPTION_KEY", "MINIO_ACCESS_KEY", "MINIO_SECRET_KEY"]) delete env[key];
    }
    if (app !== "admin") delete env.SESSION_SECRET;
    configs[app] = { ...systemEnv(), ...env };
    await writeFile(join(directory, app + ".env"), Object.entries(env).map(([key, value]) => `${key}=${JSON.stringify(value)}`).join("\n") + "\n", { mode: 0o600 });
  }
  return configs;
}

async function composeFile(state, directory, config) {
  config.services.postgres.environment.POSTGRES_DB = state.database;
  config.services.postgres.healthcheck.test = ["CMD-SHELL", `pg_isready -U auto_tm_ci -d ${state.database}`];
  config.services.minio.environment.MINIO_ROOT_PASSWORD = state.storageSecret;
  if (state.dockerPortsPinned) {
    const ports = DOCKER_PORTS.map(([service]) => state.dockerPorts?.[service]);
    if (!ports.every(port => Number.isInteger(port) && port > 0 && port <= 65535) || new Set(ports).size !== ports.length) {
      throw new Error("Recorded Docker ports are invalid; inspect private runtime state");
    }
    for (const [service, target] of DOCKER_PORTS) {
      config.services[service].ports.find(binding => binding.target === target).published = String(state.dockerPorts[service]);
    }
  }
  for (const service of Object.values(config.services)) service.labels = { [LABEL]: state.identity };
  for (const name of Object.keys(config.volumes)) config.volumes[name] = { labels: { [LABEL]: state.identity } };
  config.networks = { default: { labels: { [LABEL]: state.identity } } };
  const file = join(directory, "compose.yml");
  await writeFile(file, YAML.stringify(config), { mode: 0o600 });
  return ["compose", "-p", state.project, "-f", file];
}

async function sessions(state, directory) {
  const result = {};
  for (const app of APPS) result[app] = await sessionRequest(directory, app, state.controlSecret, "status");
  return result;
}

async function resetSignInQuota(state, containers, run) {
  const fixtureIds = state.profile === "history" && state.preparation === "history-initialized"
    ? ["12530000-0000-4000-8000-000000000001", "12530000-0000-4000-8000-000000000002"]
    : state.profile === "native" && state.preparation === "native-rich-checked"
      ? ["f1000000-0000-4000-8000-000000000001", "f1000000-0000-4000-8000-000000000010"]
      : [];
  if (state.database !== "local_ui" || !fixtureIds.length) {
    throw new Error("Quota reset requires a prepared History or native runtime; use a named fixture profile");
  }
  const postgres = containers.filter(container => container.service === "postgres" && container.running && container.health === "healthy");
  if (postgres.length !== 1) throw new Error("Start the selected named runtime before resetting its fixture sign-in quota");
  const sql = `
    WITH fixture AS (
      SELECT id, phone FROM users WHERE id IN ('${fixtureIds.join("','")}') AND phone IS NOT NULL
    ), cleared AS (
      DELETE FROM otp_requests AS request USING fixture
      WHERE (SELECT count(*) FROM fixture) = 2
        AND request.channel = 'phone' AND request.purpose = 'sign_in'
        AND request.destination = fixture.phone
        AND (request."userId" IS NULL OR request."userId" = fixture.id)
        AND request."createdAt" >= CURRENT_TIMESTAMP - interval '24 hours'
        AND (request."verifiedAt" IS NOT NULL OR request."expiresAt" <= CURRENT_TIMESTAMP)
      RETURNING 1
    )
    SELECT json_build_object(
      'fixtures', (SELECT count(*) FROM fixture),
      'cleared', (SELECT count(*) FROM cleared)
    );
  `;
  const result = JSON.parse(await run("docker", ["exec", postgres[0].id, "psql", "-XAt", "-v", "ON_ERROR_STOP=1",
    "-U", "auto_tm_ci", "-d", state.database, "-c", sql]));
  if (result.fixtures !== 2) throw new Error("Expected fixture Users are missing; no sign-in records cleared");
  return { name: state.name, profile: state.profile, cleared: result.cleared };
}

function report(state, directory, live, containers = []) {
  return {
    name: state.name, project: state.project, identity: state.identity, directory,
    owner: state.owner, source: state.source, profile: state.profile, preparation: state.preparation,
    environment: state.environment,
    phase: state.phase, endpoints: { ...Object.fromEntries(APPS.map(app => [app, state.ports?.[app] ? `http://127.0.0.1:${state.ports[app]}` : null])), minio: state.dockerPorts?.minio ? `http://127.0.0.1:${state.dockerPorts.minio}` : null,
      postgres: state.dockerPorts?.postgres, redis: state.dockerPorts?.redis, database: state.database },
    sessions: Object.fromEntries(APPS.map(app => [app, live[app]?.status ?? "stopped"])),
    containers: containers.map(({ service, status, health }) => ({ service, status, health })),
    recovery: `pnpm local-env stop ${state.name}; pnpm local-env up ${state.name}. Data is preserved. Private logs/env: ${directory}`,
  };
}

export async function localEnv(argv, { root = `/tmp/carberk-local-${process.getuid()}`, run = command, out = console.log } = {}) {
  if (argv.length === 1 && argv[0] === "--help") { out(HELP); return; }
  const options = optionsFor(argv);
  const owner = await realpath(await run("git", ["rev-parse", "--show-toplevel"]));
  await privateDirectory(root);
  const directory = join(root, options.name);
  await privateDirectory(directory);
  const lock = join(directory, "operation.lock");
  try { await mkdir(lock, { mode: 0o700 }); }
  catch (error) {
    if (error.code !== "EEXIST") throw error;
    throw new Error(`Local runtime operation busy; retry when finished. If interrupted, inspect ${lock}/owner.json, verify its process ended, then remove only that lock directory.`);
  }
  try {
    await writeFile(join(lock, "owner.json"), JSON.stringify({ pid: process.pid, owner, at: new Date().toISOString() }), { mode: 0o600 });
    let state = await json(join(directory, "state.json"));
    if (state && state.owner !== owner) throw new Error(`Runtime belongs to ${state.owner}; use a different name in this worktree`);
    if (state && options.profile && options.profile !== state.profile) throw new Error(`Profile ${state.profile} cannot become ${options.profile}; no writes. Create a second named runtime for that profile`);
    if (!state && options.operation !== "up") throw new Error("Runtime does not exist; use up first");
    const untracked = (await run("git", ["ls-files", "--others", "--exclude-standard", "--", "apps", "packages", "scripts", "infra", ...GENERATED])).split("\n").filter(Boolean).sort();
    const extra = await Promise.all(untracked.map(async file => [file, digest(await readFile(join(owner, file)))]));
    const source = { sha: await run("git", ["rev-parse", "HEAD"]), diff: digest(JSON.stringify([await run("git", ["diff", "HEAD", "--", ".", ...GENERATED]), extra])) };
    if (!state) {
      state = { version: 1, name: options.name, owner, source, identity: secret(), controlSecret: secret(), project: "carberk-" + options.name + "-" + secret().slice(0, 10),
        database: "local_ui", profile: options.profile ?? "empty", phase: "created", preparation: "absent",
        storageSecret: secret(), accessSecret: secret(), refreshSecret: secret(), sessionSecret: secret(), totpSecret: randomBytes(32).toString("base64") };
      await save(directory, state);
    }
    const live = await sessions(state, directory);
    const config = YAML.parse(await readFile(join(ROOT, "infra/compose/docker-compose.ci.yml"), "utf8"));
    const containers = await ownedResources(state, run, config);
    if (options.operation === "status") {
      const result = report(state, directory, live, containers); out(result); return result;
    }
    if (options.operation === "reset-signin-quota") {
      const result = await resetSignInQuota(state, containers, run);
      out(result);
      return result;
    }
    if (options.operation === "stop") {
      for (const app of APPS) if (live[app]) await sessionRequest(directory, app, state.controlSecret, "stop");
      const ids = containers.filter(container => container.running).map(container => container.id);
      if (ids.length) await run("docker", ["stop", ...ids]);
      state.phase = "stopped";
      await save(directory, state);
      const result = report(state, directory, {}); out(result); return result;
    }
    if (Object.values(live).some(session => session && session.status !== "ready")) throw new Error("An owned session is unhealthy; stop/up to recover it; data is preserved");
    if (Object.values(live).some(Boolean) && (containers.length !== 3 || containers.some(container => !container.running))) throw new Error("Infrastructure changed under live sessions; stop/up to rebind owned services");
    if (Object.values(live).some(Boolean) && JSON.stringify(source) !== JSON.stringify(state.source)) throw new Error("Source changed; stop this owned runtime, then up to rebuild and bind the new source");
    if (state.preparation === "incomplete") throw new Error(`Fixture preparation interrupted; inspect ${directory}/prepare.log. No automatic fixture replay; use a fresh named runtime or recover the exact existing fixture steps`);
    if (!Object.values(live).some(Boolean)) {
      state.source = source;
      state.ports = await bindings(state.ports);
    }
    if (state.dockerPorts && !containers.some(container => container.running)) state.dockerPortsPinned = true;
    const compose = await composeFile(state, directory, config);
    state.phase = "starting-infra";
    await save(directory, state);
    await run("docker", [...compose, "up", "-d", "--wait", "--wait-timeout", "120"], { log: join(directory, "docker.log") });
    const dockerPorts = {};
    for (const [service, port] of DOCKER_PORTS) {
      const published = await run("docker", [...compose, "port", service, String(port)]);
      if (!/^127\.0\.0\.1:\d+$/.test(published)) throw new Error("Docker did not publish one loopback port; inspect owned docker.log");
      dockerPorts[service] = Number(published.split(":")[1]);
    }
    if (state.dockerPorts && Object.entries(dockerPorts).some(([service, port]) => state.dockerPorts[service] !== port)) {
      throw new Error("Docker bindings changed; previous ports and env files retained. Use stop/up to restore owned bindings");
    }
    state.dockerPorts ??= dockerPorts;
    await save(directory, state);
    const envs = await environments(state, directory);
    state.environment = digest(JSON.stringify(envs));
    state.phase = options.infraOnly ? "infra-ready" : "preparing";
    await save(directory, state);
    if (!options.infraOnly) {
      await run("pnpm", ["exec", "turbo", "run", "build", "--filter=@auto-tm/api", "--filter=@auto-tm/worker", "--concurrency=1"], { env: envs.api, log: join(directory, "build.log") });
      await run("pnpm", ["db:migrate:deploy"], { env: envs.api, log: join(directory, "migrate.log") });
      await run("pnpm", ["minio:bootstrap"], { env: envs.api, log: join(directory, "buckets.log") });
      if (state.profile !== "empty" && state.preparation === "absent") {
        state.preparation = "incomplete";
        await save(directory, state);
        if (state.profile === "history") {
          await run(process.execPath, ["scripts/history-ui-fixture.mjs", "init", "--api", `http://127.0.0.1:${state.ports.api}/api/v1`, "--admin", `http://127.0.0.1:${state.ports.admin}`,
            "--api-env", join(directory, "api.env"), "--api-log", join(directory, "api.log"), "--expected-db", state.database, "--reason", `Initial owned runtime ${state.name}`], { env: envs.api, log: join(directory, "prepare.log") });
          state.preparation = "history-initialized";
        } else {
          await run("docker", [...compose, "exec", "-T", "postgres", "psql", "-v", "ON_ERROR_STOP=1", "-U", "auto_tm_ci", "-d", state.database, "-c",
            "DO $$ DECLARE t text; occupied boolean; BEGIN FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations' LOOP EXECUTE format('SELECT EXISTS (SELECT FROM %I LIMIT 1)', t) INTO occupied; IF occupied THEN RAISE EXCEPTION 'Occupied target; choose a fresh runtime'; END IF; END LOOP; END $$;"], { log: join(directory, "empty-check.log") });
          await run("pnpm", ["db:seed"], { env: envs.api, log: join(directory, "catalog.log") });
          await run("pnpm", ["--filter", "@auto-tm/db", "ui:fixture"], { env: envs.api, log: join(directory, "prepare.log") });
          state.preparation = "native-base";
        }
        await save(directory, state);
      }
      state.phase = "starting-apps";
      await save(directory, state);
      for (const app of ["api", "worker", ...options.apps]) {
        if (!live[app]) await startSession({ directory, app, identity: state.controlSecret, port: state.ports[app], env: envs[app], cwd: ROOT });
      }
      if (state.profile === "native") {
        state.phase = "checking-fixtures";
        const ownerId = "f1000000-0000-4000-8000-000000000001", viewerId = "f1000000-0000-4000-8000-000000000010";
        if (state.preparation === "native-base") {
          state.preparation = "incomplete";
          await save(directory, state);
          for (const set of ["photos", "private-drafts", "videos"]) {
            const args = ["--filter", "@auto-tm/db", "exec", "tsx", "scripts/rich-scenarios.ts", "--target", "local", "--owner-id", ownerId, "--scenario-set", set,
              ...(set === "videos" ? ["--viewer-id", viewerId, "--worker-env", join(directory, "worker.env")] : [])];
            const log = join(directory, "rich-" + set + ".log");
            const plan = JSON.parse(await run("pnpm", [...args, "--mode", "plan"], { env: envs.api, log }));
            if (!/^[a-f0-9]{64}$/.test(plan.planHash)) throw new Error("Fixture plan did not return a hash; inspect private rich log");
            await run("pnpm", [...args, "--mode", "apply", "--plan-hash", plan.planHash], { env: envs.api, log });
          }
          state.preparation = "native-processing";
          await save(directory, state);
        }
        const readyArgs = ["native:ready", "--api-origin", `http://127.0.0.1:${state.ports.api}`, "--env-file", join(directory, "api.env"), "--worker-env", join(directory, "worker.env"), "--owner-id", ownerId, "--viewer-id", viewerId];
        for (let attempt = 0; ; attempt++) {
          try {
            await run("pnpm", readyArgs, { env: envs.api, log: join(directory, "native-ready.log") });
            state.preparation = "native-rich-checked";
            break;
          } catch (error) {
            const diagnostic = await readFile(join(directory, "native-ready.log"), "utf8");
            if (state.preparation !== "native-processing" || attempt === 30 || !/In-flight generation|API readiness/.test(diagnostic)) throw error;
            await delay(2000);
          }
        }
      }
    }
    state.phase = options.infraOnly ? "infra-ready" : "ready";
    await save(directory, state);
    const result = report(state, directory, await sessions(state, directory), await ownedResources(state, run, config)); out(result); return result;
  } finally { await rm(lock, { recursive: true }); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { await localEnv(process.argv.slice(2), { out: value => console.log(typeof value === "string" ? value : JSON.stringify(value)) }); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}

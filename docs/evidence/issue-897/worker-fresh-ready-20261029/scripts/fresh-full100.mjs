// Fresh ordinary full100 ownership-expiry runner. Task-owned namespace only.
// Phases: pin | preflight | plan | provision | bootstrap | producer | drain | template | native | cleanup
// pin/preflight/plan change nothing (pin writes only pins.json). Every other phase needs the parent's START token in
// FRESH_FULL100_START and acts only on the compose project and /tmp namespace named below. --dry-run prints the exact
// commands of any phase without executing them. Never touches the retained auto_tm_ci_897_r6c_candidatea_1 stack.
import { createHash, randomUUID } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, openSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = "/Users/bagtyyar/.t3/worktrees/carberk/t3-52806f37";
const TOOLS = "/tmp/897-r6c-fresh-ready-20261029";
const RUN = "/tmp/897-r6c-fresh102-20261029";
const PROJECT = "auto_tm_ci_897_r6c_fresh102_20261029";
const COMPOSE = "infra/compose/docker-compose.ci.yml";
const MANIFEST = "docs/evidence/issue-897/worker-fresh-ready-20261029/migration-manifest.json";
const PARENT = "fc77bc55cd83fdaa502aba236697d4b3c5260659";
const DB = "ownership_fresh", OWNER = "auto_tm_ci";
const BOOT = "apps/worker/src/jobs/diagnostics/testing/bootstrapOwnershipExpiryFixture.mjs";
const PRODUCE = "apps/worker/src/jobs/diagnostics/testing/produceOwnershipExpiryFixture.mjs";
const SPEC = "src/jobs/diagnostics/DiagnosticWorkerOwnershipExpiry.e2e.spec.ts";
const args = process.argv.slice(2), DRY = args.includes("--dry-run"), [phase, ...rest] = args.filter(arg => arg !== "--dry-run");
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const read = path => readFileSync(join(ROOT, path));
const out = value => console.log(JSON.stringify(value, null, 2));
const fail = message => { console.error(`REFUSED: ${message}`); process.exit(2); };
const pinsPath = join(TOOLS, "pins.json"), runtimePath = join(RUN, "runtime.json");
const sh = (label, argv, { env = {}, cwd = ROOT, log, timeout } = {}) => {
  if (DRY) { console.log(JSON.stringify({ dryRun: label, argv, cwd, envKeys: Object.keys(env) })); return { status: 0, stdout: "", stderr: "" }; }
  const result = spawnSync(argv[0], argv.slice(1), { cwd, env: { ...process.env, ...env }, encoding: "utf8", timeout, maxBuffer: 256 << 20 });
  if (log) writeFileSync(log, `${result.stdout ?? ""}${result.stderr ?? ""}`, { mode: 0o600, flag: "wx" });
  return result;
};
const compose = (...more) => ["docker", "compose", "-p", PROJECT, "-f", COMPOSE, ...more];
const psql = (database, sql) => sh(`psql ${database}`, compose("exec", "-T", "postgres", "psql", "-U", OWNER, "-d", database, "-v", "ON_ERROR_STOP=1", "-At", "-c", sql));
const requireStart = () => {
  const pins = JSON.parse(readFileSync(pinsPath, "utf8"));
  if (!DRY && process.env.FRESH_FULL100_START !== pins.startToken) fail("Parent START token required; no workload was started");
};
const runtime = () => existsSync(runtimePath) ? JSON.parse(readFileSync(runtimePath, "utf8"))
  : DRY ? { ports: { postgres: "<dynamic>", redis: "<dynamic>", minio: "<dynamic>" }, ownerUrl: "postgresql://owner@127.0.0.1:1/placeholder", redisUrl: "redis://127.0.0.1:1", minioUrl: "http://127.0.0.1:1" } : fail("Run provision first");
const serviceEnv = rt => ({ DATABASE_URL: rt.ownerUrl, DIAGNOSTIC_WORKER_FIXTURE_OWNER_URL: rt.ownerUrl, REDIS_URL: rt.redisUrl, MINIO_ENDPOINT: rt.minioUrl,
  MINIO_PUBLIC_URL: rt.minioUrl, MINIO_ACCESS_KEY: "minioadmin", MINIO_SECRET_KEY: "minioadmin", MINIO_REGION: "us-east-1",
  JWT_ACCESS_SECRET: "ci_only_access_secret_0123456789abcdef", JWT_REFRESH_SECRET: "ci_only_refresh_secret_0123456789abcdef",
  TOTP_SECRET_ENCRYPTION_KEY: "MDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDA=", REPORT_ENTRY_ENABLED: "true", ADMIN_MODERATION_ACTIONS_ENABLED: "true" });
const withDb = (url, database) => { const next = new URL(url); next.pathname = `/${database}`; return next.toString(); };
const caller = () => JSON.parse(readFileSync(join(RUN, "bootstrap", "caller-env.private.json"), "utf8"));
const fingerprint = database => psql(database, `SELECT md5(string_agg(n||':'||t,',' ORDER BY n)) FROM (SELECT c.relname n,
  (xpath('/row/c/text()',query_to_xml(format('select md5(coalesce(string_agg(t::text,'''' order by t::text),'''')) as c from %I.%I t',n.nspname,c.relname),false,true,'')))[1]::text t
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind='r' AND n.nspname='public') x`);
const pinned = () => {
  const migrations = readdirSync(join(ROOT, "packages/db/prisma/migrations"), { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => entry.name).sort()
    .map(name => ({ migration_name: name, checksum: sha(read(`packages/db/prisma/migrations/${name}/migration.sql`)) }));
  const tracked = spawnSync("git", ["ls-files", "apps/worker/src/jobs/diagnostics", "apps/worker/test", "apps/worker/vitest.config.mts"], { cwd: ROOT, encoding: "utf8" }).stdout.trim().split("\n");
  const compiled = ["DiagnosticOwnershipGrants", "DiagnosticOwnershipCapture", "PrismaDiagnosticIntake", "PrismaDiagnosticContinuityProofs"]
    .flatMap(name => [`apps/api/src/modules/diagnostics/infrastructure/${name}.ts`, `apps/api/dist/src/modules/diagnostics/infrastructure/${name}.js`]);
  const files = Object.fromEntries([...tracked, ...compiled, COMPOSE, "pnpm-lock.yaml", "packages/db/prisma/schema.prisma"].map(path => [path, sha(read(path))]));
  return { migrations, manifestSha256: sha(read(MANIFEST)), files, head: spawnSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).stdout.trim() };
};
const namespaceEmpty = () => {
  const containers = spawnSync("docker", ["ps", "-a", "-q", "--filter", `label=com.docker.compose.project=${PROJECT}`], { encoding: "utf8" }).stdout.trim();
  return { containers: containers || null, runDirectory: existsSync(RUN) };
};

if (phase === "pin") {
  const now = pinned(), previous = existsSync(pinsPath) ? JSON.parse(readFileSync(pinsPath, "utf8")) : {};
  writeFileSync(pinsPath, JSON.stringify({ parent: PARENT, startToken: previous.startToken ?? randomUUID(), pinnedAt: new Date().toISOString(), ...now, migrations: undefined,
    migrationCount: now.migrations.length, migrationNewest: now.migrations.at(-1) }, null, 2), { mode: 0o600 });
  out({ pinned: pinsPath, migrationCount: now.migrations.length, head: now.head });
} else if (phase === "preflight" || phase === "plan") {
  const pins = JSON.parse(readFileSync(pinsPath, "utf8")), now = pinned(), drift = [];
  for (const [path, hash] of Object.entries(pins.files)) if (now.files[path] !== hash) drift.push(path);
  for (const path of Object.keys(now.files)) if (!(path in pins.files)) drift.push(`unpinned ${path}`);
  const manifest = JSON.parse(read(MANIFEST));
  const chainEqual = JSON.stringify(manifest.migrations) === JSON.stringify(now.migrations) && now.manifestSha256 === pins.manifestSha256;
  const ancestor = spawnSync("git", ["merge-base", "--is-ancestor", PARENT, "HEAD"], { cwd: ROOT }).status === 0;
  const retained = spawnSync("docker", ["ps", "-a", "--format", "{{.Names}}"], { encoding: "utf8" }).stdout.trim().split("\n").filter(Boolean);
  const workloads = spawnSync("pgrep", ["-fl", "OwnershipExpiryFixture|DiagnosticWorkerOwnership|vitest"], { encoding: "utf8" }).stdout.trim().split("\n")
    .filter(line => line && !line.includes("fresh-full100") && !line.includes("zsh -c")).map(line => line.slice(0, 140));
  const result = { head: now.head, headDescendsFromParent: ancestor, migrationCount: now.migrations.length, chainEqualsPinnedManifest: chainEqual, driftedFiles: drift,
    namespace: namespaceEmpty(), freshProjectContainersPresent: retained.filter(name => name.startsWith(PROJECT)), otherContainersUntouched: retained.filter(name => !name.startsWith(PROJECT)).length,
    hostWorkloadsNotOwnedByThisTask: workloads, load: JSON.stringify(spawnSync("uptime", { encoding: "utf8" }).stdout.trim()) };
  out(result);
  if (phase === "preflight" && (!ancestor || !chainEqual || drift.length || result.namespace.containers || result.namespace.runDirectory)) fail("Pin drift, wrong parent or namespace not empty; refresh only the exact pin from the accepted parent");
  if (phase === "plan") for (const step of ["provision", "bootstrap", "producer", "drain", "template", "native", "cleanup"]) {
    console.log(`\n## ${step}`);
    spawnSync(process.execPath, [new URL(import.meta.url).pathname, step, "--dry-run"], { stdio: "inherit" });
  }
} else if (phase === "provision") {
  requireStart();
  if (!DRY && (namespaceEmpty().containers || namespaceEmpty().runDirectory)) fail("Namespace already exists");
  if (!DRY) mkdirSync(RUN, { mode: 0o700 });
  sh("compose up", compose("up", "-d", "--wait", "--wait-timeout", "180"), { log: DRY ? undefined : join(RUN, "services-up.log") });
  const port = service => DRY ? "<dynamic>" : sh(`port ${service}`, compose("port", service, String({ postgres: 5432, redis: 6379, minio: 9000 }[service]))).stdout.trim().split(":").at(-1);
  const ports = { postgres: port("postgres"), redis: port("redis"), minio: port("minio") };
  if (!DRY && (Object.values(ports).some(value => !/^\d+$/.test(value) || ["5432", "6379", "9000"].includes(value)))) fail("Dynamic task-only ports required");
  psql(OWNER, `CREATE DATABASE ${DB}`);
  const ownerUrl = `postgresql://${OWNER}:auto_tm_ci_pass@127.0.0.1:${ports.postgres}/${DB}`;
  const rt = { project: PROJECT, ports: Object.fromEntries(Object.entries(ports).map(([key, value]) => [key, Number(value) || value])), db: DB, ownerUrl,
    redisUrl: `redis://127.0.0.1:${ports.redis}`, minioUrl: `http://127.0.0.1:${ports.minio}` };
  if (!DRY) writeFileSync(runtimePath, JSON.stringify(rt, null, 2), { mode: 0o600, flag: "wx" });
  sh("migrate deploy", ["pnpm", "--filter", "@auto-tm/db", "run", "migrate:deploy"], { env: { DATABASE_URL: ownerUrl }, log: DRY ? undefined : join(RUN, "migrate.log") });
  const config = { evidenceDir: join(RUN, "bootstrap"), resourceIdentity: { composeProject: PROJECT, ports: rt.ports },
    migrationPin: { manifestPath: join(ROOT, MANIFEST), manifestSha256: JSON.parse(readFileSync(pinsPath, "utf8")).manifestSha256 } };
  if (!DRY) writeFileSync(join(RUN, "config.json"), JSON.stringify(config, null, 2), { mode: 0o600, flag: "wx" });
  out({ provisioned: PROJECT, ports: rt.ports, config: DRY ? config : join(RUN, "config.json") });
} else if (phase === "bootstrap") {
  requireStart();
  const rt = runtime(), argv = ["node", BOOT, "serve", join(RUN, "config.json")];
  if (DRY) sh("bootstrap serve (detached, SIGTERM to stop)", argv, { env: serviceEnv(rt) });
  else {
    const log = join(RUN, "bootstrap.log");
    const child = spawn(argv[0], argv.slice(1), { cwd: ROOT, env: { ...process.env, ...serviceEnv(rt) }, detached: true, stdio: ["ignore", openLog(log), openLog(log)] });
    child.unref(); writeFileSync(join(RUN, "bootstrap.pid"), String(child.pid), { mode: 0o600, flag: "wx" });
    // Bounded wait for the ready receipt or process exit; no timing claim is made from it.
    const ready = join(RUN, "bootstrap", "caller-env.private.json");
    for (let i = 0; i < 1800 && !existsSync(ready); i += 1) { if (!alive(child.pid)) fail(`Bootstrap exited; preserve ${RUN}/bootstrap first-failure evidence`); spawnSync("sleep", ["0.2"]); }
    if (!existsSync(ready)) fail("Bootstrap not ready within 360s; process left running for inspection");
    out({ bootstrapPid: child.pid, receipt: join(RUN, "bootstrap", "bootstrap.json") });
  }
} else if (phase === "producer") {
  requireStart();
  const rt = runtime(), env = { DATABASE_URL: DRY ? "<producer-database-url>" : caller().producerDatabaseUrl };
  const result = sh("ordinary producer (original native120s deadline, request5s, 45s rights horizon)", ["node", PRODUCE, DRY ? "<producer-config.private.json>" : caller().producerConfig],
    { env: { ...serviceEnv(rt), ...env }, log: DRY ? undefined : join(RUN, "producer.log") });
  if (!DRY) out({ exit: result.status, fixture: existsSync(join(RUN, "bootstrap", "fixture.json")) ? join(RUN, "bootstrap", "fixture.json") : null });
} else if (phase === "drain") {
  requireStart();
  if (DRY) { out({ dryRun: "SIGTERM bootstrap.pid; wait for exit; require zero connections to the task DB and receipts 0/0" }); }
  else {
    const pid = Number(readFileSync(join(RUN, "bootstrap.pid"), "utf8"));
    if (alive(pid)) process.kill(pid, "SIGTERM");
    for (let i = 0; i < 300 && alive(pid); i += 1) spawnSync("sleep", ["0.2"]);
    if (alive(pid)) fail("Bootstrap did not exit gracefully; no SIGKILL sent, inspect before proceeding");
    out({ connections: psql(OWNER, `SELECT count(*) FROM pg_stat_activity WHERE datname='${DB}'`).stdout.trim(),
      receipts: psql(DB, "SELECT (SELECT count(*) FROM diagnostic_source_commands)||'/'||(SELECT count(*) FROM campaign_preparations)").stdout.trim() });
  }
} else if (phase === "template") {
  requireStart();
  const attempt = rest[0] ?? "ownership_attempt1";
  if (!/^ownership_attempt\d+$/.test(attempt)) fail("Attempt database name must be ownership_attemptN");
  psql(OWNER, `CREATE DATABASE ${attempt} TEMPLATE ${DB}`);
  out({ attempt, pristine: fingerprint(DB).stdout?.trim(), clone: fingerprint(attempt).stdout?.trim(),
    note: "Fingerprints must match before native. MinIO objects are shared; snapshot/restore storage separately if a repeat attempt is needed." });
} else if (phase === "native") {
  requireStart();
  const database = rest[0] ?? "ownership_attempt1", rt = runtime(), evidence = join(RUN, `native-${database}`);
  const workerUrl = DRY ? "<worker-url>" : withDb(caller().workerDatabaseUrl, database);
  const result = sh("single native full100 ownership-expiry (per-test 60s budget)", ["pnpm", "--filter", "@auto-tm/worker", "exec", "vitest", "run", SPEC, "--maxWorkers=1"],
    { env: { ...serviceEnv(rt), AUTO_TM_TEST_DATABASES: "off", DATABASE_URL: workerUrl, DIAGNOSTIC_WORKER_FIXTURE_OWNER_URL: withDb(rt.ownerUrl, database),
      DIAGNOSTIC_WORKER_OWNERSHIP_ACCEPTANCE: "1", DIAGNOSTIC_WORKER_OWNERSHIP_FIXTURE: join(RUN, "bootstrap", "fixture.json"),
      DIAGNOSTIC_WORKER_OWNERSHIP_EVIDENCE_DIR: evidence, DIAGNOSTIC_WORKER_OWNERSHIP_BATCH_ACCEPTANCE: "0" }, log: DRY ? undefined : join(RUN, `native-${database}.log`) });
  if (!DRY) out({ exit: result.status, log: join(RUN, `native-${database}.log`) });
} else if (phase === "cleanup") {
  requireStart();
  if (!DRY && !rest.includes("--evidence-retained")) fail("Pass --evidence-retained after logs and failure state are preserved");
  const rt = runtime();
  for (const attempt of DRY ? ["ownership_attemptN"] : psql(OWNER, "SELECT datname FROM pg_database WHERE datname LIKE 'ownership_attempt%'").stdout.trim().split("\n").filter(Boolean)) psql(OWNER, `DROP DATABASE ${attempt}`);
  sh("bootstrap cleanup (trigger restoration, role drop; refuses nonzero receipts)", ["node", BOOT, "cleanup", join(RUN, "config.json")], { env: serviceEnv(rt) });
  sh("destroy exact task project with volumes", compose("down", "-v"));
} else fail("Unknown phase");

function alive(pid) { try { process.kill(pid, 0); return true; } catch { return false; } }
function openLog(path) { return openSync(path, "a", 0o600); }

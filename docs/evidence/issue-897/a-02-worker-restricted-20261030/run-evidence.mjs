// Evidence orchestration only. Candidate source and test files are read-only.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const evidence = dirname(fileURLToPath(import.meta.url));
const runtime = "/tmp/carberk-a02-worker-restricted-f6408755";
const source = join(runtime, "source");
const project = "auto_tm_ci_897_a02_f6408755";
const phase = process.argv[2];
const compose = ["compose", "-p", project, "-f", join(source, "infra/compose/docker-compose.ci.yml"), "-f", join(runtime, "ports.yml")];
const environment = {
  ...process.env,
  DATABASE_URL: "postgresql://auto_tm_ci:auto_tm_ci_pass@127.0.0.1:61139/a02_worker",
  REDIS_URL: "redis://127.0.0.1:61138",
  MINIO_ENDPOINT: "http://127.0.0.1:61140",
  AUTO_TM_TEST_DATABASES: "off",
  GITHUB_ACTIONS: "false",
};
for (const key of Object.keys(environment)) if (key.startsWith("DIAGNOSTIC_WORKER_")) delete environment[key];
const hash = data => createHash("sha256").update(data).digest("hex");
function run(name, program, args, extra = {}, acceptFailure = false) {
  const startedAt = new Date().toISOString();
  const result = spawnSync(program, args, { cwd: source, env: { ...environment, ...extra }, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}${result.error ? String(result.error) : ""}`;
  writeFileSync(join(evidence, `${name}.log`), output, { flag: "wx" });
  const record = { name, program, arguments: args, cwd: source, startedAt, finishedAt: new Date().toISOString(), exitCode: result.status,
    signal: result.signal, error: result.error ? String(result.error) : null, log: `${name}.log`, logSha256: hash(output), environmentNames: Object.keys(extra) };
  writeFileSync(join(evidence, `${name}.command.json`), JSON.stringify(record, null, 2) + "\n", { flag: "wx" });
  console.log(JSON.stringify(record));
  if (result.status !== 0 && !acceptFailure) process.exit(result.status ?? 1);
  return result;
}
const psql = sql => run(`create-database`, "docker", ["exec", `${project}-postgres-1`, "psql", "-U", "auto_tm_ci", "-d", "auto_tm_ci", "-v", "ON_ERROR_STOP=1", "-c", sql]);
if (phase === "provision") {
  run("services-up", "docker", [...compose, "up", "-d", "--wait", "--wait-timeout", "180"]);
  psql("CREATE DATABASE a02_worker");
} else if (phase === "build") {
  run("contracts-build", "pnpm", ["--filter", "@auto-tm/contracts", "build"]);
  run("db-build", "pnpm", ["--filter", "@auto-tm/db", "build"]);
} else if (phase === "migrate") {
  run("migrate-deploy", "pnpm", ["--filter", "@auto-tm/db", "run", "migrate:deploy"]);
} else if (phase === "preparation" || phase === "batch") {
  const preparation = phase === "preparation", name = preparation ? "restricted-preparation" : "ownership-batch";
  const spec = preparation ? "DiagnosticWorkerPreparation.e2e.spec.ts" : "DiagnosticWorkerOwnershipBatch.e2e.spec.ts";
  const enabled = preparation ? { DIAGNOSTIC_WORKER_PREPARATION_ACCEPTANCE: "1", DIAGNOSTIC_WORKER_EVIDENCE_DIR: join(evidence, name) }
    : { DIAGNOSTIC_WORKER_OWNERSHIP_BATCH_ACCEPTANCE: "1", DIAGNOSTIC_WORKER_OWNERSHIP_BATCH_EVIDENCE_DIR: join(evidence, name) };
  const result = run(name, "pnpm", ["--filter", "@auto-tm/worker", "test", `src/jobs/diagnostics/${spec}`, "--maxWorkers=1", "--reporter=default", "--reporter=json", `--outputFile=${join(evidence, `${name}.vitest.json`)}`], enabled, true);
  process.exitCode = result.status ?? 1;
} else if (phase === "observe") {
  const name = process.argv[3];
  if (!/^[a-z-]+$/.test(name ?? "")) throw new Error("Named observation required");
  process.env.DATABASE_URL = environment.DATABASE_URL;
  const require = createRequire(join(source, "apps/worker/package.json"));
  const { PrismaService } = require("@auto-tm/db");
  const { S3Client, ListBucketsCommand, ListObjectsV2Command } = require("@aws-sdk/client-s3");
  const db = new PrismaService();
  const s3 = new S3Client({ endpoint: environment.MINIO_ENDPOINT, region: "us-east-1", forcePathStyle: true, credentials: { accessKeyId: "minioadmin", secretAccessKey: "minioadmin" } });
  try {
    const migrations = await db.$queryRawUnsafe("SELECT migration_name,checksum,finished_at,rolled_back_at FROM _prisma_migrations ORDER BY migration_name");
    const manifest = JSON.parse(readFileSync(join(evidence, "migration-manifest.json")));
    const applied = migrations.map(({ migration_name, checksum }) => ({ migration_name, checksum }));
    const allMigrationsFinished = migrations.every(row => row.finished_at !== null && row.rolled_back_at === null);
    const chainMatchesCandidate = JSON.stringify(applied) === JSON.stringify(manifest.migrations);
    const roles = await db.$queryRawUnsafe("SELECT rolname,rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls FROM pg_roles WHERE rolname='auto_tm_ci' OR rolname LIKE 'r6c_%' ORDER BY rolname");
    const triggers = await db.$queryRawUnsafe("SELECT c.relname,t.tgname,t.tgenabled::text,t.tgfoid::regprocedure::text,pg_get_triggerdef(t.oid) AS definition FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE c.relnamespace='public'::regnamespace AND NOT t.tgisinternal ORDER BY c.relname,t.tgname");
    const receipts = await db.$queryRawUnsafe("SELECT (SELECT count(*)::int FROM diagnostic_source_commands) AS source,(SELECT count(*)::int FROM campaign_preparations) AS campaign");
    const readiness = await db.$queryRawUnsafe("SELECT diagnostic_source_guards_ready() AS source,campaign_preparation_ready() AS campaign");
    const connections = await db.$queryRawUnsafe("SELECT usename,state,count(*)::int FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() GROUP BY usename,state ORDER BY usename,state");
    const tables = await db.$queryRawUnsafe("SELECT tablename FROM pg_tables WHERE schemaname='public' AND (tablename LIKE 'diagnostic_%' OR tablename IN ('users','inspection_orders','sessions','campaign_preparations')) ORDER BY tablename");
    const rows = {};
    for (const { tablename } of tables) rows[tablename] = await db.$queryRawUnsafe(`SELECT * FROM public."${tablename}" ORDER BY 1`);
    const buckets = [];
    for (const bucket of (await s3.send(new ListBucketsCommand({}))).Buckets ?? []) {
      const objects = await s3.send(new ListObjectsV2Command({ Bucket: bucket.Name }));
      buckets.push({ name: bucket.Name, objects: objects.Contents ?? [], truncated: objects.IsTruncated });
    }
    const state = { recordedAt: new Date().toISOString(), name, project, database: "a02_worker", chainMatchesCandidate, allMigrationsFinished,
      migrations, roles, triggers, receipts, readiness, connections, rows, buckets };
    writeFileSync(join(evidence, `${name}.json`), JSON.stringify(state, (_, value) => typeof value === "bigint" ? value.toString() : value, 2) + "\n", { flag: "wx" });
    console.log(JSON.stringify({ name, chainMatchesCandidate, allMigrationsFinished, roles: roles.map(row => row.rolname), receipts, readiness,
      connections, nonemptyTables: Object.fromEntries(Object.entries(rows).filter(([, values]) => values.length).map(([table, values]) => [table, values.length])), buckets: buckets.map(bucket => ({ name: bucket.name, objects: bucket.objects.length })) }));
    if (!chainMatchesCandidate || !allMigrationsFinished) throw new Error("Applied migration chain differs from candidate");
  } finally { await db.onModuleDestroy(); s3.destroy(); }
} else if (phase === "cleanup") {
  run("services-down", "docker", [...compose, "down", "-v"]);
  run("project-containers-after-cleanup", "docker", ["ps", "-a", "--filter", `label=com.docker.compose.project=${project}`, "--format", "{{json .}}"]);
  run("project-volumes-after-cleanup", "docker", ["volume", "ls", "--filter", `label=com.docker.compose.project=${project}`, "--format", "{{json .}}"]);
} else throw new Error("Unknown phase");

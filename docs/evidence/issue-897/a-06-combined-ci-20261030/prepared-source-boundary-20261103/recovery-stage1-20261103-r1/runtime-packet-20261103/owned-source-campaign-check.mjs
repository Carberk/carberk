import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const packetRoot = dirname(fileURLToPath(import.meta.url));
const workdir = process.env.RUNTIME_PACKET_WORKDIR;
const project = process.env.COMPOSE_PROJECT ?? "auto_tm_ci_897_938_s1_20261103_r1";
const baseCompose = process.env.COMPOSE_BASE_FILE ?? join(workdir ?? process.cwd(), "infra/compose/docker-compose.ci.yml");
const overlay = process.env.COMPOSE_OVERLAY ?? join(packetRoot, "compose-overlay.yml");
if (!workdir) throw new Error("RUNTIME_PACKET_WORKDIR is required");
const pattern = /^auto_tm_897_938_s1r1_t[a-f0-9]{6}_(?:template|w1)$/;
const composePsql = database => ["docker", "compose", "--file", baseCompose, "--file", overlay, "--project-name", project, "exec", "-T", "postgres", "psql", "-U", "auto_tm_ci", "-d", database, "-X", "-v", "ON_ERROR_STOP=1"];
const psql = (database, args) => execFileSync(composePsql(database)[0], [...composePsql(database).slice(1), ...args], { cwd: workdir, encoding: "utf8" });
const names = psql("auto_tm_ci", ["-At", "-c", "SELECT datname FROM pg_database WHERE datname ~ '^auto_tm_897_938_s1r1_t[a-f0-9]{6}_(template|w1)$' ORDER BY datname;"]).split(/\r?\n/).map(row => row.trim()).filter(Boolean);
const namesMustBeEmpty = process.env.EXPECT_EMPTY_DATABASES === "1";
if (namesMustBeEmpty && names.length !== 0) throw new Error(`expected globalSetup teardown to leave no anchored databases, found ${names.join(",")}`);
const results = [];
for (const database of names) {
  if (!pattern.test(database)) throw new Error(`unexpected owned database name: ${database}`);
  const value = psql(database, ["-At", "-c", "SELECT (SELECT count(*) FROM public.diagnostic_source_commands)::int,(SELECT count(*) FROM public.campaign_preparations)::int;"]).trim();
  const [source, campaign] = value.split("|").map(Number);
  if (source !== 0 || campaign !== 0) throw new Error(JSON.stringify({ database, source, campaign }));
  results.push({ database, source, campaign });
}
process.stdout.write(JSON.stringify({ databases: results, teardownAlreadyCompleted: names.length === 0 }) + "\n");

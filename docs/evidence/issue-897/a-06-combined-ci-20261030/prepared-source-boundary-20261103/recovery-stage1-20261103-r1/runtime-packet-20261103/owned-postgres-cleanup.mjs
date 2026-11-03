import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const packetRoot = dirname(fileURLToPath(import.meta.url));
const workdir = process.env.RUNTIME_PACKET_WORKDIR;
const project = process.env.COMPOSE_PROJECT ?? "auto_tm_ci_897_938_s1_20261103_r1";
const baseCompose = process.env.COMPOSE_BASE_FILE ?? join(workdir ?? process.cwd(), "infra/compose/docker-compose.ci.yml");
const overlay = process.env.COMPOSE_OVERLAY ?? join(packetRoot, "compose-overlay.yml");
if (!workdir) throw new Error("RUNTIME_PACKET_WORKDIR is required");
const baseDatabase = "auto_tm_897_938_s1r1";
const runPattern = /^auto_tm_897_938_s1r1_t[a-f0-9]{6}_(?:template|w1)$/;
const roles = ["r938_s1_capture", "r938_s1_handoff", "r938_s1_discovery", "r938_s1_readers"];
const roleSql = roles.map(role => `'${role}'`).join(",");
const composePsql = database => ["docker", "compose", "--file", baseCompose, "--file", overlay, "--project-name", project, "exec", "-T", "postgres", "psql", "-U", "auto_tm_ci", "-d", database, "-X", "-v", "ON_ERROR_STOP=1"];
const psql = (database, args) => execFileSync(composePsql(database)[0], [...composePsql(database).slice(1), ...args], { cwd: workdir, encoding: "utf8" });
const rows = sql => psql("auto_tm_ci", ["-At", "-c", sql]).split(/\r?\n/).map(row => row.trim()).filter(Boolean);
const databases = rows("SELECT datname FROM pg_database WHERE datname ~ '^auto_tm_897_938_s1r1_t[a-f0-9]{6}_(template|w1)$' ORDER BY datname;");
for (const name of databases) {
  if (!runPattern.test(name)) throw new Error(`unexpected owned database name: ${name}`);
  psql("auto_tm_ci", ["-c", `DROP DATABASE IF EXISTS \"${name}\" WITH (FORCE);`]);
}
if (rows("SELECT 1 FROM pg_database WHERE datname = 'auto_tm_897_938_s1r1';").length) psql("auto_tm_ci", ["-c", `DROP DATABASE IF EXISTS \"${baseDatabase}\" WITH (FORCE);`]);
const backends = Number(psql("auto_tm_ci", ["-At", "-c", `SELECT count(*)::int FROM pg_stat_activity WHERE usename IN (${roleSql}) AND pid <> pg_backend_pid();`]).trim() || "0");
if (backends !== 0) throw new Error(`owned role backends remain: ${backends}`);
for (const role of roles) psql("auto_tm_ci", ["-c", `DROP ROLE IF EXISTS \"${role}\";`]);
const remainingDatabases = rows("SELECT datname FROM pg_database WHERE datname = 'auto_tm_897_938_s1r1' OR datname ~ '^auto_tm_897_938_s1r1_t[a-f0-9]{6}_(template|w1)$';");
const remainingRoles = rows(`SELECT rolname FROM pg_roles WHERE rolname IN (${roleSql}) ORDER BY rolname;`);
if (remainingDatabases.length || remainingRoles.length) throw new Error(JSON.stringify({ remainingDatabases, remainingRoles }));
process.stdout.write(JSON.stringify({ droppedDatabases: databases, baseDatabase, droppedRoles: roles, remainingDatabases, remainingRoles }) + "\n");

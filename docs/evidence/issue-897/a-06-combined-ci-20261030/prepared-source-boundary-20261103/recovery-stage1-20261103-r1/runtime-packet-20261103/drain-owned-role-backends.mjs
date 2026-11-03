import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const packetRoot = dirname(fileURLToPath(import.meta.url));
const workdir = process.env.RUNTIME_PACKET_WORKDIR;
const project = process.env.COMPOSE_PROJECT ?? "auto_tm_ci_897_938_s1_20261103_r1";
const baseCompose = process.env.COMPOSE_BASE_FILE ?? join(workdir ?? process.cwd(), "infra/compose/docker-compose.ci.yml");
const overlay = process.env.COMPOSE_OVERLAY ?? join(packetRoot, "compose-overlay.yml");
if (!workdir) throw new Error("RUNTIME_PACKET_WORKDIR is required");
const roles = ["r938_s1_capture", "r938_s1_handoff", "r938_s1_discovery", "r938_s1_readers"];
const timeoutSeconds = Number(process.env.DRAIN_TIMEOUT_SECONDS ?? "30");
if (!Number.isInteger(timeoutSeconds) || timeoutSeconds < 1 || timeoutSeconds > 300) throw new Error("invalid DRAIN_TIMEOUT_SECONDS");
const roleSql = roles.map(role => `'${role}'`).join(",");
const composePsql = ["compose", "--file", baseCompose, "--file", overlay, "--project-name", project, "exec", "-T", "postgres", "psql", "-U", "auto_tm_ci", "-d", "auto_tm_ci", "-X", "-v", "ON_ERROR_STOP=1", "-At"];
const sql = `SELECT count(*)::int FROM pg_stat_activity WHERE usename IN (${roleSql}) AND pid <> pg_backend_pid();`;
const count = () => Number(execFileSync("docker", [...composePsql, "-c", sql], { cwd: workdir, encoding: "utf8" }).trim() || "0");
const started = Date.now();
for (;;) {
  const remaining = count();
  process.stdout.write(JSON.stringify({ at: new Date().toISOString(), remaining }) + "\n");
  if (remaining === 0) break;
  if (Date.now() - started >= timeoutSeconds * 1000) throw new Error(`owned role backends did not drain: ${remaining}`);
  await new Promise(resolve => setTimeout(resolve, 1000));
}

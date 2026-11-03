import { execFileSync } from "node:child_process";

const adminUrl = process.env.BOOTSTRAP_ADMIN_URL;
if (!adminUrl) throw new Error("BOOTSTRAP_ADMIN_URL is required");
const roles = ["r938_s1_capture", "r938_s1_handoff", "r938_s1_discovery", "r938_s1_readers"];
const timeoutSeconds = Number(process.env.DRAIN_TIMEOUT_SECONDS ?? "30");
if (!Number.isInteger(timeoutSeconds) || timeoutSeconds < 1 || timeoutSeconds > 300) throw new Error("invalid DRAIN_TIMEOUT_SECONDS");
const roleSql = roles.map(role => `'${role}'`).join(",");
const sql = `SELECT count(*)::int FROM pg_stat_activity WHERE usename IN (${roleSql}) AND pid <> pg_backend_pid();`;
const count = () => Number(execFileSync("psql", [adminUrl, "-X", "-v", "ON_ERROR_STOP=1", "-At", "-c", sql], { encoding: "utf8" }).trim() || "0");
const started = Date.now();
for (;;) {
  const remaining = count();
  process.stdout.write(JSON.stringify({ at: new Date().toISOString(), remaining }) + "\n");
  if (remaining === 0) break;
  if (Date.now() - started >= timeoutSeconds * 1000) throw new Error(`owned role backends did not drain: ${remaining}`);
  await new Promise(resolve => setTimeout(resolve, 1000));
}

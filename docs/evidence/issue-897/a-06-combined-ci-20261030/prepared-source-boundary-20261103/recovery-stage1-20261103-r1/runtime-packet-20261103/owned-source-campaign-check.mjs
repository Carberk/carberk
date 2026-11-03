import { execFileSync } from "node:child_process";

const adminUrl = process.env.BOOTSTRAP_ADMIN_URL;
if (!adminUrl) throw new Error("BOOTSTRAP_ADMIN_URL is required");
const pattern = /^auto_tm_897_938_s1r1_t[a-f0-9]{6}_(?:template|w1)$/;
const psql = (database, args) => execFileSync("psql", [adminUrl.replace(/\/[^/]*$/, `/${database}`), "-X", "-v", "ON_ERROR_STOP=1", ...args], { encoding: "utf8" });
const names = execFileSync("psql", [adminUrl, "-X", "-v", "ON_ERROR_STOP=1", "-At", "-c", "SELECT datname FROM pg_database WHERE datname ~ '^auto_tm_897_938_s1r1_t[a-f0-9]{6}_(template|w1)$' ORDER BY datname;"], { encoding: "utf8" }).split(/\r?\n/).map(row => row.trim()).filter(Boolean);
const results = [];
for (const database of names) {
  if (!pattern.test(database)) throw new Error(`unexpected owned database name: ${database}`);
  const value = psql(database, ["-At", "-c", "SELECT (SELECT count(*) FROM public.diagnostic_source_commands)::int,(SELECT count(*) FROM public.campaign_preparations)::int;"]).trim();
  const [source, campaign] = value.split("|").map(Number);
  if (source !== 0 || campaign !== 0) throw new Error(JSON.stringify({ database, source, campaign }));
  results.push({ database, source, campaign });
}
process.stdout.write(JSON.stringify({ databases: results, checkedBeforeDatabaseCleanup: true }) + "\n");

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const packetRoot = dirname(fileURLToPath(import.meta.url));
const workdir = process.env.RUNTIME_PACKET_WORKDIR;
const project = process.env.COMPOSE_PROJECT ?? "auto_tm_ci_897_938_s1_20261103_r1";
const baseCompose = process.env.COMPOSE_BASE_FILE ?? join(workdir ?? process.cwd(), "infra/compose/docker-compose.ci.yml");
const overlay = process.env.COMPOSE_OVERLAY ?? join(packetRoot, "compose-overlay.yml");
const inputPinsPath = process.env.INPUT_PINS_PATH ?? join(packetRoot, "input-pins.json");
const capturePath = process.env.MIGRATION_CAPTURE_PATH;
const database = process.env.MIGRATION_DATABASE ?? "auto_tm_897_938_s1r1";
if (!workdir || !capturePath) throw new Error("RUNTIME_PACKET_WORKDIR and MIGRATION_CAPTURE_PATH are required");
const input = JSON.parse(readFileSync(inputPinsPath, "utf8"));
const expected = input.migrations;
const migrationNames = Object.keys(expected);
if (migrationNames.length !== 102 || new Set(migrationNames).size !== migrationNames.length) throw new Error(`expected 102 distinct migration pins, found ${migrationNames.length}`);
for (const name of migrationNames) {
  const migrationPath = join(workdir, "packages/db/prisma/migrations", name, "migration.sql");
  if (!existsSync(migrationPath)) throw new Error(`pinned migration folder is missing: ${name}`);
  const digest = createHash("sha256").update(readFileSync(migrationPath)).digest("hex");
  if (digest !== expected[name]) throw new Error(`disk migration hash mismatch for ${name}`);
}
const args = ["compose", "--file", baseCompose, "--file", overlay, "--project-name", project, "exec", "-T", "postgres", "psql", "-U", "auto_tm_ci", "-d", database, "-X", "-v", "ON_ERROR_STOP=1", "-At", "-F", "\t", "-c", "SELECT migration_name, checksum, (finished_at IS NOT NULL)::int FROM _prisma_migrations ORDER BY started_at;"];
const raw = execFileSync("docker", args, { cwd: workdir, encoding: "utf8" });
const rows = raw.split(/\r?\n/).filter(Boolean).map(line => {
  const [migrationName, checksum, finished] = line.split("\t");
  return { migrationName, checksum, finished: finished === "1" };
});
if (rows.length !== Object.keys(expected).length) throw new Error(`expected ${Object.keys(expected).length} applied migrations, found ${rows.length}`);
for (const row of rows) {
  if (!(row.migrationName in expected)) throw new Error(`unexpected migration ${row.migrationName}`);
  if (row.checksum !== expected[row.migrationName]) throw new Error(`checksum mismatch for ${row.migrationName}`);
  if (!row.finished) throw new Error(`migration is not finished: ${row.migrationName}`);
}
const result = { recordedAt: new Date().toISOString(), database, count: rows.length, allFinished: true, rows, inputPinsSha256: createHash("sha256").update(readFileSync(inputPinsPath)).digest("hex") };
writeFileSync(capturePath, JSON.stringify(result, null, 2) + "\n");
process.stdout.write(JSON.stringify(result) + "\n");

/** Exercise packaged DB commands in the final API image; Docker resources are disposable. */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";

const image = process.argv[2];
assert(image, "Usage: node scripts/api-image-runtime-smoke.mjs <built-api-image>");
function docker(args) {
  const result = spawnSync("docker", args, { encoding: "utf8", timeout: 120_000 });
  assert.ifError(result.error);
  assert.equal(result.status, 0, `${args[0]} failed: ${result.stdout}${result.stderr}`);
  return result.stdout.trim();
}
const patches = Object.fromEntries(await Promise.all([
  "expo-modules-core@55.0.26.patch", "react-native-reanimated@4.2.1.patch",
].map(async (name) => [name, createHash("sha256").update(await readFile(`patches/${name}`)).digest("hex")])));
const probe = `
  const assert = require('node:assert/strict');
  const fs = require('node:fs');
  const {createHash} = require('node:crypto');
  const {spawnSync} = require('node:child_process');
  assert.notEqual(process.getuid(), 0, 'use the configured non-root image user');
  const files = ['/app/pnpm-lock.yaml', '/app/node_modules/.modules.yaml',
    '/app/node_modules/.pnpm-workspace-state-v1.json', '/app/node_modules/.pnpm/lock.yaml'];
  const digest = path => createHash('sha256').update(fs.readFileSync(path)).digest('hex');
  const before = files.map(digest);
  const result = spawnSync('pnpm', ['--filter', '@auto-tm/db', 'exec', 'tsx', '--version'],
    {cwd:'/app', encoding:'utf8', timeout:30000});
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /tsx v4\\.23\\.15/);
  assert.doesNotMatch(result.stdout + result.stderr, /ERR_PNPM|installing dependencies|out of sync|Packages: \\+/,
    'packaged commands must not attempt dependency installation');
  assert.deepEqual(files.map(digest), before, 'runtime commands must not rewrite package metadata');
  for (const [name, expected] of Object.entries(${JSON.stringify(patches)}))
    assert.equal(digest('/app/patches/' + name), expected, 'retain exact tracked patch inputs');
  const resolved = spawnSync('pnpm', ['--filter', '@auto-tm/db', 'exec', 'node', '-e',
    'require.resolve("tsx/cli"); require.resolve("@prisma/client"); console.log("packaged DB tools resolved")'],
    {cwd:'/app', encoding:'utf8', timeout:30000});
  assert.ifError(resolved.error);
  assert.equal(resolved.status, 0, resolved.stdout + resolved.stderr);
  assert.match(resolved.stdout, /packaged DB tools resolved/);
  assert.doesNotMatch(resolved.stdout + resolved.stderr, /ERR_PNPM|out of sync|installing dependencies/);
  assert.deepEqual(files.map(digest), before);
  console.log('offline read-only non-root packaged tooling and patch inputs PASS');
`;
console.log(docker(["run", "--rm", "--network", "none", "--read-only", "--tmpfs", "/tmp",
  "--entrypoint", "node", image, "-e", probe]));

const suffix = randomUUID();
const network = `api-runtime-${suffix}`;
const postgres = `api-runtime-db-${suffix}`;
const databaseUrl = `postgresql://runtime:runtime@${postgres}:5432/runtime`;
try {
  docker(["network", "create", "--internal", network]);
  docker(["run", "--detach", "--name", postgres, "--network", network,
    "--env", "POSTGRES_USER=runtime", "--env", "POSTGRES_PASSWORD=runtime",
    "--env", "POSTGRES_DB=runtime", "postgres:16-alpine"]);
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    if (spawnSync("docker", ["exec", postgres, "pg_isready", "-U", "runtime", "-d", "runtime"],
      { stdio: "ignore" }).status === 0) { ready = true; break; }
    await delay(1000);
  }
  assert(ready, "disposable PostgreSQL must become ready");
  const migrate = ["run", "--rm", "--network", network, "--read-only", "--tmpfs", "/tmp",
    "--env", `DATABASE_URL=${databaseUrl}`, "--entrypoint", "pnpm", image,
    "--filter", "@auto-tm/db", "migrate:deploy"];
  for (let attempt = 0; attempt < 2; attempt++) {
    const output = docker(migrate);
    assert.doesNotMatch(output, /ERR_PNPM|out of sync|installing dependencies/);
  }
  const applied = Number(docker(["exec", postgres, "psql", "-U", "runtime", "-d", "runtime", "-tAc",
    'SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL']));
  const entries = await readdir("packages/db/prisma/migrations", { withFileTypes: true });
  const expected = entries.filter((entry) => entry.isDirectory()).length;
  assert(expected > 0);
  assert.equal(applied, expected, "the actual pre-deploy command must apply all packaged migrations");
  console.log(`isolated migrate:deploy twice and ${applied} applied migrations PASS`);
} finally {
  spawnSync("docker", ["rm", "--force", "--volumes", postgres], { stdio: "ignore" });
  spawnSync("docker", ["network", "rm", network], { stdio: "ignore" });
}

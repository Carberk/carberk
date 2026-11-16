import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const root = fileURLToPath(new URL("../", import.meta.url));
const turbo = join(root, "node_modules/turbo/bin/turbo");
const packages = ["packages/db", "apps/api", "apps/worker", "apps/web"];
const photoManifests = [
  "packages/db/scripts/demo-inventory/photos.manifest.json",
  "packages/db/scripts/reviewer-fixtures/photos.manifest.json",
];
const proofFlags = {
  AUTO_TM_TEST_DATABASES: "off",
  VIDEO_STORAGE_E2E: "1",
  VIDEO_PROCESSING_DATABASE_E2E: "1",
  VIDEO_PROCESSING_STORAGE_E2E: "1",
  GITHUB_ACTIONS: "true",
  CI: "true",
  RICH_VIDEO_TEST_API_REGION: "eu-west-1",
  RICH_VIDEO_TEST_WORKER_REGION: "eu-west-2",
  REPORT_ENTRY_ENABLED: "true",
  ADMIN_MODERATION_ACTIONS_ENABLED: "true",
  TESTCONTAINERS_RYUK_DISABLED: "true",
};
const credentials = [
  "DATABASE_URL", "REDIS_URL", "JWT_ACCESS_SECRET", "JWT_REFRESH_SECRET",
  "TOTP_SECRET_ENCRYPTION_KEY", "MINIO_ENDPOINT", "MINIO_PUBLIC_URL",
  "MINIO_ACCESS_KEY", "MINIO_SECRET_KEY", "MINIO_REGION",
];
const importedInputs = [
  "apps/api/src/common/ConfigListingVideoAccess.ts",
  "apps/api/src/modules/listings/application/ServeListingVideo.ts",
  "apps/api/src/modules/identity/infrastructure/PrismaSessionRepository.ts",
  "apps/worker/src/video/ListingVideoProcessor.ts",
  "apps/worker/src/video/VideoProcessingStorage.ts",
  "apps/worker/src/video/VideoProcessingScheduler.ts",
  "apps/worker/src/video/VideoProcessingTelemetry.ts",
  "apps/api/tsconfig.json",
  "apps/worker/tsconfig.json",
  "packages/tsconfig/node.json",
  "infra/minio/bootstrap.mjs",
];

async function fixture(t) {
  const directory = await mkdtemp("/tmp/carberk-turbo-proof-");
  t.after(() => rm(directory, { recursive: true, force: true }));
  async function put(path, contents) {
    await mkdir(dirname(join(directory, path)), { recursive: true });
    await writeFile(join(directory, path), contents);
  }
  const { packageManager } = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  await put("package.json", JSON.stringify({ name: "turbo-proof", private: true, packageManager }));
  await put("pnpm-workspace.yaml", "packages:\n  - packages/*\n  - apps/*\n");
  await put("pnpm-lock.yaml", "lockfileVersion: '9.0'\nimporters:\n  .: {}\n");
  await put("turbo.json", await readFile(join(root, "turbo.json")));
  await put(".gitignore", "node_modules/\n.turbo/\nproof.json\n.env*\n");
  for (const path of packages) {
    await put(`${path}/package.json`, JSON.stringify({
      name: `@auto-tm/${path.split("/")[1]}`, private: true,
      scripts: { build: "node -e \"\"", test: "node ../../probe.cjs", "test:unit": "node ../../probe.cjs" },
    }));
  }
  await put("probe.cjs", "require('node:fs').writeFileSync('proof.json', '{}');\n");
  for (const path of [...importedInputs, ...photoManifests]) await put(path, "{}\n");
  const env = { PATH: process.env.PATH, HOME: process.env.HOME, TURBO_TELEMETRY_DISABLED: "1" };
  execFileSync("git", ["init", "--quiet"], { cwd: directory, env });
  execFileSync("git", ["add", "."], { cwd: directory, env });
  function run(args, extraEnv = {}) {
    const result = spawnSync(process.execPath, [turbo, "run", ...args, "--no-daemon"], {
      cwd: directory, env: { ...env, ...extraEnv }, encoding: "utf8", timeout: 30_000,
    });
    assert.ifError(result.error);
    return result;
  }
  function dry(extraEnv = {}, task = "test") {
    const result = run([task, "--dry=json"], extraEnv);
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout);
  }
  return { directory, put, run, dry };
}

function hash(receipt, task = "@auto-tm/db#test") {
  const entry = receipt.tasks.find((entry) => entry.taskId === task);
  assert.ok(entry, `Missing ${task}`);
  return entry.hash;
}

test("DB rich-video proof invalidates when imported implementations or configuration change", async (t) => {
  const f = await fixture(t);
  const before = hash(f.dry());
  for (const path of importedInputs) {
    await f.put(path, "{\"changed\":true}\n");
    assert.notEqual(hash(f.dry()), before, path);
    await f.put(path, "{}\n");
  }
  for (const path of ["apps/api/package.json", "apps/worker/package.json"]) {
    const original = await readFile(join(f.directory, path), "utf8");
    await f.put(path, JSON.stringify({ ...JSON.parse(original), version: "0.2.0" }));
    assert.notEqual(hash(f.dry()), before, path);
    await f.put(path, original);
  }
});

test("Web test and unit proof invalidate for either external photo manifest", async (t) => {
  const f = await fixture(t);
  for (const task of ["test", "test:unit"]) {
    const before = hash(f.dry({}, task), `@auto-tm/web#${task}`);
    for (const path of photoManifests) {
      await f.put(path, "{\"changed\":true}\n");
      assert.notEqual(hash(f.dry({}, task), `@auto-tm/web#${task}`), before, path);
      await f.put(path, "{}\n");
    }
  }
});

test("supported proof flags reach strict-mode children and invalidate test hashes", async (t) => {
  const f = await fixture(t);
  await f.put("probe.cjs", `
    const flags = ${JSON.stringify(Object.keys(proofFlags))};
    require('node:fs').writeFileSync('proof.json', JSON.stringify(
      Object.fromEntries(flags.map(name => [name, process.env[name] ?? null]))
    ));
  `);
  for (const task of ["test", "test:unit"]) {
    const before = f.dry({}, task);
    for (const [name, value] of Object.entries(proofFlags)) {
      const after = f.dry({ [name]: value }, task);
      for (const entry of after.tasks.filter((entry) => entry.task === task)) {
        assert.notEqual(entry.hash, hash(before, entry.taskId), `${entry.taskId}: ${name}`);
      }
    }
    const result = f.run([task, "--cache=local:rw"], proofFlags);
    assert.equal(result.status, 0, result.stderr);
    for (const path of packages) {
      assert.deepEqual(JSON.parse(await readFile(join(f.directory, path, "proof.json"), "utf8")), proofFlags);
    }
  }
});

test("credentials pass through without entering hashes or dry-run receipts", async (t) => {
  const f = await fixture(t);
  await f.put("probe.cjs", `
    const names = ${JSON.stringify(credentials)};
    require('node:fs').writeFileSync('proof.json', JSON.stringify(
      names.every(name => process.env[name] === 'fixture-credential-a')
    ));
  `);
  const first = Object.fromEntries(credentials.map((name) => [name, "fixture-credential-a"]));
  const second = Object.fromEntries(credentials.map((name) => [name, "fixture-credential-b"]));
  const before = f.dry(first);
  const after = f.dry(second);
  for (const entry of after.tasks) assert.equal(entry.hash, hash(before, entry.taskId), entry.taskId);
  for (const receipt of [before, after]) {
    assert.ok(!JSON.stringify(receipt).includes("fixture-credential-"));
  }
  const result = f.run(["test", "--cache=local:,remote:"], first);
  assert.equal(result.status, 0, result.stderr);
  assert.ok(!`${result.stdout}${result.stderr}`.includes("fixture-credential-"));
  for (const path of packages) {
    assert.equal(await readFile(join(f.directory, path, "proof.json"), "utf8"), "true");
  }
});

test("unrelated docs and ignored credential files preserve proof hashes", async (t) => {
  const f = await fixture(t);
  const before = f.dry();
  await f.put("docs/unrelated.md", "changed\n");
  await f.put("apps/api/CONTEXT.md", "changed\n");
  await f.put(".env.production.local", "DATABASE_URL=fixture-credential-a\n");
  await f.put("packages/db/.env.test.local", "MINIO_SECRET_KEY=fixture-credential-b\n");
  const after = f.dry();
  for (const task of ["@auto-tm/db#test", "@auto-tm/web#test"]) {
    assert.equal(hash(after, task), hash(before, task), task);
  }
});

test("explicitly uncached service proof fails even when a stale success is cached", async (t) => {
  const f = await fixture(t);
  await f.put(".gitignore", "node_modules/\n.turbo/\nproof.json\n.env*\nservice-ready\n");
  await f.put("probe.cjs", `
    if (!require('node:fs').existsSync('../../service-ready')) {
      console.error('service unavailable');
      process.exit(1);
    }
    console.log('service proof passed');
  `);
  await f.put("service-ready", "ready\n");
  const args = ["test", "--filter=@auto-tm/api"];
  const before = hash(f.dry(), "@auto-tm/api#test");
  const fresh = f.run([...args, "--cache=local:rw"]);
  assert.equal(fresh.status, 0, fresh.stderr);
  assert.match(fresh.stdout, /service proof passed/);
  await rm(join(f.directory, "service-ready"));
  assert.equal(hash(f.dry(), "@auto-tm/api#test"), before);
  const stale = f.run([...args, "--cache=local:rw"]);
  assert.equal(stale.status, 0, stale.stderr);
  assert.match(stale.stdout, /cache hit/);
  const uncached = f.run([...args, "--cache=local:,remote:"]);
  assert.notEqual(uncached.status, 0);
  assert.match(`${uncached.stdout}${uncached.stderr}`, /service unavailable/);
});

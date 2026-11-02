import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { test } from "node:test";

const producer = resolve("apps/worker/src/jobs/diagnostics/testing/produceOwnershipBatchFixture.mjs");
const privateRoot = "/tmp/897-r6c-a02r2-20261030/producer-repair";
// Exercise the real executable's admission boundary. No services, DB client,
// protected fixture rows or bootstrap receipt are created by these tests.
test("unknown selectors and unsafe task URLs refuse before runtime composition or output", async () => {
  await mkdir(privateRoot, { recursive: true, mode: 0o700 });
  const root = await mkdtemp(join(privateRoot, "boundary-"));
  const configPath = join(root, "input.private.json");
  const output = join(root, "output");
  await mkdir(output, { mode: 0o700 });
  const run = async (config, databaseUrl = "invalid") => {
    await writeFile(configPath, JSON.stringify(config), { mode: 0o600 });
    return spawnSync(process.execPath, [producer, configPath], { encoding: "utf8", timeout: 5000,
      env: { PATH: process.env.PATH, DATABASE_URL: databaseUrl,
        REDIS_URL: "redis://127.0.0.1:61148/0", MINIO_ENDPOINT: "http://127.0.0.1:61150" } });
  };
  const refused = async (result, message) => {
    assert.equal(result.error, undefined);
    assert.equal(result.signal, null);
    assert.equal(result.status, 1);
    assert.equal(result.stdout, "");
    assert.ok(result.stderr.includes(message), result.stderr);
    assert.deepEqual(await readdir(output), []);
  };
  try {
    for (const name of ["later-failure", "shared-multiple", "oldest-capacity", "overlimit", "worker-first-second-worker", "second-worker-first-worker",
      "worker-first-capture", "capture-first-worker", "worker-first-proof-use", "proof-use-first-worker"]) {
      await refused(await run({ case: name, evidenceDir: output }), "Explicit valid task URL required");
    }
    await refused(await run({ case: "substituted-case", evidenceDir: output }), "Unknown ownership batch selector");
    const name = "shared-multiple", database = "r6c_batch_a02r2_shared_multiple";
    const config = {
      case: name, dependency: "023e6a5dcefbcd5d7e7c71bf4bba18f01a3d01ab", evidenceDir: output,
      workerUrl: `postgresql://worker@127.0.0.1:61149/${database}`,
      ownerUrl: `postgresql://owner@127.0.0.1:61149/${database}`,
      visits: Array.from({ length: 102 }, () => ({})),
      resourceIdentity: { composeProject: "auto_tm_ci_897_r6c_a02r2_20261030", ports: { postgres: 61149, redis: 61148, minio: 61150 },
        bootstrapReceipt: join(root, "bootstrap.json"), apiUrls: ["http://127.0.0.1:62001", "http://127.0.0.1:62002", "http://127.0.0.1:62003", "http://127.0.0.1:62004", "http://127.0.0.1:62005"] },
    };
    const databaseUrl = `postgresql://reader@127.0.0.1:61149/${database}`;
    for (const who of ["readback", "worker", "owner"]) {
      const input = structuredClone(config);
      const override = `${who === "readback" ? databaseUrl : input[`${who}Url`]}?host=127.0.0.1&port=65379`;
      if (who !== "readback") input[`${who}Url`] = override;
      await refused(await run(input, who === "readback" ? override : databaseUrl), "Exact private task resource and five-cohort identity required");
    }
    const foreignApi = structuredClone(config);
    foreignApi.resourceIdentity.apiUrls[0] = "http://127.0.0.1:65379";
    await refused(await run(foreignApi, databaseUrl), "Exact private task resource and five-cohort identity required");
    const wrongProject = structuredClone(config);
    wrongProject.resourceIdentity.composeProject = "auto_tm_ci_897_r6c_foreign";
    await refused(await run(wrongProject, databaseUrl), "Exact private task resource and five-cohort identity required");
  } finally { await rm(root, { recursive: true }); }
});

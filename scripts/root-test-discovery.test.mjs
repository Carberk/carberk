import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const { scripts } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
test("required root runner discovers existing scripts and MinIO contracts once", () => {
  assert.equal(scripts["test:root"].match(/scripts\/\*\.test\.mjs/g)?.length, 1);
  assert.equal(scripts["test:root"].match(/infra\/minio\/\*\.test\.mjs/g)?.length, 1);
});
test("whole-suite entry includes the MinIO contracts once", () => {
  assert.equal(scripts.test.match(/infra\/minio\/\*\.test\.mjs/g)?.length, 1);
});

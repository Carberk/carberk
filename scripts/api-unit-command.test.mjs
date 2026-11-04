import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));

test("the focused API unit command builds dependencies before the unit lane", () => {
  const command = root.scripts?.["test:api:unit"];

  assert.equal(
    command,
    "DATABASE_URL=postgresql://auto_tm_ci:auto_tm_ci_pass@127.0.0.1:1/auto_tm_ci pnpm --filter @auto-tm/api... build && pnpm --filter @auto-tm/api test:unit",
  );
  assert.match(command, /@auto-tm\/api\.\.\. build/);
  assert.match(command, /@auto-tm\/api test:unit/);
  assert.doesNotMatch(command, /pnpm .* test --/);
});

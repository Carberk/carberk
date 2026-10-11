import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

for (const [command, args, refusal] of [
  ["native:metro", ["--env", "production", "--port", "8841"], /does not point a development client at production/],
  ["native:metro", ["--env", "staging"], /--port is required/],
  ["native:ios", ["--port", "8841"], /--udid is required/],
  ["native:ios", ["--udid", "TEST-DEVICE"], /--port is required/],
]) {
  test(`${command} refuses unsafe session selection: ${args.join(" ")}`, () => {
    const result = spawnSync("pnpm", ["--filter", "@auto-tm/mobile", command, "--", ...args], {
      encoding: "utf8",
      env: { ...process.env, CI: "1" },
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stdout + result.stderr, refusal);
  });
}

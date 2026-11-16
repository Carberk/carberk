import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

for (const app of ["admin", "api", "web", "worker"]) {
  test(`${app} rejects empty full suites and focused CI tests while discovering ordinary tests`, t => {
    const appRoot = join(root, "apps", app);
    const directory = mkdtempSync("/tmp/carberk-test-discovery-");
    t.after(() => rmSync(directory, { recursive: true, force: true }));
    symlinkSync(join(appRoot, "node_modules"), join(directory, "node_modules"), "dir");
    const config = join(directory, "vitest.config.mts");
    writeFileSync(config, `import config from ${JSON.stringify(join(appRoot, "vitest.config.mts"))};\nexport default { ...config, test: { ...config.test, globalSetup: [], setupFiles: [] } };\n`);
    const run = script => {
      const result = spawnSync("pnpm", ["run", script, "--root", directory, "--config", config], {
        cwd: appRoot,
        env: { ...process.env, CI: "true", NO_COLOR: "1", FORCE_COLOR: "0" },
        encoding: "utf8",
        timeout: 30_000,
      });
      assert.ifError(result.error);
      return { status: result.status, output: result.stdout + result.stderr };
    };
    const empty = run("test");
    assert.equal(empty.status, 1, empty.output);
    assert.match(empty.output, /No test files found/);
    const unit = run("test:unit");
    assert.equal(unit.status, app === "api" || app === "worker" ? 0 : 1, unit.output);
    assert.match(unit.output, /No test files found/);
    writeFileSync(join(directory, "discovery.spec.ts"), 'import { expect, test } from "vitest";\ntest("ordinary test runs", () => expect(2 + 2).toBe(4));\n');
    const normal = run("test");
    assert.equal(normal.status, 0, normal.output);
    assert.match(normal.output, /1 passed/);
    if (app === "api" || app === "worker") {
      writeFileSync(join(directory, "service.e2e.spec.ts"), 'throw new Error("filtered service test must not execute");\n');
    }
    const normalUnit = run("test:unit");
    assert.equal(normalUnit.status, 0, normalUnit.output);
    assert.match(normalUnit.output, /1 passed/);
    rmSync(join(directory, "service.e2e.spec.ts"), { force: true });
    writeFileSync(join(directory, "discovery.spec.ts"), 'import { test } from "vitest";\ntest.only("focused test is forbidden", () => {});\n');
    const focused = run("test");
    assert.equal(focused.status, 1, focused.output);
    assert.match(focused.output, /Unexpected \.only modifier/);
  });
}

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const workflows = ["pr-checks.yml", "ci.yml"].map(name =>
  readFileSync(join(root, ".github/workflows", name), "utf8"));
const aggregate = workflows[0].split("\n  pr:\n")[1].split("        run: |\n")[1]
  .split("\n").map(line => line.replace(/^ {10}/, "")).join("\n");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

function fixture(t) {
  const cwd = mkdtempSync(join(tmpdir(), "root-test-command-"));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const write = (path, content) => {
    mkdirSync(dirname(join(cwd, path)), { recursive: true });
    writeFileSync(join(cwd, path), content);
  };
  write("package.json", JSON.stringify(pkg));
  for (const path of ["pnpm-lock.yaml", "pnpm-workspace.yaml", "turbo.json"]) {
    cpSync(join(root, path), join(cwd, path));
  }
  symlinkSync(join(root, "node_modules"), join(cwd, "node_modules"), "dir");
  mkdirSync(join(cwd, "packages/contracts"), { recursive: true });
  for (const path of ["package.json", "tsconfig.json", "tsconfig.build.json", "src", "scripts"]) {
    cpSync(join(root, "packages/contracts", path), join(cwd, "packages/contracts", path), { recursive: true });
  }
  symlinkSync(join(root, "packages/contracts/node_modules"), join(cwd, "packages/contracts/node_modules"), "dir");
  for (const path of ["scripts/check-agent-docs.mjs", "scripts/staging-reviewer-flow-smoke.mjs", "scripts/staging-reviewer-flow-smoke.test.mjs", "infra/minio/contract.mjs", "infra/minio/contract.test.mjs"]) {
    mkdirSync(dirname(join(cwd, path)), { recursive: true });
    cpSync(join(root, path), join(cwd, path));
  }
  write("AGENTS.md", "");
  write("CLAUDE.md", "@AGENTS.md\n[Policy](AGENTS.md)\n");
  write("CONTEXT-MAP.md", "");
  mkdirSync(join(cwd, ".claude/skills"), { recursive: true });
  mkdirSync(join(cwd, ".agents"));
  symlinkSync("../.claude/skills", join(cwd, ".agents/skills"));
  write(".gitignore", "node_modules/\ndist/\n.turbo/\n");
  for (const args of [["init", "-q"], ["add", "."],
    ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.com", "commit", "-qm", "fixture"],
    ["update-ref", "refs/remotes/origin/main", "HEAD"]]) {
    const git = spawnSync("git", args, { cwd, encoding: "utf8" });
    assert.equal(git.status, 0, git.stderr);
  }
  const env = { ...process.env, GITHUB_ACTIONS: "false", TURBO_TELEMETRY_DISABLED: "1", SMOKE_CREDENTIALS_FILE: join(cwd, "absent-credentials.json") };
  delete env.NODE_TEST_CONTEXT;
  const run = (command) => spawnSync("pnpm", [command], {
    cwd, encoding: "utf8", timeout: 60000,
    env,
  });
  return { cwd, write, run };
}

test("standalone smoke tests build contracts in a clean installed workspace", t => {
  const { cwd, run } = fixture(t);
  assert.equal(existsSync(join(cwd, "packages/contracts/dist/index.js")), false);
  const result = run("test:reviewer-flow-smoke");
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(existsSync(join(cwd, "packages/contracts/dist/index.js")), true);
  assert.match(result.stdout, /the smoke draft is publishable/);
});

test("the standalone live smoke builds contracts before validating credentials", t => {
  const { cwd, run } = fixture(t);
  const result = run("smoke:reviewer-flow");
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.equal(existsSync(join(cwd, "packages/contracts/dist/index.js")), true);
  assert.match(result.stderr, /smoke aborted: ENOENT.*absent-credentials/);
});

test("full local and CI root commands discover new script and MinIO failures", t => {
  const { cwd, write, run } = fixture(t);
  const clean = run("test:root");
  assert.equal(clean.status, 0, clean.stdout + clean.stderr);
  assert.equal(existsSync(join(cwd, "packages/contracts/dist/index.js")), true);
  assert.match(clean.stdout, /bucket bootstrap is idempotent/);
  for (const path of ["scripts/new-suite.test.mjs", "infra/minio/new-suite.test.mjs"]) {
    write(path, 'import test from "node:test";\ntest("Q01 discovered failure", () => { throw new Error("Q01 sentinel"); });\n');
    const ciCommands = workflows.map(source => /run: pnpm (test:root)\n/.exec(source)?.[1]);
    assert.deepEqual(ciCommands, ["test:root", "test:root"]);
    for (const command of new Set([...ciCommands, "test"])) {
      const result = run(command);
      assert.equal(result.status, 1, result.stdout + result.stderr);
      assert.match(result.stdout + result.stderr, /Q01 sentinel/);
      const gate = spawnSync("bash", ["-c", aggregate], {
        encoding: "utf8",
        env: { ...process.env, LANE: "full", LANE_RESULT: "success", DOCS_RESULT: "skipped",
          STATIC_RESULT: "success", API_RESULT: "success", DB_RESULT: "success",
          FRONTEND_RESULT: result.status === 0 ? "success" : "failure" },
      });
      assert.equal(gate.status, 1, gate.stdout + gate.stderr);
    }
    rmSync(join(cwd, path));
  }
});

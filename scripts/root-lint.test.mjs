import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

function fixture(t) {
  const cwd = mkdtempSync(join(tmpdir(), "carberk-root-lint-"));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const write = (path, source) => {
    mkdirSync(dirname(join(cwd, path)), { recursive: true });
    writeFileSync(join(cwd, path), source);
  };
  write("package.json", JSON.stringify({ private: true, scripts: pkg.scripts }));
  symlinkSync(join(root, "node_modules"), join(cwd, "node_modules"), "dir");
  cpSync(join(root, "eslint.config.mjs"), join(cwd, "eslint.config.mjs"));
  write("scripts/valid.mjs", 'export const environment = process.env;\n');
  write("infra/valid.cjs", 'module.exports = Buffer.from(__filename);\n');
  const run = () => spawnSync("pnpm", ["lint:root"], { cwd, encoding: "utf8", timeout: 30000 });
  return { cwd, write, run };
}

test("root lint rejects undefined names and invalid host syntax in every authored root", t => {
  const { cwd, write, run } = fixture(t);
  assert.equal(run().status, 0);
  for (const path of ["tool.config.mjs", "scripts/nested/new-script.js", "infra/new-service/probe.cjs"]) {
    for (const [source, diagnostic] of [
      ["q06MissingName();\n", /q06MissingName.*not defined/],
      ["const broken = ;\n", /Parsing error/],
    ]) {
      write(path, source);
      const result = run();
      assert.equal(result.status, 1, result.stdout + result.stderr);
      assert.match(result.stdout + result.stderr, diagnostic);
    }
    rmSync(join(cwd, path));
  }
});

test("Node hosts accept embedded broken programs as data without granting browser or CommonJS globals to ESM", t => {
  const { cwd, write, run } = fixture(t);
  write("scripts/program-fixture.mjs", 'export const program = "const broken = ; missingName();";\nexport const bytes = Buffer.from(program);\nconsole.log(process.version, globalThis, setTimeout);\n');
  write("infra/node-host.js", 'module.exports = [require("node:fs"), __dirname, process.env];\n');
  const valid = run();
  assert.equal(valid.status, 0, valid.stdout + valid.stderr);
  for (const name of ["window", "document", "require", "module", "__dirname"]) {
    write("scripts/invalid-global.mjs", `${name};\n`);
    const invalid = run();
    assert.equal(invalid.status, 1, invalid.stdout + invalid.stderr);
    assert.match(invalid.stdout + invalid.stderr, new RegExp(`${name}.*not defined`));
  }
  rmSync(join(cwd, "scripts/invalid-global.mjs"));
});

test("dependency directories are excluded without hiding similarly named authored directories", t => {
  const { cwd, write, run } = fixture(t);
  for (const path of ["scripts/node_modules/vendor/broken.js", "infra/node_modules/vendor/broken.cjs", ".pnpm-store/broken.mjs"]) {
    write(path, "const broken = ;\n");
  }
  const dependencies = run();
  assert.equal(dependencies.status, 0, dependencies.stdout + dependencies.stderr);
  for (const path of ["scripts/node_modules-tools/probe.mjs", "infra/generated-probe/probe.mjs", "scripts/dist/probe.mjs"]) {
    write(path, "q06MissingName();\n");
    const authored = run();
    assert.equal(authored.status, 1, authored.stdout + authored.stderr);
    assert.match(authored.stdout + authored.stderr, /q06MissingName.*not defined/);
    rmSync(join(cwd, path));
  }
});

test("local lint and both static CI jobs propagate root lint failures to the required aggregate", t => {
  const { write, run } = fixture(t);
  assert.match(pkg.scripts.lint, /(?:^| && )pnpm lint:root && turbo run lint$/);
  for (const name of ["pr-checks.yml", "ci.yml"]) {
    const workflow = readFileSync(join(root, ".github/workflows", name), "utf8");
    const job = workflow.split("\n  static:\n")[1].split(/^  [a-z]+:\n/m)[0];
    assert.match(job, /run: pnpm lint\n/);
    assert.doesNotMatch(job, /continue-on-error:/);
  }
  write("infra/new-service/rejected.mjs", "q06MissingName();\n");
  const lint = run();
  assert.equal(lint.status, 1, lint.stdout + lint.stderr);
  assert.match(lint.stdout + lint.stderr, /q06MissingName.*not defined/);
  const workflow = readFileSync(join(root, ".github/workflows/pr-checks.yml"), "utf8");
  const aggregate = workflow.split("\n  pr:\n")[1].split("        run: |\n")[1]
    .split("\n").map(line => line.replace(/^ {10}/, "")).join("\n");
  const gate = spawnSync("bash", ["-c", aggregate], {
    encoding: "utf8",
    env: { ...process.env, LANE: "full", LANE_RESULT: "success", DOCS_RESULT: "skipped",
      STATIC_RESULT: lint.status === 0 ? "success" : "failure", API_RESULT: "success",
      DB_RESULT: "success", FRONTEND_RESULT: "success" },
  });
  assert.equal(gate.status, 1, gate.stdout + gate.stderr);
});

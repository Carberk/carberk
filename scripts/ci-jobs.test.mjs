import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

// PR Checks and CI split the workspace tests between an api job (api and
// worker, with Compose services), a db job (Testcontainers only) and a frontend
// job (no services). These checks keep every workspace's tests in exactly one
// of them, give each job only the services it needs, and keep the required
// `pr` check meaningful.

const root = fileURLToPath(new URL("..", import.meta.url));
const readJson = (path) => JSON.parse(readFileSync(join(root, path), "utf8"));
const workflow = (name) => readFileSync(join(root, ".github", "workflows", name), "utf8");
const rootScripts = readJson("package.json").scripts;

function workspacesWithTests() {
  const names = [];
  for (const dir of ["apps", "packages"]) {
    for (const entry of readdirSync(join(root, dir), { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      let pkg;
      try {
        pkg = readJson(join(dir, entry.name, "package.json"));
      } catch {
        continue;
      }
      if (pkg.scripts?.test) names.push(pkg.name);
    }
  }
  return names.sort();
}

const filters = (script) => [...script.matchAll(/--filter=(\S+)/g)].map((match) => match[1]);

/** Top-level job ids and each job's text, from a workflow without a YAML parser. */
function jobs(source) {
  const body = source.slice(source.indexOf("\njobs:\n") + "\njobs:\n".length);
  const result = new Map();
  let current;
  for (const line of body.split("\n")) {
    const id = /^ {2}([a-z][\w-]*):\s*$/.exec(line)?.[1];
    if (id) {
      current = id;
      result.set(id, "");
    } else if (current) {
      result.set(current, `${result.get(current)}${line}\n`);
    }
  }
  return result;
}

const testScripts = ["test:api", "test:db", "test:frontend"];

test("every workspace with tests runs in exactly one CI test job", () => {
  const all = testScripts.flatMap((script) => filters(rootScripts[script]));
  assert.deepEqual(all.filter((name, index) => all.indexOf(name) !== index), [], "a workspace is in two CI test scripts");
  assert.deepEqual(all.sort(), workspacesWithTests());
});

test("api and worker share the api job, apart from the db suite", () => {
  assert.deepEqual(filters(rootScripts["test:api"]).sort(), ["@auto-tm/api", "@auto-tm/worker"]);
  assert.deepEqual(filters(rootScripts["test:db"]), ["@auto-tm/db"]);
  assert.equal(rootScripts["test:backend"], undefined, "test:backend would run api and db on one runner again");
});

test("the CI test scripts run every root node --test file", () => {
  assert.match(rootScripts["test:root"], /node --test 'scripts\/\*\.test\.mjs'/);
});

for (const name of ["pr-checks.yml", "ci.yml"]) {
  test(`${name} runs the api, db, frontend and root tests, lint, typecheck and the admin runtime check`, () => {
    const source = workflow(name);
    for (const command of [
      "pnpm test:api",
      "pnpm test:db",
      "pnpm test:frontend",
      "pnpm test:root",
      "pnpm lint",
      "pnpm typecheck",
      "pnpm --filter @auto-tm/admin verify:runtime",
    ]) {
      assert.ok(source.includes(`run: ${command}`), `${name} is missing ${command}`);
    }
  });
}

test("the required pr job needs every other PR Checks job and runs even when one failed", () => {
  const graph = jobs(workflow("pr-checks.yml"));
  const pr = graph.get("pr");
  assert.ok(pr, "PR Checks has no pr job");
  const needs = /needs: \[([^\]]*)\]/.exec(pr)?.[1].split(",").map((id) => id.trim()) ?? [];
  assert.deepEqual(needs.sort(), [...graph.keys()].filter((id) => id !== "pr").sort());
  assert.match(pr, /\n {4}if: always\(\) && /);
  for (const id of needs) {
    assert.ok(pr.includes(`needs.${id}.result`), `pr does not check the ${id} job's result`);
  }
});

test("draft checks cannot establish a green pr head for the docs shortcut", () => {
  const source = workflow("pr-checks.yml");
  assert.match(
    source,
    /pull_request:\n    types: \[opened, reopened, synchronize, ready_for_review, converted_to_draft, labeled\]/,
    "PR Checks must rerun when a draft becomes ready",
  );
  const graph = jobs(source);
  for (const id of ["docs", "static", "api", "db", "frontend", "pr"]) {
    assert.match(
      graph.get(id),
      /^ {4}if: (?:always\(\) && )?\(github\.event\.pull_request\.draft != true \|\| contains\(github\.event\.pull_request\.labels\.\*\.name, 'run-full-ci'\)\)(?: && |\n)/m,
      `${id} must skip draft pull requests`,
    );
  }
});

function runBlock(job) {
  return job.split("        run: |\n")[1].split("\n").map(line => line.replace(/^ {10}/, "")).join("\n");
}

test("the explicit draft override forces the full lane, including docs-only changes", t => {
  const cwd = mkdtempSync(join(tmpdir(), "ci-draft-override-"));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const output = join(cwd, "github-output");
  const script = runBlock(jobs(workflow("pr-checks.yml")).get("lane"));
  const result = spawnSync("bash", ["-c", script], {
    cwd, env: { ...process.env, FORCE_FULL_CI: "true", GITHUB_OUTPUT: output }, encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(readFileSync(output, "utf8"), "lane=full\n");
});

test("the required check rejects failed, cancelled and unexpectedly skipped jobs", () => {
  const script = runBlock(jobs(workflow("pr-checks.yml")).get("pr"));
  const env = {
    LANE: "full", LANE_RESULT: "success", DOCS_RESULT: "skipped",
    STATIC_RESULT: "success", API_RESULT: "success", DB_RESULT: "success", FRONTEND_RESULT: "success",
  };
  const status = overrides => spawnSync("bash", ["-c", script], { env: { ...process.env, ...env, ...overrides } }).status;
  assert.equal(status({}), 0);
  assert.equal(status({ LANE: "docs", DOCS_RESULT: "success", STATIC_RESULT: "skipped", API_RESULT: "skipped", DB_RESULT: "skipped", FRONTEND_RESULT: "skipped" }), 0);
  for (const id of ["LANE_RESULT", "STATIC_RESULT", "API_RESULT", "DB_RESULT", "FRONTEND_RESULT"]) {
    for (const value of ["failure", "cancelled", "skipped", ""]) {
      assert.equal(status({ [id]: value }), 1, `${id}=${value} must fail the full lane`);
    }
  }
});

test("the full PR static job builds the worker and its production prerequisites", () => {
  const job = jobs(workflow("pr-checks.yml")).get("static");
  const command = /run: (pnpm exec turbo run build --filter=@auto-tm\/worker --concurrency=1)\n/.exec(job)?.[1];
  assert.ok(command, "static must run the worker production build through Turbo");
  assert.doesNotMatch(job, /continue-on-error:/);
  const graph = spawnSync("pnpm", [...command.split(" ").slice(1), "--dry=json"], {
    cwd: root, encoding: "utf8", timeout: 30000,
  });
  assert.equal(graph.status, 0, graph.stderr);
  const tasks = JSON.parse(graph.stdout).tasks;
  const worker = tasks.find(task => task.taskId === "@auto-tm/worker#build");
  assert.equal(worker.command, "nest build");
  for (const id of ["@auto-tm/contracts#build", "@auto-tm/db#build"]) {
    assert.ok(worker.dependencies.includes(id), `worker build must depend on ${id}`);
    assert.equal(tasks.find(task => task.taskId === id)?.command, "node scripts/build.cjs");
  }
});

test("production rootDir errors missed by typecheck fail the required PR gate", t => {
  const cwd = mkdtempSync(join(tmpdir(), "ci-worker-build-"));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  symlinkSync(join(root, "apps/worker/node_modules"), join(cwd, "node_modules"), "dir");
  const writeJson = (name, value) => writeFileSync(join(cwd, name), JSON.stringify(value));
  for (const dir of ["src", "scripts"]) {
    mkdirSync(join(cwd, dir));
    writeFileSync(join(cwd, dir, "fixture.ts"), "export const fixture = 1;\n");
  }
  // Reuse current worker compiler settings, removing ambient Node types from
  // this dependency-free fixture. Only the historical scripts exclusion differs.
  writeJson("tsconfig.json", {
    extends: join(root, "apps/worker/tsconfig.json"),
    compilerOptions: { types: [], outDir: "./dist" },
  });
  writeJson("nest-cli.json", readJson("apps/worker/nest-cli.json"));
  const fixed = readJson("apps/worker/tsconfig.build.json");
  writeJson("tsconfig.fixed.json", fixed);
  writeJson("tsconfig.broken.json", { ...fixed, exclude: fixed.exclude.filter(path => path !== "scripts") });
  const run = (binary, args) => spawnSync(process.execPath, [join(root, "apps/worker/node_modules", binary), ...args], {
    cwd, encoding: "utf8", timeout: 30000,
  });
  const typecheck = run("@typescript/native/bin/tsc", ["--noEmit", "-p", "tsconfig.json"]);
  assert.equal(typecheck.status, 0, typecheck.stdout + typecheck.stderr);
  t.diagnostic(`ordinary worker typecheck: exit ${typecheck.status}`);
  const gate = runBlock(jobs(workflow("pr-checks.yml")).get("pr"));
  for (const [config, expectedBuild, expectedGate] of [["broken", 1, 1], ["fixed", 0, 0]]) {
    const build = run("@nestjs/cli/bin/nest.js", ["build", "--path", `tsconfig.${config}.json`]);
    assert.equal(build.status, expectedBuild, build.stdout + build.stderr);
    if (config === "broken") assert.match(build.stdout + build.stderr, /TS6059/);
    else assert.ok(readFileSync(join(cwd, "dist/fixture.js"), "utf8").includes("exports.fixture"));
    const aggregate = spawnSync("bash", ["-c", gate], {
      env: { ...process.env, LANE: "full", LANE_RESULT: "success", DOCS_RESULT: "skipped",
        STATIC_RESULT: build.status === 0 ? "success" : "failure",
        API_RESULT: "success", DB_RESULT: "success", FRONTEND_RESULT: "success" },
      encoding: "utf8",
    });
    assert.equal(aggregate.status, expectedGate, aggregate.stdout + aggregate.stderr);
    t.diagnostic(`${config} production config: Nest exit ${build.status}${config === "broken" ? " (TS6059)" : " (CommonJS emitted)"}; required pr aggregate exit ${aggregate.status}`);
  }
});

for (const name of ["pr-checks.yml", "ci.yml"]) {
  test(`${name} runs api and db tests in separate jobs, with services only in api`, () => {
    const graph = jobs(workflow(name));
    assert.equal(graph.has("backend"), false, `${name} still has a backend job`);
    const api = graph.get("api");
    const db = graph.get("db");
    assert.ok(api && db, `${name} needs both an api and a db job`);
    assert.ok(api.includes("run: pnpm test:api") && !api.includes("pnpm test:db"));
    assert.ok(db.includes("run: pnpm test:db") && !db.includes("pnpm test:api"));
    for (const [id, text] of [["api", api], ["db", db]]) {
      const draftPrefix = name === "pr-checks.yml" ? "\\(github\\.event\\.pull_request\\.draft != true \\|\\| contains\\(github\\.event\\.pull_request\\.labels\\.\\*\\.name, 'run-full-ci'\\)\\) && " : "";
      assert.match(text, new RegExp(`^ {4}needs: lane\\n {4}if: ${draftPrefix}needs\\.lane\\.outputs\\.lane != 'docs'\\n`, "m"), `${name} ${id} is not skipped by the docs lane`);
      assert.match(text, /TESTCONTAINERS_RYUK_DISABLED: "true"/, `${name} ${id} must disable Ryuk`);
    }
    assert.match(api, /scripts\/ci-services\.sh up/);
    assert.match(api, /if: always\(\)\n {8}shell: bash\n {8}run: bash scripts\/ci-services\.sh down/);
    assert.doesNotMatch(db, /ci-services\.sh|REDIS_URL|MINIO_/, `${name} db must not start or point at Compose services`);
    for (const [id, text] of graph) {
      if (id !== "api") assert.doesNotMatch(text, /ci-services\.sh/, `${name} ${id} starts Compose services`);
    }
  });
}

test("every variable the api and db jobs set reaches turbo tasks under strict env mode", () => {
  const turbo = readJson("turbo.json");
  const allowed = new Set([...turbo.globalEnv, ...turbo.globalPassThroughEnv]);
  for (const name of ["pr-checks.yml", "ci.yml"]) {
    const graph = jobs(workflow(name));
    for (const id of ["api", "db"]) {
      for (const [, variable] of graph.get(id).matchAll(/^ {6,10}([A-Z][A-Z0-9_]+):/gm)) {
        assert.ok(allowed.has(variable), `${name} ${id} sets ${variable}, which turbo strips`);
      }
    }
  }
});

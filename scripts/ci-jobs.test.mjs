import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

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

test("full local tests share root discovery with CI without repeating focused suites", () => {
  assert.equal(rootScripts.test, "pnpm test:root && turbo run test");
  assert.match(rootScripts["test:root"], /node --test 'scripts\/\*\.test\.mjs' 'infra\/minio\/\*\.test\.mjs'/);
  assert.equal(rootScripts["test:unit"], "pnpm test:agent-github && pnpm test:native-session && pnpm test:native-fixture-signin && pnpm test:admin-access && turbo run test:unit");
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

test("full gates build API, worker and public Web once without rebuilding Admin", () => {
  for (const name of ["pr-checks.yml", "ci.yml"]) {
    const graph = jobs(workflow(name));
    const buildJob = graph.get(name === "pr-checks.yml" ? "static" : "build");
    const command = /run: (pnpm exec turbo run build[^\n]*)/.exec(buildJob)?.[1];
    assert.ok(command, `${name} must select production builds through Turbo`);
    assert.doesNotMatch(buildJob, /continue-on-error:|NODE_ENV: test|APP_ENV: test/);
    assert.match(buildJob, /DATABASE_URL: postgresql:\/\/auto_tm_ci:auto_tm_ci_pass@127\.0\.0\.1:1\/auto_tm_ci/);
    const result = spawnSync("pnpm", [...command.split(" ").slice(1), "--dry=json"], {
      cwd: root, encoding: "utf8", timeout: 30000,
    });
    assert.equal(result.status, 0, result.stderr);
    const tasks = JSON.parse(result.stdout).tasks;
    for (const app of ["api", "worker", "web"]) {
      const task = tasks.find(task => task.taskId === `@auto-tm/${app}#build`);
      assert.ok(task, `${name} does not build ${app}`);
      assert.equal(task.command, app === "web" ? "next build" : "nest build");
      assert.ok(task.dependencies.includes("@auto-tm/contracts#build"));
      if (app !== "web") assert.ok(task.dependencies.includes("@auto-tm/db#build"));
    }
    assert.equal(tasks.some(task => task.taskId === "@auto-tm/admin#build"), false);
    assert.equal([...graph.values()].filter(job => job.includes("run: pnpm --filter @auto-tm/admin verify:runtime")).length, 1);
    assert.equal([...graph.values()].filter(job => /run: pnpm (?:build|exec turbo run build)/.test(job)).length, 1);
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

function productionGateResult(build) {
  assert.ok(Number.isInteger(build.status), build.error?.message ?? "build did not exit");
  return spawnSync("bash", ["-c", runBlock(jobs(workflow("pr-checks.yml")).get("pr"))], {
    env: { ...process.env, LANE: "full", LANE_RESULT: "success", DOCS_RESULT: "skipped",
      STATIC_RESULT: build.status === 0 ? "success" : "failure",
      API_RESULT: "success", DB_RESULT: "success", FRONTEND_RESULT: "success" },
    encoding: "utf8",
  });
}

test("API production emit failures missed by ordinary typecheck fail the required gate", t => {
  const fixture = mkdtempSync(join(tmpdir(), "ci-api-build-"));
  t.after(() => rmSync(fixture, { recursive: true, force: true }));
  const cwd = join(fixture, "api");
  mkdirSync(join(cwd, "src"), { recursive: true });
  symlinkSync(join(root, "apps/api/node_modules"), join(cwd, "node_modules"), "dir");
  writeFileSync(join(cwd, "tsconfig.json"), JSON.stringify({
    extends: join(root, "apps/api/tsconfig.json"),
    compilerOptions: { types: [], outDir: "./dist" },
  }));
  for (const config of ["nest-cli.json", "tsconfig.build.json"]) {
    writeFileSync(join(cwd, config), JSON.stringify(readJson(`apps/api/${config}`)));
  }
  const run = (binary, args) => spawnSync(process.execPath, [join(cwd, "node_modules", binary), ...args], {
    cwd, encoding: "utf8", timeout: 30000,
  });
  for (const broken of [true, false]) {
    mkdirSync(join(cwd, "dist/src"), { recursive: true });
    writeFileSync(join(cwd, "dist/src/main.d.ts"), "export interface Fixture { value: number; }\n");
    writeFileSync(join(cwd, "src/main.ts"), broken
      ? 'import type { Fixture } from "../dist/src/main"; export const value: Fixture = { value: 1 };\n'
      : 'export const value = 1;\n');
    const typecheck = run("@typescript/native/bin/tsc", ["--noEmit"]);
    assert.equal(typecheck.status, 0, typecheck.stdout + typecheck.stderr);
    const build = run("@nestjs/cli/bin/nest.js", ["build"]);
    assert.equal(build.status, broken ? 1 : 0, build.stdout + build.stderr);
    if (broken) assert.match(build.stdout + build.stderr, /TS5055/);
    else assert.match(readFileSync(join(cwd, "dist/src/main.js"), "utf8"), /exports.value/);
    const aggregate = productionGateResult(build);
    assert.equal(aggregate.status, broken ? 1 : 0, aggregate.stdout + aggregate.stderr);
    t.diagnostic(`API ${broken ? "broken" : "fixed"}: typecheck ${typecheck.status}, Nest ${build.status}, pr ${aggregate.status}`);
  }
});

test("public Web prerender failures missed by typecheck fail the required gate", t => {
  const cwd = mkdtempSync(join(root, ".ci-web-build-"));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  symlinkSync(join(root, "apps/web/node_modules"), join(cwd, "node_modules"), "dir");
  mkdirSync(join(cwd, "src/app"), { recursive: true });
  writeFileSync(join(cwd, "package.json"), JSON.stringify({ name: "ci-web-build-fixture", private: true }));
  writeFileSync(join(cwd, "tsconfig.json"), JSON.stringify(readJson("apps/web/tsconfig.json")));
  writeFileSync(join(cwd, "next.config.mjs"), `export default ${JSON.stringify({
    output: "standalone", outputFileTracingRoot: root, turbopack: { root },
  })};\n`);
  writeFileSync(join(cwd, "next-env.d.ts"), 'import "next"; import "next/image-types/global";\n');
  writeFileSync(join(cwd, "src/app/layout.tsx"),
    'export default function Layout({ children }: { children: React.ReactNode }) { return <html><body>{children}</body></html>; }\n');
  const run = (binary, args) => spawnSync(process.execPath, [join(cwd, "node_modules", binary), ...args], {
    cwd, encoding: "utf8", timeout: 120000,
    env: { ...process.env, NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1" },
  });
  for (const broken of [true, false]) {
    rmSync(join(cwd, ".next"), { recursive: true, force: true });
    writeFileSync(join(cwd, "src/app/page.tsx"), broken
      ? 'export default function Page() { throw new Error("Q03_PRERENDER_FAILURE"); return <main>Ready</main>; }\n'
      : 'export default function Page() { return <main>Ready</main>; }\n');
    const typecheck = run("@typescript/native/bin/tsc", ["--noEmit"]);
    assert.equal(typecheck.status, 0, typecheck.stdout + typecheck.stderr);
    const build = run("next/dist/bin/next", ["build"]);
    assert.equal(build.status, broken ? 1 : 0, build.stdout + build.stderr);
    if (broken) assert.match(build.stdout + build.stderr, /Q03_PRERENDER_FAILURE/);
    else assert.match(readFileSync(join(cwd, ".next/server/app/index.html"), "utf8"), /Ready/);
    const aggregate = productionGateResult(build);
    assert.equal(aggregate.status, broken ? 1 : 0, aggregate.stdout + aggregate.stderr);
    t.diagnostic(`Web ${broken ? "broken" : "fixed"}: typecheck ${typecheck.status}, Next ${build.status}, pr ${aggregate.status}`);
  }
});

for (const name of ["pr-checks.yml", "ci.yml"]) {
  test(`${name} provides runnable video tools before the real database video tests`, () => {
    const db = jobs(workflow(name)).get("db");
    const preparation = db.slice(0, db.indexOf("run: pnpm test:db"));
    assert.match(preparation, /sudo apt-get update/);
    assert.match(preparation, /sudo apt-get install[^\n]*\bffmpeg\b/);
    assert.match(preparation, /ffmpeg -version/);
    assert.match(preparation, /ffprobe -version/);
    assert.doesNotMatch(db, /continue-on-error:/);
  });

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

for (const name of ["pr-checks.yml", "ci.yml"]) {
  test(`${name} checks trusted documentation policy in both lanes before installing dependencies`, () => {
    const graph = jobs(workflow(name));
    for (const id of ["docs", "static"]) {
      const job = graph.get(id);
      assert.match(job, /uses: actions\/checkout@v7\n {8}with:\n {10}fetch-depth: 0/);
      assert.ok(job.indexOf("run: node scripts/check-agent-docs.mjs") < job.indexOf("run: pnpm install"));
      assert.ok(job.includes("run: node scripts/check-agent-docs.mjs"));
      assert.doesNotMatch(job, /continue-on-error:/);
    }
    assert.match(graph.get("frontend"), /fetch-depth: 0/);
    assert.equal(rootScripts["check:agent-docs"], "node scripts/check-agent-docs.mjs");
    assert.match(rootScripts["test:agent-docs"], /^pnpm check:agent-docs && /);
  });
}

test("documentation policy failure fails the required check in either lane", () => {
  const script = runBlock(jobs(workflow("pr-checks.yml")).get("pr"));
  for (const lane of ["docs", "full"]) {
    const result = spawnSync("bash", ["-c", script], {
      env: { ...process.env, LANE: lane, LANE_RESULT: "success",
        DOCS_RESULT: lane === "docs" ? "failure" : "skipped",
        STATIC_RESULT: lane === "full" ? "failure" : "skipped",
        API_RESULT: lane === "full" ? "success" : "skipped",
        DB_RESULT: lane === "full" ? "success" : "skipped",
        FRONTEND_RESULT: lane === "full" ? "success" : "skipped" },
      encoding: "utf8",
    });
    assert.equal(result.status, 1, result.stdout + result.stderr);
  }
});

for (const name of ["pr-checks.yml", "ci.yml"]) {
  test(`${name} admits TS/JS source in both required lanes with complete trusted history`, () => {
    const graph = jobs(workflow(name));
    for (const id of ["docs", "static"]) {
      const job = graph.get(id);
      assert.match(job, /fetch-depth: 0/);
      for (const command of ["pnpm check:source-policy", "pnpm test:source-policy"]) {
        assert.ok(job.includes(`run: ${command}`), `${id} omits ${command}`);
        assert.ok(job.indexOf(`run: ${command}`) > job.indexOf("run: pnpm install --frozen-lockfile"));
      }
      assert.doesNotMatch(job, /continue-on-error:/);
    }
    assert.equal(rootScripts["check:source-policy"], "node scripts/check-source-policy.mjs");
    assert.equal(rootScripts["test:source-policy"], "node --test scripts/check-source-policy.test.mjs 'scripts/source-policy*.test.mjs' 'scripts/source-policy/*.test.mjs'");
    assert.match(rootScripts.lint, /^pnpm check:source-policy && pnpm check:import-architecture && turbo run lint$/);
    assert.match(rootScripts["test:root"], /node --test 'scripts\/\*\.test\.mjs'/);
  });
}

for (const name of ["pr-checks.yml", "ci.yml"]) {
  test(`${name} runs uncached import architecture checks and fixtures in both lanes`, () => {
    const graph = jobs(workflow(name));
    for (const id of ["docs", "static"]) {
      const job = graph.get(id);
      assert.match(job, /run: pnpm check:import-architecture/);
      assert.match(job, /run: pnpm test:import-architecture/);
      assert.doesNotMatch(job, /continue-on-error:/);
    }
    assert.equal(rootScripts["check:import-architecture"], "node scripts/check-import-architecture.mjs");
    assert.equal(rootScripts["test:import-architecture"], "node --test scripts/check-import-architecture.test.mjs");
    assert.match(rootScripts.lint, /^pnpm check:source-policy && pnpm check:import-architecture && turbo run lint$/);
  });
}

test("a rejected resolved import fails the required aggregate in either CI lane", t => {
  const cwd = mkdtempSync(join(tmpdir(), "carberk-import-gate-"));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const put = (path, value) => {
    mkdirSync(dirname(join(cwd, path)), { recursive: true });
    writeFileSync(join(cwd, path), typeof value === "string" ? value : JSON.stringify(value));
  };
  put("package.json", { private: true });
  put("apps/api/package.json", { name: "@auto-tm/api", dependencies: { "@nestjs/common": "*" } });
  put("scripts/import-architecture/legacy.json", []);
  for (const broken of [true, false]) {
    put("apps/api/src/modules/catalog/domain/Rule.ts", broken ? 'import type { Injectable } from "@nestjs/common";' : "export const value = 1;");
    const guard = spawnSync(process.execPath, [join(root, "scripts/check-import-architecture.mjs"), cwd], { encoding: "utf8" });
    assert.equal(guard.status, broken ? 1 : 0, guard.stdout + guard.stderr);
    if (broken) assert.match(guard.stderr, /domain-purity/);
    for (const lane of ["docs", "full"]) {
      const result = spawnSync("bash", ["-c", runBlock(jobs(workflow("pr-checks.yml")).get("pr"))], {
        env: { ...process.env, LANE: lane, LANE_RESULT: "success",
          DOCS_RESULT: lane === "docs" ? guard.status ? "failure" : "success" : "skipped",
          STATIC_RESULT: lane === "full" ? guard.status ? "failure" : "success" : "skipped",
          API_RESULT: lane === "full" ? "success" : "skipped",
          DB_RESULT: lane === "full" ? "success" : "skipped",
          FRONTEND_RESULT: lane === "full" ? "success" : "skipped" }, encoding: "utf8",
      });
      assert.equal(result.status, broken ? 1 : 0, result.stdout + result.stderr);
    }
  }
});

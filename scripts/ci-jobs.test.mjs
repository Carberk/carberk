import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
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
  assert.match(pr, /\n {4}if: always\(\)\n/);
  for (const id of needs) {
    assert.ok(pr.includes(`needs.${id}.result`), `pr does not check the ${id} job's result`);
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
      assert.match(text, /^ {4}needs: lane\n {4}if: needs\.lane\.outputs\.lane != 'docs'\n/m, `${name} ${id} is not skipped by the docs lane`);
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

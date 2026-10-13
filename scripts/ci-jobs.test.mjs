import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

// PR Checks and CI split the workspace tests between a backend job (with
// services) and a frontend job (without). These checks keep every workspace's
// tests in exactly one of them, and keep the required `pr` check meaningful.

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

test("every workspace with tests runs in exactly one CI test job", () => {
  const backend = filters(rootScripts["test:backend"]);
  const frontend = filters(rootScripts["test:frontend"]);
  assert.deepEqual(backend.filter((name) => frontend.includes(name)), []);
  assert.deepEqual([...backend, ...frontend].sort(), workspacesWithTests());
});

test("the CI test scripts run every root node --test file", () => {
  assert.match(rootScripts["test:root"], /node --test 'scripts\/\*\.test\.mjs'/);
});

for (const name of ["pr-checks.yml", "ci.yml"]) {
  test(`${name} runs the backend, frontend and root tests, lint, typecheck and the admin runtime check`, () => {
    const source = workflow(name);
    for (const command of [
      "pnpm test:backend",
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

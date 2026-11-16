import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { checkRepository, checkSources } from "./check-source-policy.mjs";

const sources = (entries) => new Map(Object.entries(entries));
const check = (current, legacy = {}, trusted = legacy) => checkSources({
  current: sources(current), legacy: sources(legacy), trusted: sources(trusted),
});

test("actual comment tokens fail in every authored JS and TS extension", () => {
  for (const extension of ["js", "jsx", "ts", "tsx", "mjs", "cjs", "mts", "cts"]) {
    const path = `docs/ignored.config.${extension}`;
    assert.match(check({ [path]: "const value = 1; // explanation\n" }).join("\n"), /explanatory comment/);
  }
});

test("regex, strings, templates, JSX attributes and ASI are parsed as code", () => {
  const examples = {
    "regex.js": 'const pattern = /https?:\\/\\/[^/]+/; const other = /[/][*]/;\n',
    "string.ts": 'const url = "https://example.test/*literal*/";\n',
    "template.mjs": 'const message = `// literal /* text */ ${1 + 2}`;\n',
    "view.tsx": 'const view = <a href="https://example.test">// literal</a>;\n',
    "generic.mts": 'const identity = <T>(value: T): T => value;\n',
    "asi.cjs": 'function f() { return\n/abc/.test("abc"); }\n',
  };
  assert.deepEqual(check(examples), []);
  for (const [path, source] of Object.entries({
    "view.tsx": 'const view = <div>{/* explanation */}</div>;\n',
    "template.js": 'const value = `${1 /* explanation */ + 2}`;\n',
    "asi.js": 'function f() { return /* explanation\n */ 3; }\n',
    "unicode.ts": '\uFEFFconst label = "🚙"; /* explanation */\r\n',
  })) assert.match(check({ [path]: source }).join("\n"), /explanatory comment/);
});

test("syntax failures reject files even when the token inventory would be empty", () => {
  for (const source of ['const value = "unterminated', 'const value = ;', '/* unfinished', 'const x = <div>']) {
    assert.match(check({ "broken.tsx": source }).join("\n"), /parse or comparison failed/);
  }
  assert.deepEqual(check({ "ambient.d.cts": 'declare module "example" { export const value: string; }\n' }), []);
  assert.deepEqual(check({ "decorated.ts": '@Controller()\nclass Example { @Inject() value!: string; }\n' }), []);
});

const oldSource = "// old explanation\nexport const oldValue = 1;\nexport const otherValue = 2;\n";

test("unchanged legacy comments survive unrelated insertion while deletion buys no allowance", () => {
  const legacy = { "legacy.ts": oldSource };
  assert.deepEqual(check(legacy, legacy), []);
  assert.deepEqual(check({ "legacy.ts": `export const earlier = 0;\n${oldSource}` }, legacy), []);
  assert.deepEqual(check({ "legacy.ts": oldSource.replace("// old explanation\n", "") }, legacy), []);
  assert.match(check({ "legacy.ts": oldSource.replace("old explanation", "new explanation") }, legacy).join("\n"), /explanatory comment/);
  assert.match(check({ "legacy.ts": `${oldSource}// replacement\n` }, legacy).join("\n"), /explanatory comment/);
});

test("legacy comments cannot move, duplicate, rename or copy", () => {
  const legacy = { "legacy.ts": oldSource };
  const moved = oldSource.replace("// old explanation\n", "") + "// old explanation\n";
  for (const current of [
    { "legacy.ts": moved },
    { "legacy.ts": `${oldSource}// old explanation\n` },
    { "renamed.ts": oldSource },
    { ...legacy, "docs/copied.ts": oldSource },
    { "legacy.ts": oldSource.replace("oldValue = 1;", "oldValue = 1; /* old explanation */") },
  ]) assert.match(check(current, legacy).join("\n"), /explanatory comment/);
});

test("trusted main prevents resurrection and cannot expand the immutable allowance", () => {
  const legacy = { "legacy.ts": oldSource };
  for (const trusted of [{}, { "legacy.ts": oldSource.replace("// old explanation\n", "") }]) {
    assert.match(check(legacy, legacy, trusted).join("\n"), /explanatory comment/);
  }
  const newOnMain = { "new.ts": "// new on main\nexport const value = 1;\n" };
  assert.match(check(newOnMain, {}, newOnMain).join("\n"), /explanatory comment/);
});

test("CRLF, multiline comments and column changes retain exact token boundaries", () => {
  const legacy = { "legacy.js": 'const x = 1;\r\n/* old\r\n explanation */\r\nconst y = 2;\r\n' };
  assert.deepEqual(check(legacy, legacy), []);
  assert.deepEqual(check({ "legacy.js": `const z = 0;\r\n${legacy["legacy.js"]}` }, legacy), []);
  assert.match(check({ "legacy.js": legacy["legacy.js"].replace("/* old", " /* old") }, legacy).join("\n"), /explanatory comment/);
});

test("only compiler-consumed type annotations without prose qualify", () => {
  const accepted = [
    '/** @type {number} */\nconst value = 1;\n',
    '/** @param {number} value\n * @returns {number}\n */\nfunction identity(value) { return value; }\n',
    '/** @typedef {{ id: string }} Entity */\nconst value = 1;\n',
    '/** @typedef {number} Count */',
    '/** @template T\n * @param {T} value\n * @returns {T}\n */\nfunction identity(value) { return value; }\n',
    '/** @satisfies {Record<string, number>} */\nconst value = { x: 1 };\n',
  ];
  for (const source of accepted) assert.deepEqual(check({ "typed.js": source }), [], source);
  for (const source of [
    '/** @type {number} explanation */\nconst value = 1;\n',
    '/** explanation\n * @type {number}\n */\nconst value = 1;\n',
    '/** @param {number} value explanation */\nfunction f(value) {}\n',
    '/** @type {number} */\n',
    '/** @type {number */\nconst value = 1;\n',
    '/** @example something */\nconst value = 1;\n',
    '/** @param {number} missing */\nfunction f(value) {}\n',
    '/** @param {number} value */\nconst value = 1;\n',
    '/** @returns {number} */\nconst value = 1;\n',
    '/** @type {number} */\nconst value: number = 1;\n',
  ]) assert.match(check({ [source.includes(": number") ? "typed.ts" : "typed.js"]: source }).join("\n"), /explanatory comment/, source);
});

test("type-bearing annotations retain declaration output", () => {
  const source = '/** @param {number} value\n * @returns {number}\n */\nexport function twice(value) { return value * 2; }\n';
  assert.deepEqual(check({ "typed.js": source }), []);
  const { outputText } = ts.transpileDeclaration(source, { fileName: "typed.js", compilerOptions: { allowJs: true } });
  assert.match(outputText, /export function twice\(value: number\): number/);
});

test("header references and shebangs require complete machine grammar", () => {
  for (const [path, source] of [
    ["script.mjs", '#!/usr/bin/env node\nconst value = 1;\n'],
    ["script.ts", '#!/usr/bin/env tsx\nconst value = 1;\n'],
    ["types.d.ts", '/// <reference types="node" />\nexport {};\n'],
    ["types.d.mts", '/// <reference path="./other.d.ts" />\nexport {};\n'],
    ["checked.js", '// @ts-check\nconst value = 1;\n'],
  ]) assert.deepEqual(check({ [path]: source }), []);
  for (const source of [
    '// @ts-check explanation\nconst value = 1;\n',
    '// @ts-nocheck\nconst value = 1;\n',
    '// @ts-ignore\nconst value = 1;\n',
    '/// <reference types="node" /> explanation\nexport {};\n',
    '/// <reference fake="node" />\nexport {};\n',
    'const value = 1;\n/// <reference types="node" />\n',
    '#!/usr/bin/env node explanation\nconst value = 1;\n',
    '/* @__PURE__ explanation */\nconst value = 1;\n',
  ]) assert.match(check({ "fake.ts": source }).join("\n"), /explanatory comment/);
});

test("inline rule configuration, blanket disables and fake directives cannot disable admission", () => {
  for (const raw of [
    "/* eslint-disable */", "/* eslint-disable source-policy */",
    "// eslint-disable-next-line", "// eslint-disable-next-line imaginary/rule",
    "// eslint-disable-next-line no-console -- explanation", "/* global explanation */",
    "// prettier-ignore explanation", "// @ts-expect-error explanation", "/* Copyright explanation */",
    "/* SPDX-License-Identifier: MIT explanation */", "// sourceMappingURL=explanation",
  ]) assert.match(check({ "config.cjs": `${raw}\nconst value = 1;\n// explanation\n` }).join("\n"), /explanatory comment/);
});

test("legal notices require an exact whole token and file-specific pinned provenance", () => {
  const token = `/*\n${readFileSync(new URL("../LICENSE", import.meta.url), "utf8")}*/`;
  const notice = { path: "licensed.js", tokenSha256: createHash("sha256").update(token).digest("hex"), origin: "Carberk LICENSE at 48a1bba7ff6dda6bb865e1b496cf002d6019502c" };
  const run = (path, source) => checkSources({ current: sources({ [path]: source }), legacy: sources({}), trusted: sources({}), notices: [notice] });
  assert.deepEqual(run("licensed.js", `${token}\nexport {};\n`), []);
  assert.match(run("copy.js", `${token}\n`).join("\n"), /explanatory comment/);
  assert.match(run("licensed.js", token.replace("*/", "Explanation\n*/")).join("\n"), /explanatory comment/);
  assert.match(run("licensed.js", "/* Copyright (c) 2026 AutoTM. */\n").join("\n"), /explanatory comment/);
});

test("generated exclusions are exact byte pins and do not exempt sibling source", () => {
  const pinned = "/* Generated upstream notice. */\nexport {};\n";
  const exclusions = [{ path: "generated/router.d.ts", sha256: createHash("sha256").update(pinned).digest("hex"), origin: "fixture generator v1 pinned output" }];
  const run = (current) => checkSources({ current: sources(current), legacy: sources({}), trusted: sources({}), exclusions });
  assert.deepEqual(run({ "generated/router.d.ts": pinned }), []);
  assert.match(run({ "generated/router.d.ts": `${pinned}// explanation\n` }).join("\n"), /provenance bytes changed/);
  assert.match(run({ "generated/owned.ts": "// explanation\nexport {};\n" }).join("\n"), /explanatory comment/);
});

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const baselinePolicy = readFileSync(join(repositoryRoot, "scripts/source-policy/baseline.json"), "utf8");
const baselineCommit = JSON.parse(baselinePolicy).commit;

function repository(t) {
  const directory = mkdtempSync(join(tmpdir(), "carberk-source-repository-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const git = (...args) => execFileSync("git", args, { cwd: directory, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
  git("init", "-q");
  const objects = execFileSync("git", ["rev-parse", "--git-path", "objects"], { cwd: repositoryRoot, encoding: "utf8" }).trim();
  mkdirSync(join(directory, ".git/objects/info"), { recursive: true });
  writeFileSync(join(directory, ".git/objects/info/alternates"), `${resolve(repositoryRoot, objects)}\n`);
  const write = (path, source) => {
    mkdirSync(dirname(join(directory, path)), { recursive: true });
    writeFileSync(join(directory, path), source);
  };
  write("scripts/source-policy/baseline.json", baselinePolicy);
  write("config.cjs", "module.exports = {};\n");
  git("add", ".");
  const tree = git("write-tree");
  const commit = git("-c", "user.name=Source Policy Fixture", "-c", "user.email=fixture@example.invalid", "commit-tree", tree, "-p", baselineCommit, "-m", "fixture");
  git("update-ref", "refs/remotes/origin/main", commit);
  return { directory, write, git, commit };
}

test("repository admission sees tracked, untracked and ignored authored config outside lint scope", (t) => {
  const { directory, write, git } = repository(t);
  assert.deepEqual(checkRepository(directory, {}), []);
  write(".gitignore", "ignored/\n");
  for (const path of ["docs/owned.cjs", "ignored/lint.config.js", "config.cjs", "apps/example/dist/tracked.js"]) {
    write(path, "// explanation\nexport {};\n");
    if (path.includes("dist")) git("add", "-f", path);
    assert.match(checkRepository(directory, {}).join("\n"), new RegExp(`${path.replaceAll(".", "\\.")}.*explanatory comment`));
    write(path, "export {};\n");
    if (path.includes("dist")) git("add", "-f", path);
  }
  assert.deepEqual(checkRepository(directory, {}), []);
});

test("repository admission rejects source symlinks and baseline tampering", (t) => {
  const { directory, write } = repository(t);
  write("scripts/source-policy/baseline.json", baselinePolicy.replace("48a1bba7", "00000000"));
  assert.throws(() => checkRepository(directory, {}), /immutable legacy baseline changed/);
  write("scripts/source-policy/baseline.json", baselinePolicy);
  symlinkSync("config.cjs", join(directory, "alias.js"));
  assert.throws(() => checkRepository(directory, {}), /regular file/);
});

test("CI derives comparison only from valid main PR or push event metadata", (t) => {
  const { directory, write, commit } = repository(t);
  const eventPath = join(directory, "event.json");
  const run = (event, name = "pull_request") => {
    write("event.json", JSON.stringify(event));
    return checkRepository(directory, { GITHUB_ACTIONS: "true", GITHUB_EVENT_NAME: name, GITHUB_EVENT_PATH: eventPath });
  };
  assert.deepEqual(run({ pull_request: { base: { ref: "main", sha: commit } } }), []);
  assert.deepEqual(run({ ref: "refs/heads/main", before: commit }, "push"), []);
  for (const event of [{}, { pull_request: { base: { ref: "other", sha: commit } } }, { pull_request: { base: { ref: "main", sha: "HEAD" } } }]) {
    assert.throws(() => run(event), /missing trusted current-main/);
  }
  assert.throws(() => run({ ref: "refs/heads/main", before: "0".repeat(40) }, "push"), /missing trusted current-main/);
  assert.throws(() => run({}, "workflow_dispatch"), /missing trusted current-main/);
});


test("moving a comment fails even when the line diff chooses the comment as its unchanged anchor", () => {
  const before = "const a = 1;\n// old\nconst b = 2;\n";
  const after = "// old\nconst a = 1;\nconst b = 2;\n";
  assert.match(check({ "moved.js": after }, { "moved.js": before }).join("\n"), /explanatory comment/);
});

test("staged source cannot hide comments behind a cleaned working file", (t) => {
  const { directory, write, git } = repository(t);
  write("staged.js", "// staged explanation\nexport {};\n");
  git("add", "staged.js");
  write("staged.js", "export {};\n");
  assert.match(checkRepository(directory, {}).join("\n"), /staged\.js.*explanatory comment/);
});

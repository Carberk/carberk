import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
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
    'const value = /** @type {number} */ (1);\n',
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
    '/** @satisfies {number} */\nexport function value() { return "hello"; }\n',
    '/** @type {number} */\nconsole.log(1);\n',
    '/** @this {{ id: string }} */\nconst value = () => this.id;\n',
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
  for (const name of ["notices.json", "provenance.json"]) {
    const path = `scripts/source-policy/${name}`;
    write(path, readFileSync(join(repositoryRoot, path), "utf8"));
  }
  write("config.cjs", "module.exports = {};\n");
  git("add", ".");
  const tree = git("write-tree");
  const commit = git("-c", "user.name=Source Policy Fixture", "-c", "user.email=fixture@example.invalid", "commit-tree", tree, "-p", baselineCommit, "-m", "fixture");
  git("update-ref", "refs/remotes/origin/main", commit);
  git("update-ref", "HEAD", commit);
  return { directory, write, git, commit };
}

test("the ignored Expo declaration is accepted only with its generated bytes", (t) => {
  const { directory, write } = repository(t);
  const generated = '/// <reference types="expo/types" />\n\n// NOTE: This file should not be edited and should be in your git ignore';
  assert.equal(createHash("sha256").update(generated).digest("hex"),
    "6fc02634da46d3edc5a88eec9173ba6bf709726be3cba83c73ebd8e859d5c147");
  write(".gitignore", "apps/mobile/expo-env.d.ts\n");
  write("apps/mobile/expo-env.d.ts", generated);
  assert.deepEqual(checkRepository(directory, {}), []);
  write("apps/mobile/expo-env.d.ts", `${generated}\n// authored explanation`);
  assert.match(checkRepository(directory, {}).join("\n"), /pinned provenance bytes changed/);
  write("apps/mobile/expo-env.d.ts", generated);
  write("apps/mobile/copied-env.d.ts", generated);
  assert.match(checkRepository(directory, {}).join("\n"), /copied-env\.d\.ts.*explanatory comment/);
});

test("ignored Admin Next declarations require exact generated dev or build bytes", (t) => {
  const { directory, write } = repository(t);
  const generated = (output) => '/// <reference types="next" />\n' +
    '/// <reference types="next/image-types/global" />\n' +
    `import "./${output}/types/routes.d.ts";\n` +
    `import "./${output}/types/root-params.d.ts";\n\n` +
    '// NOTE: This file should not be edited\n' +
    '// see https://nextjs.org/docs/app/api-reference/config/typescript for more information.\n';
  const variants = [
    [".next/dev", "0f70629890b72a0a82e91972cc032c04b658b26c265373cb711cf576bfbf8fcc"],
    [".next", "1862ac4bbbc5192d4bf562161df66ea547ed3e67173100656ab606ae9797db2b"],
  ];
  write(".gitignore", "apps/admin/next-env.d.ts\n");
  for (const [output, hash] of variants) {
    const content = generated(output);
    assert.equal(createHash("sha256").update(content).digest("hex"), hash);
    write("apps/admin/next-env.d.ts", content);
    assert.deepEqual(checkRepository(directory, {}), []);
  }
  write("apps/admin/next-env.d.ts", `${generated(".next")}\n// authored explanation`);
  assert.match(checkRepository(directory, {}).join("\n"), /pinned provenance bytes changed/);
  write("apps/admin/next-env.d.ts", generated(".next").replace('import "./.next/types/root-params.d.ts";\n', ""));
  assert.match(checkRepository(directory, {}).join("\n"), /pinned provenance bytes changed/);
  write("apps/admin/next-env.d.ts", generated(".next"));
  write("apps/admin/copied-env.d.ts", generated(".next"));
  assert.match(checkRepository(directory, {}).join("\n"), /copied-env\.d\.ts.*explanatory comment/);
});

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

test("policy manifests cannot self-authorize new comment exceptions", (t) => {
  const { directory, write, git } = repository(t);
  for (const name of ["notices.json", "provenance.json"]) {
    const path = `scripts/source-policy/${name}`;
    const original = readFileSync(join(directory, path), "utf8");
    write(path, '[{"path":"config.cjs","origin":"self-authored","sha256":"x","tokenSha256":"x"}]\n');
    assert.throws(() => checkRepository(directory, {}), /immutable source-policy manifest changed/);
    git("add", path);
    write(path, original);
    assert.throws(() => checkRepository(directory, {}), /immutable source-policy manifest changed/);
    git("add", path);
  }
  assert.deepEqual(checkRepository(directory, {}), []);
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

test("accepted satisfies annotations have a compiler-visible constraint", () => {
  for (const source of [
    '/** @satisfies {number} */\nexport const value = "hello";\n',
    'export const value = /** @satisfies {number} */ ("hello");\n',
  ]) {
    assert.deepEqual(check({ "typed.js": source }), []);
    const file = ts.createSourceFile("/typed.js", source, ts.ScriptTarget.Latest, true);
    const options = { allowJs: true, checkJs: true, noLib: true, noResolve: true };
    const host = ts.createCompilerHost(options);
    host.getSourceFile = (path) => path === "/typed.js" ? file : undefined;
    const program = ts.createProgram(["/typed.js"], options, host);
    assert.ok(program.getSemanticDiagnostics(file).some((diagnostic) => diagnostic.code === 1360));
  }
});


test("whole-source admission rejects configuration and nested guide comments", () => {
  for (const [path, source] of [
    ["settings.toml", 'name = "# payload" # explanation\n'],
    ["settings.ini", '[app]\n; explanation\nname=value\n'],
    ["gradle.properties", '# explanation\nname=value\n'],
    [".env.template", 'NAME="value#payload" # explanation\n'],
    ["app.service", '[Service]\n# explanation\nExecStart=/bin/true\n'],
    ["rules.pro", '-keep class example.Main # explanation\n'],
    ["Caddyfile", ':8080 {\n # explanation\n respond "hello#payload"\n}\n'],
    ["view.html.template", '<template><!-- explanation --></template>'],
    ["guide.md", '```typescript\n// copied explanation\nexport const value = 1;\n```\n'],
    ["guide.md", '> ```html\n> <!-- explanation -->\n> <p>Hello</p>\n> ```\n'],
  ]) assert.match(check({ [path]: source }).join("\n"), /explanatory comment/, path);
});

test("unknown authored formats and executable fences fail visibly", () => {
  for (const [path, source, language] of [
    ["source.weird", 'const value = 1;', 'weird'],
    ["empty.unknown", '', 'unknown'],
    ["guide.md", '```unknown-runtime\nrun();\n```\n', 'unknown-runtime'],
    ["payload.template", '# explanation\n', 'template'],
  ]) {
    const errors = check({ [path]: source }).join("\n");
    assert.ok(errors.includes(path), errors);
    assert.ok(errors.includes(language), errors);
  }
});

test("format renames and copied guide snippets cannot launder legacy comments", () => {
  const source = '```js\n// explanation\nexport const value = 1;\n```\n';
  const legacy = { "guide.md": source };
  assert.deepEqual(check(legacy, legacy), []);
  for (const current of [
    { "copy.md": source },
    { "guide.md": source + source },
    { "guide.md": source.replace("js\n", "typescript\n") },
    { "generated/copy.md": source },
  ]) assert.match(check(current, legacy).join("\n"), /explanatory comment/);
});

test("configuration hashes and semicolons retain their format-specific runtime meaning", () => {
  for (const [path, source] of [
    ["settings.toml", 'name = "# payload"\ntext = """first\n# payload\nlast"""\nlarge = 9223372036854775807\n'],
    ["settings.toml", 'text = """quote""""\n'],
    ["settings.ini", '[app]\nname=value#payload;payload\n'],
    ["gradle.properties", 'name=value#payload\ncontinued=value\\\n # payload\nescaped=\\#payload\n'],
    [".env.template", 'export NAME="value#payload"\nTEXT=\'first\n# payload\nlast\'\n'],
    ["app.service", '[Service]\nDescription=runtime # payload ; payload\nExecStart=/bin/echo "# payload"\n'],
    ["rules.pro", '-keep class example.Main\n-include "rules#payload.pro"\n'],
    ["Caddyfile", ':8080 {\n respond `first\n# payload\nlast`\n header X-Value {http.request.host}\n respond hello#payload\n}\n'],
    ["view.html.template", '<template><p title="<!-- payload -->">Hello</p></template>'],
    ["Caddyfile", '\n:8080 {\n respond <<BODY\n# runtime payload\nBODY\n}\n'],
    ["settings.json", '{"payload":"// runtime data"}\n'],
    ["guide.md", 'Prose about # headings and // delimiters.\n\n```text\n// literal payload\n```\n\n```html\n<script type="application/json">{"payload":"// value"}</script>\n```\n'],
  ]) assert.deepEqual(check({ [path]: source }), [], path);
});

test("configuration machine keywords never grant comment exceptions", () => {
  for (const [path, source] of [
    ["settings.toml", '# source-policy-disable\nname="value"\n'],
    ["app.service", '# systemd directive: explanation\n[Service]\nExecStart=/bin/true\n'],
    [".env", '#!/usr/bin/env node explanation\nNAME=value\n'],
    ["rules.pro", '# keep compiler directive explanation\n-keep class example.Main\n'],
    ["Caddyfile", '# syntax=caddy explanation\n:8080 { respond hello }\n'],
    ["guide.md", '```js\n// @ts-check explanation\nexport {};\n```\n'],
    ["scripts/source-policy/config.ini", '# disable-checker\n[policy]\nenabled=false\n'],
  ]) assert.match(check({ [path]: source }).join("\n"), /explanatory comment/, path);
});

test("declared nested languages retain directives, exact host locations and legal provenance", () => {
  assert.deepEqual(check({ "guide.md": '```js\n// @ts-check\nexport const value = 1;\n```\n' }), []);
  const source = '> ```html\r\n> <script>\r\n> // explanation\r\n> const value = 1;\r\n> </script>\r\n> ```\r\n';
  assert.match(check({ "guide.md": source }).join("\n"), /guide\.md:3:3: new or moved explanatory comment/);
  const token = '<!-- Copyright (c) fixture owner. -->';
  const notice = { path: "guide.md", tokenSha256: createHash("sha256").update(token).digest("hex"), origin: "fixture license" };
  const run = (path, value) => checkSources({ current: sources({ [path]: value }), legacy: sources({}), trusted: sources({}), notices: [notice] });
  assert.deepEqual(run("guide.md", `\`\`\`html\n${token}\n<p>Hello</p>\n\`\`\`\n`), []);
  assert.match(run("copy.md", `\`\`\`html\n${token}\n\`\`\`\n`).join("\n"), /explanatory comment/);
});

test("legacy unsupported spans are visible, cannot grow and cannot be copied or resurrected", () => {
  const legacy = { "guide.md": '```unknown-runtime\nexecute();\n```\n' };
  const report = {};
  assert.deepEqual(checkSources({ current: sources(legacy), legacy: sources(legacy), trusted: sources(legacy), report }), []);
  assert.equal(report.deferred[0].path, "guide.md");
  assert.equal(report.deferred[0].language, "unknown-runtime");
  for (const current of [
    { "guide.md": legacy["guide.md"].replace("execute();", "execute(); // explanation") },
    { "copy.md": legacy["guide.md"] },
    { "guide.md": legacy["guide.md"] + legacy["guide.md"] },
  ]) assert.match(check(current, legacy).join("\n"), /unsupported.*unknown-runtime/);
  assert.match(check(legacy, legacy, {}).join("\n"), /unsupported.*unknown-runtime/);
});

test("immutable history and upstream exceptions require original paths and exact bytes", () => {
  const source = '```js\n// historical explanation\nexport {};\n```\n';
  const path = "docs/adr/0001-decision.md";
  const legacy = { [path]: source };
  const report = {};
  assert.deepEqual(checkSources({ current: sources(legacy), legacy: sources(legacy), trusted: sources(legacy), report }), []);
  assert.equal(report.exclusions[0].path, path);
  assert.match(check({ [path]: source + "Changed\n" }, legacy).join("\n"), /immutable history/);
  for (const copied of ["docs/adr/9999-copy.md", "generated/copy.md", "docs/history/copy.md"]) {
    assert.match(check({ [copied]: source }, legacy).join("\n"), /explanatory comment/);
  }
});

test("new executable YAML scalars are inspected while ordinary payload values stay data", () => {
  for (const scalar of [
    'echo ok # explanation',
    '"echo ok # explanation"',
    "'echo ok # explanation'",
    '|\n          echo ok # explanation',
  ]) {
    const source = `jobs:\n  test:\n    steps:\n      - run: ${scalar}\n`;
    assert.match(check({ ".github/workflows/new.yml": source }).join("\n"), /explanatory comment/, scalar);
  }
  assert.deepEqual(check({ ".github/workflows/new.yml": 'jobs:\n  test:\n    steps:\n      - run: echo "# payload"\n        env:\n          MESSAGE: "# runtime data"\n' }), []);
});

test("repository-wide admission includes staged, ignored and committed non-JS additions", (t) => {
  const { directory, write, git, commit } = repository(t);
  write(".gitignore", "ignored/\n");
  for (const path of ["ignored/settings.toml", "generated/settings.ini", "scripts/source-policy/settings.properties", "ignored/view.html.template"]) {
    const source = path.endsWith(".template") ? '<!-- explanation -->' : '# explanation\nname="value"\n';
    write(path, source);
    assert.match(checkRepository(directory, {}).join("\n"), /explanatory comment/);
    write(path, path.endsWith(".template") ? '<p>Hello</p>' : 'name="value"\n');
  }
  write("guide.md", '```js\n// staged explanation\nexport {};\n```\n');
  git("add", "guide.md");
  write("guide.md", '```js\nexport {};\n```\n');
  assert.match(checkRepository(directory, {}).join("\n"), /staged: guide\.md.*explanatory comment/);
  git("add", "guide.md");
  write("committed.toml", '# explanation\nname="value"\n');
  git("add", "committed.toml");
  const tree = git("write-tree");
  const head = git("-c", "user.name=Source Policy Fixture", "-c", "user.email=fixture@example.invalid", "commit-tree", tree, "-p", commit, "-m", "authored addition");
  git("update-ref", "HEAD", head);
  write("event.json", JSON.stringify({ pull_request: { base: { ref: "main", sha: commit } } }));
  assert.match(checkRepository(directory, { GITHUB_ACTIONS: "true", GITHUB_EVENT_NAME: "pull_request", GITHUB_EVENT_PATH: join(directory, "event.json") }).join("\n"), /committed\.toml.*explanatory comment/);
});


test("ignored authored files cannot borrow a generated output directory exemption", (t) => {
  const { directory, write } = repository(t);
  for (const path of ["packages/db/generated/owned.ts", "apps/example/dist/owned.ts", "apps/example/build/owned.kt"]) {
    write(path, "// explanation\n");
    assert.match(checkRepository(directory, {}).join("\n"), /explanatory comment|unsupported/);
    rmSync(join(directory, path));
  }
});


test("executable markup attributes cannot conceal code behind host parsing", () => {
  assert.match(check({ "view.html.template": '<p style="color:red; /* explanation */">Hello</p>' }).join("\n"), /explanatory comment/);
  for (const source of [
    '<button onclick="run(); /* explanation */">Run</button>',
    '<a href="javascript:run(); /* explanation */">Run</a>',
    '<iframe srcdoc="&lt;!-- explanation --&gt;"></iframe>',
  ]) assert.match(check({ "guide.md": `\`\`\`html\n${source}\n\`\`\`\n` }).join("\n"), /unsupported.*(?:javascript|html)-/);
  assert.deepEqual(check({ "view.html.template": '<p style="color:red" title="// runtime payload">Hello</p>' }), []);
});


test("Compose argv payloads stay data and executable indirection fails visibly", () => {
  assert.deepEqual(check({ "infra/compose/new.yml": 'services:\n  app:\n    command: "server # runtime payload"\n' }), []);
  for (const source of [
    'services:\n  app:\n    command: ["sh", "-c", "echo ok # explanation"]\n',
    'services:\n  app:\n    entrypoint: ["/bin/bash", "-c"]\n    command: "echo ok # explanation"\n',
  ]) assert.match(check({ "infra/compose/new.yml": source }).join("\n"), /unsupported.*compose-executable/);
  assert.match(check({ ".github/workflows/new.yml": 'script: &script echo ok # comment\njobs:\n  test:\n    steps:\n      - run: *script\n' }).join("\n"), /unsupported.*workflow-run/);
});


test("guide workflow examples inspect executable fields while unrelated run values stay data", () => {
  const workflow = 'jobs:\n  test:\n    env:\n      run: "# runtime data"\n    steps:\n      - run: echo ok # explanation\n';
  assert.match(check({ "guide.md": `\`\`\`yaml\n${workflow}\`\`\`\n` }).join("\n"), /explanatory comment/);
  assert.deepEqual(check({ ".github/workflows/new.yml": workflow.replace("echo ok # explanation", "echo ok") }), []);
});

test("asset-looking ASCII programs never acquire binary provenance", () => {
  for (const [path, source] of [
    ["copy.jar", "PK: // explanation\nvoid 0;\n"],
    ["copy.otf", "OTTO: // explanation\nvoid 0;\n"],
    ["copy.woff2", "wOF2: // explanation\nvoid 0;\n"],
    ["copy.mp4", "let ftyp; // explanation\n"],
  ]) assert.notDeepEqual(check({ [path]: source }), [], path);
});

test("unfenced Markdown HTML receives the same executable attribute admission as templates", () => {
  assert.match(check({ "guide.md": '<p style="color:red; /* explanation */">Hello</p>\n' }).join("\n"), /explanatory comment/);
  assert.match(check({ "guide.md": '<button onclick="run(); /* explanation */">Run</button>\n' }).join("\n"), /unsupported.*javascript-attribute/);
});

test("package script programs are executable while ordinary JSON values remain data", () => {
  assert.match(check({ "package.json": '{"scripts":{"build":"echo ok # explanation"}}' }).join("\n"), /explanatory comment|unsupported.*shell/);
  assert.deepEqual(check({ "package.json": '{"description":"# runtime data","scripts":{"build":"echo ok"}}' }), []);
});

test("decoded Compose interpreter options and aliases cannot conceal executable content", () => {
  for (const command of ['["node", "--eval", "1 /* explanation */"]', '*program']) {
    const source = `program: &program ["sh", "-c", "echo ok # explanation"]\nservices:\n  app:\n    command: ${command}\n`;
    assert.match(check({ "infra/compose/new.yml": source }).join("\n"), /unsupported.*compose-executable/);
  }
});

test("systemd logical assignments classify spaced and continued interpreter commands", () => {
  for (const value of [
    'ExecStart = /bin/sh -c "echo ok # explanation"',
    'ExecStart=/bin/sh \\\n -c "echo ok # explanation"',
    'ExecStart=/usr/bin/python3 -c "1 # explanation"',
    'ExecStart=/usr/bin/node --eval "1 /* explanation */"',
  ]) assert.match(check({ "app.service": `[Service]\n${value}\n` }).join("\n"), /unsupported.*systemd/);
});

test("INI backslashes never suppress comments as properties continuations do", () => {
  assert.match(check({ "app.ini": '[app]\npath=C:\\\n; explanation\nname=value\n' }).join("\n"), /explanatory comment/);
});

test("real image, font, archive and video payloads retain binary semantics", () => {
  for (const path of [
    "apps/mobile/assets/images/icon.png", "apps/admin/src/app/favicon.ico", "apps/mobile/assets/fonts/Geist-Regular.ttf",
    "apps/phone-agent/gradle/wrapper/gradle-wrapper.jar", "packages/db/scripts/reviewer-fixtures/camry-1.jpg",
    "packages/db/scripts/ui-fixtures/synthetic-video/v1/portrait.mp4",
  ]) {
    const bytes = readFileSync(join(repositoryRoot, path));
    assert.deepEqual(checkSources({ current: new Map([[`copy${path.slice(path.lastIndexOf("."))}`, bytes]]), legacy: sources({}), trusted: sources({}) }), [], path);
  }
});

test("known compiler outputs pass exact producer bytes while authored siblings and mutations fail", (t) => {
  const { directory, write, git, commit } = repository(t);
  write("packages/contracts/scripts/build.cjs", "export {};\n");
  write("packages/contracts/tsconfig.build.json", JSON.stringify({ compilerOptions: {
    target: "ES2022", module: "CommonJS", rootDir: "src", outDir: "dist", declaration: true, declarationMap: true, sourceMap: true,
  }, include: ["src/**/*.ts"] }));
  write("packages/contracts/src/index.ts", "export const value = 1;\n");
  git("add", ".");
  const tree = git("write-tree");
  const base = git("-c", "user.name=Source Policy Fixture", "-c", "user.email=fixture@example.invalid", "commit-tree", tree, "-p", commit, "-m", "compiler fixture");
  git("update-ref", "refs/remotes/origin/main", base);
  const configPath = join(directory, "packages/contracts/tsconfig.build.json");
  const compiler = join(repositoryRoot, "node_modules/@typescript/native/bin/tsc");
  execFileSync(process.execPath, [compiler, "-p", configPath], { cwd: directory });
  write("packages/contracts/dist/package.json", '{"type":"commonjs"}\n');
  assert.deepEqual(checkRepository(directory, {}), []);
  write("packages/contracts/dist/owned.js", "// authored explanation\n");
  assert.match(checkRepository(directory, {}).join("\n"), /owned\.js.*explanatory comment/);
  rmSync(join(directory, "packages/contracts/dist/owned.js"));
  write("packages/contracts/dist/index.js.map", '{"version":3,"sources":[],"mappings":""}');
  assert.match(checkRepository(directory, {}).join("\n"), /index\.js\.map.*provenance bytes changed/);
  const originalConfig = JSON.parse(readFileSync(configPath, "utf8"));
  for (const option of ["declarationDir", "outFile", "tsBuildInfoFile"]) {
    write("packages/contracts/tsconfig.build.json", JSON.stringify({ ...originalConfig,
      compilerOptions: { ...originalConfig.compilerOptions, [option]: "./policy-overwrite" } }));
    assert.throws(() => checkRepository(directory, {}), /unsupported producer output configuration/);
    assert.equal(existsSync(join(directory, "packages/contracts/policy-overwrite")), false);
  }

});

test("built-in Prisma output is verified from schema rather than trusting generated headers", (t) => {
  const { directory, write, git } = repository(t);
  write(".gitignore", "node_modules\n**/node_modules\npackages/db/generated/\n");
  symlinkSync(join(repositoryRoot, "node_modules"), join(directory, "node_modules"));
  write("package.json", '{"private":true}\n');
  write("packages/db/package.json", '{"name":"source-policy-fixture"}\n');
  write("packages/db/tsconfig.json", '{"compilerOptions":{"module":"ESNext","moduleResolution":"Bundler"}}\n');
  write("packages/db/tsconfig.build.json", '{"extends":"./tsconfig.json"}\n');
  write("packages/db/prisma/schema.prisma", 'generator client {\n  provider = "prisma-client"\n  output = "../generated/prisma/client"\n  moduleFormat = "cjs"\n}\ndatasource db {\n  provider = "postgresql"\n}\nmodel Item {\n  id String @id\n}\n');
  symlinkSync(join(repositoryRoot, "packages/db/node_modules"), join(directory, "packages/db/node_modules"));
  write("prisma.config.mjs", 'export default { schema: "packages/db/prisma/schema.prisma" };\n');
  const manifest = JSON.parse(readFileSync(join(repositoryRoot, "packages/db/node_modules/prisma/package.json"), "utf8"));
  execFileSync(process.execPath, [join(repositoryRoot, "packages/db/node_modules/prisma", manifest.bin.prisma), "generate", "--config", join(directory, "prisma.config.mjs"), "--generator", "client"], {
    cwd: directory, env: { ...process.env, PRISMA_GENERATE_SKIP_AUTOINSTALL: "1" }, stdio: ["ignore", "pipe", "pipe"],
  });
  git("add", ".");
  assert.deepEqual(checkRepository(directory, {}), []);
  const target = "packages/db/generated/prisma/client/client.ts";
  const generated = readFileSync(join(directory, target), "utf8");
  write(target, `${generated}\n// forged generated explanation\n`);
  assert.match(checkRepository(directory, {}).join("\n"), /client\.ts.*provenance bytes changed/);
  write(target, generated);
  write("packages/db/generated/prisma/client/owned.ts", "// generated-looking explanation\nexport {};\n");
  assert.match(checkRepository(directory, {}).join("\n"), /owned\.ts.*explanatory comment/);
});

test("duplicate package script sections cannot hide the effective executable value", () => {
  for (const source of [
    '{"scripts":{"safe":"echo ok"},"scripts":{"build":"echo ok # explanation"}}',
    '{"scripts":["echo ok # explanation"]}',
    '{"scripts":{"build":"echo ok # explanation"},"scripts":{"safe":"echo ok"}}',
    '{"scripts":{"safe":"echo ok"},"scr\\u0069pts":{"build":"echo ok # explanation"}}',
  ]) assert.match(check({ "package.json": source }).join("\n"), /unsupported.*json|duplicate scripts/);
});

test("Compose merge and collection aliases cannot hide inherited executable configuration", () => {
  for (const source of [
    'x-base: &base\n  command: ["sh", "-c", "echo ok # explanation"]\nservices:\n  app:\n    <<: *base\n',
    'x-services: &services\n  app:\n    command: ["node", "--eval", "1 /* explanation */"]\nservices: *services\n',
    'x-root: &root\n  services:\n    app:\n      command: ["sh", "-c", "echo ok # explanation"]\n<<: *root\n',
  ]) assert.match(check({ "infra/compose/new.yml": source }).join("\n"), /unsupported.*(?:compose|yaml)-executable/);
});

test("systemd interpreter option quoting and escapes never disable executable admission", () => {
  for (const value of [
    '/bin/sh "-c" "echo ok # explanation"',
    '/usr/bin/node "--eval" "1 /* explanation */"',
    '/usr/bin/python3 \'-c\' "1 # explanation"',
    '/bin/sh "-\\x63" "echo ok # explanation"',
    '/bin/sh $OPTIONS "echo ok # explanation"',
  ]) assert.match(check({ "app.service": `[Service]\nExecStart=${value}\n` }).join("\n"), /unsupported.*systemd/);
});


test("NVM version files inspect their documented comments rather than bypassing configuration admission", () => {
  assert.deepEqual(check({ ".nvmrc": "22.23.3\n" }), []);
  for (const source of ["22.23.3 # explanation\n", "# explanation\n22.23.3\n"]) {
    assert.match(check({ ".nvmrc": source }).join("\n"), /explanatory comment/);
  }
});

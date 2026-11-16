import assert from "node:assert/strict";
import test from "node:test";
import { parsePython } from "./python.mjs";
import { parseShell } from "./shell.mjs";

test("shell parser separates comments from quotes, substitutions, continuations and heredoc data", () => {
  const source = '#!/usr/bin/env bash\necho "🚙 # data" \\\n  "$(echo ok # nested\n)" # outer\ncat <<\'DATA\'\n# payload\nDATA\n';
  const result = parseShell({ path: "tool", source, fileType: "shell", executable: true });
  assert.deepEqual(result.comments.map(({ raw, exception }) => [raw, exception]), [
    ["#!/usr/bin/env bash", true], ["# nested", false], ["# outer", false],
  ]);
  for (const item of result.comments) assert.equal(source.slice(item.startOffset, item.endOffset), item.raw);
  assert.deepEqual(result.deferred, []);
});

test("declared POSIX and Bash syntax reject malformed and unsupported programs", () => {
  for (const source of ['echo "unfinished', "if true; then", "cat <<EOF\nmissing\n", "echo $(", "items=(one two)\n"]) {
    assert.throws(() => parseShell({ path: "tool", source, fileType: "shell" }), /shell parse failed/);
  }
  assert.deepEqual(parseShell({ path: "tool", source: "[[ x == x ]]\n", fileType: "shell", dialect: "bash" }).deferred, []);
  assert.throws(() => parseShell({ path: "tool", source: "echo ok", fileType: "text" }), /configured shell/);
  assert.throws(() => parseShell({ path: "tool", source: "echo ok", fileType: "shell", dialect: "zsh" }), /unsupported shell grammar/);
});

test("interpreter snippets use their grammar with mapped comments or an explicit deferred result", () => {
  const source = "bash -c 'echo ok # nested'\npython3 <<'PY'\n# python\nprint(1)\nPY\n";
  const adapters = { python: parsePython };
  const result = parseShell({ path: "tool", source, fileType: "shell", adapters });
  assert.deepEqual(result.comments.map(({ raw }) => raw), ["# nested", "# python"]);
  assert.deepEqual(result.deferred, []);
  for (const source of ["bash -c \"$CODE\"", "bash -ec 'echo ok'", "python3 -c 'print(1)'", "python3 <<PY\nprint(1)\nPY\n"]) {
    assert.ok(parseShell({ path: "tool", source, fileType: "shell" }).deferred.length, source);
  }
});

test("only a valid first-position executable shell shebang is exempt", () => {
  for (const [source, executable, exception] of [
    ["#!/bin/bash -eu\necho ok", true, true],
    ["#!/usr/bin/env bash\necho ok", false, false],
    ["\n#!/usr/bin/env bash\necho ok", true, false],
  ]) assert.equal(parseShell({ path: "tool", source, executable, fileType: "shell" }).comments[0].exception, exception);
  for (const source of ["#!/usr/bin/env fish\necho ok", "#!/usr/bin/env bash explanation\necho ok"]) {
    assert.throws(() => parseShell({ path: "tool", source, executable: true, fileType: "shell" }), /unsupported shell shebang/);
  }
});

test("YAML executable declarations compose with the shell adapter and keep host offsets", async () => {
  const { parseYaml } = await import("./yaml.mjs");
  const source = 'steps:\n  - run: |\n      echo "# data"\n      # script\n';
  const result = parseYaml({ path: "workflow.yml", source, fileType: "yaml", embedded: [{ path: ["steps", 0, "run"], fileType: "shell" }], adapters: { shell: parseShell } });
  assert.deepEqual(result.comments.map(({ raw, start }) => [raw, start]), [["# script", { line: 4, column: 6 }]]);
  assert.deepEqual(result.deferred, []);
});

test("all executable adapters inspect dangerous payloads without running them or changing input", async (t) => {
  const { mkdtempSync, existsSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { parseDocker } = await import("./docker.mjs");
  const { parseMake } = await import("./make.mjs");
  const directory = mkdtempSync(join(tmpdir(), "g04-nonexecution-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const marker = join(directory, "executed");
  const shell = `touch '${marker}'\nvalue=$(touch '${marker}')\nbash -c 'touch "${marker}" # code'\n`;
  assert.equal(parseShell({ path: "tool", source: shell, fileType: "shell" }).comments[0].raw, "# code");
  assert.equal(parseDocker({ path: "Dockerfile", source: `FROM alpine\nRUN <<'EOF'\n${shell}EOF\n`, fileType: "docker" }).comments[0].raw, "# code");
  assert.ok(parseMake({ path: "Makefile", source: `VALUE := $(shell touch '${marker}')\nall:\n\ttouch '${marker}'\n`, fileType: "make" }).deferred.length);
  assert.equal(existsSync(marker), false);
});

test("interpreter heredocs stay data unless the effective stdin is proven executable", () => {
  for (const source of [
    "bash -c 'cat' <<'DATA'\n# payload\nDATA\n",
    "bash script.sh <<'DATA'\n# payload\nDATA\n",
    "bash 3<<'DATA'\n# payload\nDATA\n",
    "bash <<'DATA' < input\n# payload\nDATA\n",
    "python3 -c 'print(input())' <<'DATA'\n# payload\nDATA\n",
  ]) assert.deepEqual(parseShell({ path: "tool", source, fileType: "shell", adapters: { python: parsePython } }).comments, [], source);
  const result = parseShell({ path: "tool", source: "bash -s 0<<'CODE'\n# script\nCODE\n", fileType: "shell" });
  assert.deepEqual(result.comments.map(({ raw }) => raw), ["# script"]);
  assert.deepEqual(result.deferred, []);
  assert.ok(parseShell({ path: "tool", source: "bash -e <<'CODE'\n# script\nCODE\n", fileType: "shell" }).deferred.length);
  for (const source of ["bash <<'CODE' 0<&0\n# script\nCODE\n", "bash 3<<'CODE' 0<&3\n# script\nCODE\n"]) {
    assert.ok(parseShell({ path: "tool", source, fileType: "shell" }).deferred.length, source);
  }
});

test("long eval options cannot silently hide executable snippets", () => {
  for (const source of ["node --eval '// code'", "node --eval='// code'", "node --print '// code'", "node -p '// code'", "perl -E '# code'", "env node --eval '// code'", "node \"--eval=\"'// code'", "node \"--eval=$CODE\""]) {
    assert.ok(parseShell({ path: "tool", source, fileType: "shell" }).deferred.length, source);
  }
});

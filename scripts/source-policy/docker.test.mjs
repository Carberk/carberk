import assert from "node:assert/strict";
import test from "node:test";
import { parseDocker } from "./docker.mjs";

test("Docker directives, continued RUN comments and payload heredocs keep their grammars", () => {
  const source = '# syntax=docker/dockerfile:1\n# escape=`\nFROM alpine\nRUN echo "# data" `\n && echo ok # shell\nRUN <<\'EOF\'\n# script\necho hi\nEOF\nCOPY <<DATA /data\n# payload\nDATA\n';
  const result = parseDocker({ path: "Dockerfile", source, fileType: "docker" });
  assert.deepEqual(result.comments.map(({ raw, exception }) => [raw, exception]), [
    ["# syntax=docker/dockerfile:1", true], ["# escape=`", true], ["# shell", false], ["# script", false],
  ]);
  assert.deepEqual(result.deferred, []);
});

test("Docker shell selection is stage-local and executable arrays retain JSON data", () => {
  const source = 'FROM alpine AS base\nSHELL ["/bin/bash", "-eo", "pipefail", "-c"]\nRUN items=(one two) # bash\nFROM base AS child\nRUN items=(one) # inherited\nFROM alpine\nCMD ["echo", "# data"]\nHEALTHCHECK --interval=30s CMD echo ok # health\n';
  const result = parseDocker({ path: "Dockerfile", source, fileType: "docker" });
  assert.deepEqual(result.comments.map(({ raw }) => raw), ["# bash", "# inherited", "# health"]);
  assert.deepEqual(result.deferred, []);
  assert.throws(() => parseDocker({ path: "Dockerfile", source: source + "RUN items=(one)\n", fileType: "docker" }), /shell parse failed/);
});

test("Docker reports malformed syntax and unsupported executable grammars without passing", () => {
  for (const source of [
    "FROM\n", "RUN echo ok\n", "FROM alpine\nUNKNOWN data\n", 'FROM alpine\nRUN ["echo",]\n',
    'FROM alpine\nSHELL ["bash",]\n', "# escape=x\nFROM alpine\n", "FROM alpine\nRUN <<EOF\necho no\n", "FROM alpine\nRUN echo ok \\\n",
  ]) assert.throws(() => parseDocker({ path: "Dockerfile", source, fileType: "docker" }), /Docker|shell parse failed/, source);
  for (const source of [
    'FROM alpine\nSHELL ["powershell", "-Command"]\nRUN Write-Host ok\n',
    'FROM alpine\nRUN ["bash", "-ec", "echo ok"]\n', "FROM alpine\nRUN --mount=type=cache,target=/tmp echo ok\n",
  ]) assert.ok(parseDocker({ path: "Dockerfile", source, fileType: "docker" }).deferred.length, source);
});

test("Docker host comments inside continuations do not split the shell command", () => {
  const source = 'FROM alpine\nRUN echo ok \\\n  # Docker host comment\n  && echo "# data" # shell comment\n';
  const result = parseDocker({ path: "Dockerfile", source, fileType: "docker" });
  assert.deepEqual(result.comments.map(({ raw }) => raw), ["# Docker host comment", "# shell comment"]);
  assert.deepEqual(result.deferred, []);
});

test("Docker exec-form shell snippets are parsed without reinterpreting ordinary argv data", () => {
  const source = 'FROM alpine\nRUN ["bash", "-c", "echo ok # embedded"]\nCMD ["node", "dist/main.js"]\n';
  const result = parseDocker({ path: "Dockerfile", source, fileType: "docker" });
  assert.deepEqual(result.comments.map(({ raw }) => raw), ["# embedded"]);
  assert.deepEqual(result.deferred, []);
  assert.equal(result.comments[0].startOffset, 40);
});

test("Docker executable heredoc shebangs declare Python while COPY heredocs stay data", async () => {
  const { parsePython } = await import("./python.mjs");
  const source = 'FROM alpine\nRUN <<EOF\n#!/usr/bin/env python3\n# python\nprint("# data")\nEOF\nCOPY <<DATA /script.py\n# payload\nDATA\n';
  const result = parseDocker({ path: "Dockerfile", source, fileType: "docker", adapters: { python: parsePython } });
  assert.deepEqual(result.comments.map(({ raw, exception }) => [raw, exception]), [["#!/usr/bin/env python3", true], ["# python", false]]);
  assert.deepEqual(result.deferred, []);
});

test("unchecked Docker instruction syntax is rejected or deferred instead of passing", () => {
  for (const source of ['FROM alpine\nCOPY ["a",]\n', 'FROM alpine\nCOPY ["a"]\n']) {
    assert.throws(() => parseDocker({ path: "Dockerfile", source, fileType: "docker" }), /Docker/);
  }
  for (const source of ["FROM alpine\nCOPY x\n", "FROM alpine\nENV x\n", "FROM alpine\nEXPOSE nope\n"]) {
    assert.ok(parseDocker({ path: "Dockerfile", source, fileType: "docker" }).deferred.length, source);
  }
});

test("Docker long eval options cannot silently hide executable snippets", () => {
  for (const source of ['FROM alpine\nRUN ["node", "--eval", "// code"]\n', 'FROM alpine\nRUN ["node", "--eval=// code"]\n', 'FROM alpine\nRUN node --eval \'// code\'\n']) {
    assert.ok(parseDocker({ path: "Dockerfile", source, fileType: "docker" }).deferred.length, source);
  }
});

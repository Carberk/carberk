import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

const source = new URL("../apps/mobile/scripts/local-android-release.mjs", import.meta.url);

function runBuild(t, args = [], extraEnv = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "android-release-test-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const mobile = path.join(root, "apps/mobile");
  const bin = path.join(root, "bin");
  const log = path.join(root, "commands.jsonl");
  for (const dir of ["scripts", "assets/images", "android/app/src/main/res"]) {
    fs.mkdirSync(path.join(mobile, dir), { recursive: true });
  }
  fs.mkdirSync(bin);
  fs.copyFileSync(source, path.join(mobile, "scripts/local-android-release.mjs"));
  fs.writeFileSync(path.join(mobile, "eas.json"), JSON.stringify({
    build: { base: { env: {} }, production: { env: {} } },
  }));
  fs.writeFileSync(path.join(mobile, "app.config.js"), "");
  for (const entry of ["app.config.js", "assets/images"]) {
    fs.utimesSync(path.join(mobile, entry), 1, 1);
  }
  const fakeCommand = `#!${process.execPath}
const fs = require('node:fs');
const path = require('node:path');
const command = path.basename(process.argv[1]);
fs.appendFileSync(process.env.BUILD_TEST_LOG, JSON.stringify({command, args: process.argv.slice(2)}) + '\\n');
if (command === 'unzip') process.stdout.write(Buffer.from(process.env.BUILD_TEST_BAD_BUNDLE ? [0] : [0xc6, 0x1f, 0xbc, 0x03]));
`;
  for (const command of ["pnpm", "npx", "unzip"]) {
    fs.writeFileSync(path.join(bin, command), fakeCommand, { mode: 0o755 });
  }
  fs.writeFileSync(path.join(mobile, "android/gradlew"), fakeCommand, { mode: 0o755 });
  const result = spawnSync(process.execPath, [path.join(mobile, "scripts/local-android-release.mjs"), ...args], {
    encoding: "utf8",
    env: { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}`, BUILD_TEST_LOG: log, ...extraEnv },
  });
  return {
    ...result,
    commands: fs.existsSync(log) ? fs.readFileSync(log, "utf8").trim().split("\n").map(JSON.parse) : [],
  };
}

test("a full release preserves configured architectures and bounds build concurrency", (t) => {
  const result = runBuild(t);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.commands.map(({ command }) => command), ["pnpm", "gradlew", "unzip"]);
  assert.deepEqual(result.commands[0].args, ["--filter", "@auto-tm/contracts", "build"]);
  assert.deepEqual(result.commands[1].args, ["assembleRelease", "--max-workers=2", "--no-parallel", "--priority=low", "--no-daemon"]);
  assert.equal(result.commands[2].args[0], "-p");
  assert.match(result.commands[2].args[1], /android\/app\/build\/outputs\/apk\/release\/app-release\.apk$/);
  assert.equal(result.commands[2].args[2], "assets/index.android.bundle");
  assert.match(result.stdout, /OK: .*app-release\.apk/);
});

test("an emulator smoke builds only the explicitly selected ABI", (t) => {
  const result = runBuild(t, ["--abi", "arm64-v8a"]);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.commands.find(({ command }) => command === "gradlew").args, [
    "assembleRelease", "--max-workers=2", "--no-parallel", "--priority=low", "--no-daemon", "-PreactNativeArchitectures=arm64-v8a",
  ]);
});

for (const args of [["--abi"], ["--abi", "invalid"], ["--unknown"], ["--abi", "arm64-v8a", "extra"]]) {
  test(`invalid selection starts no build: ${args.join(" ")}`, (t) => {
    const result = runBuild(t, args);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Usage: build:android:local/);
    assert.deepEqual(result.commands, []);
  });
}

test("the bounded release still refuses an APK without a Hermes bundle", (t) => {
  const result = runBuild(t, ["--abi", "arm64-v8a"], { BUILD_TEST_BAD_BUNDLE: "1" });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /has no valid Hermes bundle/);
});

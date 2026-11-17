import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

for (const [command, args, refusal] of [
  ["native:metro", ["--env", "production", "--port", "8841"], /does not point a development client at production/],
  ["native:metro", ["--env", "staging"], /--port is required/],
  ["native:ios", ["--port", "8841"], /--udid is required/],
  ["native:ios", ["--udid", "TEST-DEVICE"], /--port is required/],
]) {
  test(`${command} refuses unsafe session selection: ${args.join(" ")}`, () => {
    const result = spawnSync("pnpm", ["--filter", "@auto-tm/mobile", command, "--", ...args], {
      encoding: "utf8",
      env: { ...process.env, CI: "1" },
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stdout + result.stderr, refusal);
  });
}

function nativeFixture(t) {
  const dir = fs.realpathSync(fs.mkdtempSync("/tmp/native-entrypoints-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const mobile = path.join(dir, "apps/mobile");
  fs.mkdirSync(path.join(mobile, "scripts"), { recursive: true });
  const helper = path.join(mobile, "scripts/native-session.mjs");
  fs.copyFileSync(fileURLToPath(new URL("../apps/mobile/scripts/native-session.mjs", import.meta.url)), helper);
  fs.copyFileSync(fileURLToPath(new URL("../apps/mobile/eas.json", import.meta.url)), path.join(mobile, "eas.json"));
  fs.mkdirSync(path.join(mobile, ".expo"));
  const origins = {
    EXPO_PUBLIC_API_URL: "https://api-staging.up.railway.app/api/v1",
    EXPO_PUBLIC_WS_URL: "wss://api-staging.up.railway.app/ws/chat",
    EXPO_PUBLIC_MEDIA_URL: "https://media-staging.up.railway.app",
  };
  fs.writeFileSync(path.join(mobile, ".expo/native-session-8842.json"), JSON.stringify(origins));
  const log = path.join(dir, "commands.jsonl");
  const bin = path.join(dir, "bin");
  fs.mkdirSync(bin);
  const stub = `#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const command = path.basename(process.argv[1]);
const args = process.argv.slice(2);
fs.appendFileSync(${JSON.stringify(log)}, JSON.stringify({ command, args }) + "\\n");
if (command === "pnpm" && args.includes("prebuild")) {
  fs.mkdirSync("ios", { recursive: true });
  fs.writeFileSync("ios/Podfile", "");
  fs.mkdirSync("ios/Carberk.xcworkspace");
}
if (command === "xcrun" && (args[0] !== "simctl" || args[1] !== "install")) process.exit(9);
if (command === "railway") console.log(JSON.stringify({
  RAILWAY_PUBLIC_DOMAIN: "api-staging.up.railway.app", MINIO_PUBLIC_URL: "https://media-staging.up.railway.app",
}));
if (command === "pnpm" && args.includes("start")) setTimeout(() => {}, 300);
`;
  for (const name of ["pnpm", "pod", "xcodebuild", "xcrun", "railway"]) {
    fs.writeFileSync(path.join(bin, name), stub, { mode: 0o755 });
  }
  const preload = path.join(dir, "fetch.mjs");
  fs.writeFileSync(preload, `globalThis.fetch = async () => new Response(${JSON.stringify(Object.values(origins).join(";") + ";packager-status:running")});`);
  return {
    mobile,
    run(args) {
      const result = spawnSync(process.execPath, ["--import", preload, helper, ...args], {
        encoding: "utf8", timeout: 10000,
        env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, RAILWAY_CLI: path.join(bin, "railway") },
      });
      return { ...result, output: result.stdout + result.stderr,
        commands: fs.existsSync(log) ? fs.readFileSync(log, "utf8").trim().split("\n").map(line => JSON.parse(line)) : [] };
    },
  };
}

test("ios builds and installs for the selected device, then hands launch to its bound command", t => {
  const fixture = nativeFixture(t);
  const result = fixture.run(["ios", "--udid", "OWNED-DEVICE", "--port", "8842"]);
  assert.equal(result.status, 0, result.output);
  assert.deepEqual(result.commands.filter(({ command }) => command === "xcrun"), [
    { command: "xcrun", args: ["simctl", "install", "OWNED-DEVICE", path.join(fixture.mobile, "ios/build/Build/Products/Debug-iphonesimulator/Carberk.app")] },
  ]);
  assert.ok(result.commands.some(({ command, args }) => command === "pnpm" && args.join(" ") === "exec expo prebuild -p ios --no-install"));
  assert.ok(result.commands.some(({ command, args }) => command === "pod" && args.join(" ") === "install"));
  assert.ok(result.commands.some(({ command, args }) => command === "xcodebuild" && args.includes("id=OWNED-DEVICE")));
  assert.match(result.output, /tm\.auto\.app installed on OWNED-DEVICE/);
  assert.match(result.output, /<agent-device> open tm\.auto\.app --relaunch --metro-port 8842/);
  assert.doesNotMatch(result.output, /pointed at Metro|simctl (boot|launch|terminate)/);
});

test("Metro readiness advises build/install and bound device launch without a simctl bypass", async t => {
  const fixture = nativeFixture(t);
  const listener = net.createServer();
  await new Promise(resolve => listener.listen(0, resolve));
  const { port } = listener.address();
  await new Promise(resolve => listener.close(resolve));
  const result = fixture.run(["metro", "--env", "staging", "--port", String(port)]);
  assert.equal(result.status, 0, result.output);
  assert.match(result.output, /OK: Metro serves staging/);
  assert.match(result.output, /Build\/install the dev client: pnpm --filter @auto-tm\/mobile native:ios/);
  assert.ok(result.output.includes(`<agent-device> open tm.auto.app --relaunch --metro-port ${port}`));
  assert.doesNotMatch(result.output, /simctl (boot|launch|terminate)|Launch the dev client: pnpm/);
  assert.deepEqual(result.commands.filter(({ command }) => ["xcrun", "xcodebuild", "pod"].includes(command)), []);
});

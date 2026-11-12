#!/usr/bin/env node

import { parseEnv } from "node:util";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { pathToFileURL } from "node:url";

class FixtureError extends Error {}

const FIXTURES = {
  seller: { phone: "+99361000001", name: "Aýgül Amanowa", masked: "+993 61 XX-XX-01" },
  buyer: { phone: "+99361000009", name: "Öwez Berdiýew", masked: "+993 61 XX-XX-09" },
};

function codeFor(log, requestId, fixture, requestedAt, now) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestId ?? "") ||
      !Number.isFinite(requestedAt) || now - requestedAt < 0 || now - requestedAt >= 240_000) {
    throw new FixtureError("Missing or stale request context; stop without resending");
  }
  const entries = log.replace(/\x1b\[[0-9;]*m/g, "").split("\n").flatMap(line => {
    const match = line.match(/\[mock\] OTP for \*\*\*(\d{4}) \(req ([0-9a-f]{8})\): (\d{6})/);
    if (!match) return [];
    const stamp = line.match(/\d{4}-\d\d-\d\dT[\d:.]+Z/)?.[0] ??
      line.match(/\d{1,2}\/\d{1,2}\/\d{4}, \d{1,2}:\d\d:\d\d (?:AM|PM)/)?.[0];
    let time = Date.parse(stamp);
    if (line.startsWith("{")) {
      try {
        const structured = JSON.parse(line);
        time = typeof structured.time === "number" ? structured.time : Date.parse(structured.time);
      } catch { /* malformed lines remain undated and fail closed */ }
    }
    return [{ suffix: match[1], tag: match[2], code: match[3], time }];
  });
  const matches = entries.filter(entry => entry.tag === requestId.slice(0, 8));
  if (matches.length !== 1) throw new FixtureError("Mock code missing or ambiguous for request; stop without resending");
  const entry = matches[0];
  if (entry.suffix !== fixture.phone.slice(-4) || !Number.isFinite(entry.time) ||
      Math.abs(entry.time - requestedAt) > 5000 || now - entry.time >= 240_000 || entry.time > now + 1000 ||
      entries.slice(entries.indexOf(entry) + 1).some(other => other.suffix === entry.suffix)) {
    throw new FixtureError("Mock code is unrelated, stale or superseded; stop without resending");
  }
  return entry.code;
}

function localApi(value) {
  let url;
  try { url = new URL(value); } catch { throw new FixtureError("Use an explicit loopback API URL ending in /api/v1"); }
  if (url.protocol !== "http:" || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
      url.username || url.password || url.search || url.hash || url.pathname !== "/api/v1") {
    throw new FixtureError("Use an explicit http loopback API URL ending in /api/v1");
  }
  // Pin localhost instead of trusting name resolution or following redirects.
  if (url.hostname === "localhost") url.hostname = "127.0.0.1";
  return url;
}

async function run(options, ports) {
  const api = localApi(options.api);
  const fixture = FIXTURES[options.fixture];
  if (!fixture) throw new FixtureError("Choose --fixture seller or buyer");
  const env = parseEnv(await ports.readFile(options.apiEnv, "utf8"));
  if (!["development", "test"].includes(env.APP_ENV) || !["development", "test"].includes(env.NODE_ENV) ||
      env.SMS_DRIVER !== "mock" || env.OTP_TEST_MODE !== "false" || env.OTP_TEST_CODE_RESPONSE !== "false" ||
      (env.PORT ?? "3006") !== (api.port || "80")) {
    throw new FixtureError("API config must match the port and use mock development/test with CI OTP flags disabled");
  }
  const health = await ports.fetch(new URL("/healthz", api), { redirect: "error", signal: AbortSignal.timeout(5000) });
  if (!health.ok) throw new FixtureError("Local API health check failed");
  const metadata = await health.json();
  if (metadata.service !== "api" || metadata.environment !== env.APP_ENV) throw new FixtureError("Running API environment does not match local config");
  await ports.device(["open", "tm.auto.app"]);
  await ports.device(["open", "autotm:///services"]);
  const cabinet = await ports.device(["snapshot", "-i"]);
  const snapshot = JSON.stringify(cabinet);
  if (snapshot.includes(fixture.name) && snapshot.includes(fixture.masked)) {
    return { fixture: options.fixture, status: "reused", identityConfirmed: true };
  }
  if (options.reuseOnly) throw new FixtureError("Expected fixture session unavailable; reuse-only spent no code");
  if (!(cabinet.nodes ?? []).some(node => ["Sign in", "Войти", "Giriş"].includes(node.label?.split(", ")[0]))) {
    throw new FixtureError("Expected fixture identity not confirmed in app; stop without switching accounts");
  }
  let requestId = options.requestId;
  let requestedAt = Date.parse(options.requestedAt);
  let resendInSeconds = 60;
  if (!requestId) {
    requestedAt = ports.now();
    const response = await ports.fetch(`${api}/auth/otp/request`, {
      method: "POST", redirect: "error", signal: AbortSignal.timeout(5000),
      headers: { "content-type": "application/json" }, body: JSON.stringify({ phone: fixture.phone }),
    });
    if (response.status === 429) throw new FixtureError("RATE_LIMITED: stop and wait; no resend or quota reset");
    if (!response.ok) throw new FixtureError("OTP request refused; stop without resending");
    const body = await response.json();
    if (body.code === "RATE_LIMITED") throw new FixtureError("RATE_LIMITED: stop and wait; no resend or quota reset");
    if (body.testCode !== undefined) throw new FixtureError("CI OTP response mode detected; stop");
    requestId = body.requestId;
    resendInSeconds = body.resendInSeconds;
    if (!Number.isInteger(resendInSeconds) || resendInSeconds < 0) throw new FixtureError("Invalid OTP request metadata; stop without resending");
  }
  codeFor(await ports.readFile(options.apiLog, "utf8"), requestId, fixture, requestedAt, ports.now());
  const route = new URL("autotm:///otp");
  route.search = new URLSearchParams({ method: "phone", destination: fixture.phone, resendInSeconds: String(resendInSeconds) }).toString();
  await ports.device(["open", route.href]);
  const otp = await ports.device(["snapshot", "-i"]);
  const fields = (otp.nodes ?? []).filter(node => node.editable === true || /text.?field|edittext/i.test(node.type ?? node.role ?? ""));
  if (fields.length !== 1 || !/^e\d+$/.test(fields[0].ref ?? "")) throw new FixtureError("OTP UI must expose one current editable field; stop without resending");
  const code = codeFor(await ports.readFile(options.apiLog, "utf8"), requestId, fixture, requestedAt, ports.now());
  await ports.device(["fill", `@${fields[0].ref}`, "--text-stdin"], { input: code });
  // Verification is asynchronous. Read fresh snapshots; never re-enter or resend.
  let leftOtp = false;
  for (let attempt = 0; attempt < 10; attempt++) {
    const state = await ports.device(["snapshot", "-i"]);
    if (!(state.nodes ?? []).some(node => node.editable === true || /text.?field|edittext/i.test(node.type ?? node.role ?? ""))) {
      leftOtp = true;
      break;
    }
    await ports.sleep(500);
  }
  if (!leftOtp) throw new FixtureError("OTP UI verification did not complete; stop without resending");
  await ports.device(["open", "autotm:///services"]);
  const identity = JSON.stringify(await ports.device(["snapshot", "-i"]));
  if (!identity.includes(fixture.name) || !identity.includes(fixture.masked)) throw new FixtureError("OTP UI did not confirm the expected fixture identity; stop without resending");
  return { fixture: options.fixture, status: "signed-in", identityConfirmed: true };
}

export async function signInFixture(options, ports) {
  try { return await run(options, ports); }
  catch (error) {
    if (error instanceof FixtureError) throw error;
    throw new FixtureError("Local fixture setup failed at a boundary; raw diagnostics suppressed. Stop without resending.");
  }
}

function execute(executable, args, { input, ...options }) {
  return new Promise((resolve, reject) => {
    const child = execFile(executable, args, options, (error, stdout, stderr) => {
      if (error) reject(Object.assign(error, { stdout }));
      else resolve({ stdout, stderr });
    });
    child.stdin.on("error", () => { /* execFile reports the process failure */ });
    child.stdin.end(input);
  });
}

// device_open returns a wrapper already pinned to the caller's target/session.
// Never add target overrides or invoke the underlying global agent-device CLI.
export function callerDevice(receipt, { cwd = process.cwd(), executeFile = execute } = {}) {
  const { command, session, deviceId, worktree } = receipt;
  if (worktree !== cwd || !Array.isArray(command) || command.length !== 1 ||
      !isAbsolute(command[0] ?? "") || !/^[a-zA-Z0-9_-]+$/.test(session ?? "") || !deviceId ||
      !command[0].endsWith(`/device/targets/${session}/agent-device`)) {
    throw new FixtureError("Use this worktree's exact device_open command, session and device ID");
  }
  return async (args, { input } = {}) => {
    try {
      const { stdout } = await executeFile(command[0], [...command.slice(1), ...args, "--json", "--no-record"], {
        cwd, input, timeout: 60_000, maxBuffer: 4 * 1024 * 1024,
      });
      const response = JSON.parse(stdout);
      if (response.success !== true) {
        const code = response.error?.code;
        throw new FixtureError(`Device command refused${/^[A-Z_]{2,50}$/.test(code ?? "") ? ` (${code})` : ""}; stop and consult help on your own session`);
      }
      if (args[0] === "open" && args[1] === "tm.auto.app" &&
          (response.data?.session !== session || response.data?.id !== deviceId)) {
        throw new FixtureError("Device response ownership/context mismatch; stop");
      }
      return response.data;
    } catch (error) {
      if (error instanceof FixtureError) throw error;
      // execFile errors include argv (the code) and stdout; neither may escape.
      let code;
      try { code = JSON.parse(error.stdout).error?.code; } catch { /* no safe structured status */ }
      throw new FixtureError(`Device command failed${/^[A-Z_]{2,50}$/.test(code ?? "") ? ` (${code})` : ""}; raw diagnostics suppressed. Stop and consult help on your own session`);
    }
  };
}

const HELP = `Usage: pnpm native:signin --fixture seller|buyer --api http://127.0.0.1:3006/api/v1
  --api-env /absolute/path/to/running-api/.env --api-log /tmp/that-api.log
  --device-command-file /tmp/owned-device.json
  [--reuse-only] [--request-id UUID --requested-at ISO_TIMESTAMP]
See docs/agents/native-fixture-signin.md. No code is printed or saved.`;

export async function cli(argv, { out = console.log, err = console.error, ...ports } = {}) {
  try {
    if (argv.includes("--help")) { out(HELP); return 0; }
    const options = {};
    const names = { "--fixture": "fixture", "--api": "api", "--api-env": "apiEnv", "--api-log": "apiLog", "--device-command-file": "deviceFile", "--request-id": "requestId", "--requested-at": "requestedAt" };
    for (let i = 0; i < argv.length; i++) {
      if (argv[i] === "--") continue;
      if (argv[i] === "--reuse-only") { options.reuseOnly = true; continue; }
      const name = names[argv[i]];
      if (!name || options[name] !== undefined || !argv[i + 1] || argv[i + 1].startsWith("--")) throw new FixtureError("Invalid arguments; use --help");
      options[name] = argv[++i];
    }
    localApi(options.api);
    if (!options.fixture || ![options.apiEnv, options.apiLog, options.deviceFile].every(value => value && isAbsolute(value)) ||
        Boolean(options.requestId) !== Boolean(options.requestedAt)) throw new FixtureError("Missing fixture, absolute input paths or paired existing-request context; use --help");
    const read = ports.readFile ?? readFile;
    const device = callerDevice(JSON.parse(await read(options.deviceFile, "utf8")), ports);
    const result = await signInFixture(options, {
      readFile: read, fetch: ports.fetch ?? fetch, device, now: ports.now ?? Date.now,
      sleep: ports.sleep ?? (ms => new Promise(done => setTimeout(done, ms))),
    });
    out(JSON.stringify(result));
    return 0;
  } catch (error) {
    err(error instanceof FixtureError ? error.message : "Local fixture setup failed; raw diagnostics suppressed. Stop without resending.");
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) process.exitCode = await cli(process.argv.slice(2));

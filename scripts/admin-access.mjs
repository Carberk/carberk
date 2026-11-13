#!/usr/bin/env node
import { parseEnv, promisify } from "node:util";
import { execFile, spawn } from "node:child_process";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { connect } from "node:net";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { FixtureError, codeFor, localApi } from "./local-signin.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const executeFile = promisify(execFile);
const HELP = `Usage: pnpm admin:access check|serve|otp|totp --api http://127.0.0.1:3006/api/v1
  --admin http://127.0.0.1:3001 --api-env /absolute/running-api.env
  otp:  --phone <existing-local-admin> --api-log /absolute/private-api.log
        --request-id UUID --requested-at ISO_TIMESTAMP
  totp: --phone <existing-local-admin>
check is read-only; serve starts only your foreground Admin process with these origins.
otp/totp write a new private temporary code file. No sign-in request, promotion,
quota reset, session injection or remote targets. See docs/agents/admin-access.md.`;

function argumentsFor(argv) {
  const options = { command: argv[0] };
  const names = { "--api": "api", "--admin": "admin", "--api-env": "apiEnv", "--phone": "phone", "--api-log": "apiLog", "--request-id": "requestId", "--requested-at": "requestedAt" };
  for (let i = 1; i < argv.length; i++) {
    const key = names[argv[i]];
    if (!key || options[key] !== undefined || !argv[i + 1] || argv[i + 1].startsWith("--")) throw new FixtureError("Invalid arguments; use --help");
    options[key] = argv[++i];
  }
  if (!["check", "serve", "otp", "totp"].includes(options.command)) throw new FixtureError("Choose check, serve, otp or totp; use --help");
  if (!isAbsolute(options.apiEnv ?? "")) throw new FixtureError("Use an absolute selected API env path; use --help");
  if (["otp", "totp"].includes(options.command) && !/^\+993\d{8}$/.test(options.phone ?? "")) throw new FixtureError("Use an existing local admin phone; use --help");
  if (options.command === "otp" && (!isAbsolute(options.apiLog ?? "") || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(options.requestId ?? "") || !Number.isFinite(Date.parse(options.requestedAt)))) throw new FixtureError("OTP needs an absolute log path and exact request ID/time from the current browser form");
  return options;
}

function adminOrigin(value) {
  let url;
  try { url = new URL(value); } catch { throw new FixtureError("Use an explicit http loopback Admin origin with no path"); }
  if (url.protocol !== "http:" || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || url.origin !== value || url.username || url.password) throw new FixtureError("Use an explicit http loopback Admin origin with no path");
  return url;
}

function localConfig(env, api) {
  if (!["development", "test"].includes(env.APP_ENV) || !["development", "test"].includes(env.NODE_ENV) || env.SMS_DRIVER !== "mock" || env.OTP_TEST_MODE !== "false" || env.OTP_TEST_CODE_RESPONSE !== "false" || (env.PORT ?? "3006") !== (api.port || "80")) throw new FixtureError("Selected API env must match the port and use development/test, mock SMS and disabled CI code bypasses");
  let db;
  try { db = new URL(env.DATABASE_URL); } catch { throw new FixtureError("Selected API env needs an explicit local PostgreSQL target"); }
  if (db.href !== env.DATABASE_URL || !["postgres:", "postgresql:"].includes(db.protocol) || !["localhost", "127.0.0.1", "[::1]"].includes(db.hostname) || db.search || db.hash) throw new FixtureError("Refusing a nonlocal or overridden database target");
}

async function health(url, service, ports, environment) {
  let result;
  try {
    const response = await ports.fetch(new URL("/healthz", url), { redirect: "error", signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error();
    result = await response.json();
  } catch { throw new FixtureError(`${service.toUpperCase()}_UNREACHABLE: check the selected origin and owned process; no service was started`); }
  if (result.service !== service || !["development", "test"].includes(result.environment) || (environment && result.environment !== environment)) throw new FixtureError(`${service.toUpperCase()}_TARGET_MISMATCH: running service does not match the selected local environment`);
}

async function serve(api, admin, ports) {
  const args = ["--filter", "@auto-tm/admin", "exec", "next", "dev", "--hostname", admin.hostname === "[::1]" ? "::1" : "127.0.0.1", "--port", admin.port || "80"];
  const child = ports.spawn("pnpm", args, { cwd: ROOT, stdio: "inherit", env: {
    ...process.env, NODE_ENV: "development", API_BASE_URL: api.href,
    ADMIN_ORIGIN: admin.origin, PORT: admin.port || "80",
  } });
  const stop = () => child.kill("SIGTERM");
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  try {
    return await new Promise((resolveExit, reject) => {
      child.once("error", reject);
      child.once("exit", (code, signal) => resolveExit(signal ? 1 : code ?? 1));
    });
  } finally {
    process.removeListener("SIGINT", stop);
    process.removeListener("SIGTERM", stop);
  }
}

async function requireFreePort(admin) {
  await new Promise((done, fail) => {
    const socket = connect({ host: admin.hostname === "[::1]" ? "::1" : "127.0.0.1", port: Number(admin.port || "80") });
    socket.setTimeout(1500);
    socket.once("connect", () => { socket.destroy(); fail(new FixtureError("PORT_IN_USE: preserve the existing owner; choose a different Admin origin/port")); });
    socket.once("timeout", () => { socket.destroy(); fail(new FixtureError("PORT_STATE_UNKNOWN: cannot safely start Admin on the selected port")); });
    socket.once("error", error => { socket.destroy(); if (error.code === "ECONNREFUSED") done(); else fail(new FixtureError("PORT_STATE_UNKNOWN: check the selected loopback listener")); });
  });
}

async function saveCode(code, kind, expiresAt, ports) {
  const directory = await mkdtemp(join(ports.tempRoot ?? "/tmp", "carberk-admin-code-"));
  const codeFile = join(directory, "code");
  try { await writeFile(codeFile, code, { mode: 0o600, flag: "wx" }); }
  catch { await rm(directory, { recursive: true, force: true }); throw new FixtureError("Private code file could not be written"); }
  return { kind, codeFile, directory, expiresAt: new Date(expiresAt).toISOString(), next: "Fill the existing browser challenge without printing this file; remove the directory after use." };
}

export async function cli(argv, overrides = {}) {
  const { out = console.log, err = console.error } = overrides;
  const ports = { readFile, fetch, now: Date.now, execFile: executeFile, spawn, ...overrides };
  try {
    if (argv.includes("--help")) { out(HELP); return 0; }
    const options = argumentsFor(argv), api = localApi(options.api);
    const admin = adminOrigin(options.admin);
    const env = parseEnv(await ports.readFile(options.apiEnv, "utf8"));
    localConfig(env, api);
    await health(api, "api", ports, env.APP_ENV);
    if (options.command === "check") {
      const readiness = await ports.fetch(new URL("/readyz", api), { redirect: "error", signal: AbortSignal.timeout(5000) });
      if (!readiness.ok) throw new FixtureError("API_NOT_READY: selected API dependencies are unavailable; coordinate setup with its owner");
      await health(admin, "admin", ports);
      out(JSON.stringify({ status: "ready", api: api.href, admin: admin.origin, loginUrl: `${admin.origin}/login`, session: "Verify and reuse the existing browser identity first; no code requested." }));
      return 0;
    }
    if (options.command === "serve") {
      await requireFreePort(admin);
      out(JSON.stringify({ status: "starting-owned-admin", admin: admin.origin, api: api.href, loginUrl: `${admin.origin}/login`, worktree: ROOT, next: "Keep this owned process running. Stop only this invocation with Ctrl-C; an occupied port is not permission to stop its owner." }));
      return await serve(api, admin, ports);
    }
    if (options.command === "totp") {
      if (!env.TOTP_SECRET_ENCRYPTION_KEY) throw new FixtureError("TOTP_KEY_MISSING: use the effective env file of the selected local API");
      const expiresAt = (Math.floor(ports.now() / 30_000) + 1) * 30_000;
      let result;
      try {
        result = await ports.execFile("pnpm", ["-s", "--filter", "@auto-tm/db", "admin:totp", "--phone", options.phone], {
          cwd: ROOT, timeout: 10_000, maxBuffer: 64 * 1024,
          env: { ...process.env, DATABASE_URL: env.DATABASE_URL, TOTP_SECRET_ENCRYPTION_KEY: env.TOTP_SECRET_ENCRYPTION_KEY },
        });
      } catch { throw new FixtureError("TOTP_UNAVAILABLE: check local admin existence/role, compiled DB package, selected key and pending authenticator enrollment; raw diagnostics suppressed"); }
      const code = result.stdout.trim();
      if (!/^\d{6}$/.test(code)) throw new FixtureError("TOTP_INVALID_RESULT: helper output was not a code; raw diagnostics suppressed");
      if (expiresAt - ports.now() < 5000) throw new FixtureError("TOTP_WINDOW_ENDING: wait for the next 30-second window, then run totp again; no file saved");
      out(JSON.stringify(await saveCode(code, "totp", expiresAt, ports)));
      return 0;
    }
    const requestedAt = Date.parse(options.requestedAt);
    const code = codeFor(await ports.readFile(options.apiLog, "utf8"), options.requestId, { phone: options.phone }, requestedAt, ports.now());
    out(JSON.stringify(await saveCode(code, "otp", requestedAt + 240_000, ports)));
    return 0;
  } catch (error) {
    err(error instanceof FixtureError ? error.message : "Local Admin preparation failed; raw diagnostics suppressed. Check explicit input files and use --help.");
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) process.exitCode = await cli(process.argv.slice(2));

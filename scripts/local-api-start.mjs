#!/usr/bin/env node
import { spawn } from "node:child_process";
import { chmod, mkdtemp, open } from "node:fs/promises";
import { connect } from "node:net";
import { dirname, join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const HELP = "Usage: node scripts/local-api-start.mjs --port <1-65535>. Starts only your foreground API; logs remain in a private session directory. Stop this invocation with Ctrl-C.";

class Refusal extends Error {}

async function requireFreePort(port) {
  for (const host of ["127.0.0.1", "::1"]) {
    await new Promise((done, fail) => {
      const socket = connect({ host, port });
      socket.setTimeout(1500);
      socket.once("connect", () => {
        socket.destroy();
        fail(new Refusal("PORT_IN_USE: preserve the existing owner; choose a different API port."));
      });
      socket.once("timeout", () => {
        socket.destroy();
        fail(new Refusal("PORT_STATE_UNKNOWN: cannot safely start on the selected API port."));
      });
      socket.once("error", error => {
        socket.destroy();
        if (error.code === "ECONNREFUSED" || host === "::1" && ["EAFNOSUPPORT", "EADDRNOTAVAIL"].includes(error.code)) done();
        else fail(new Refusal("PORT_STATE_UNKNOWN: check the selected loopback listener."));
      });
    });
  }
}

async function main(argv) {
  if (argv.length === 1 && argv[0] === "--help") {
    console.log(HELP);
    return 0;
  }
  if (argv.length !== 2 || argv[0] !== "--port" || !/^[1-9]\d{0,4}$/.test(argv[1]) || Number(argv[1]) > 65535) {
    console.error("Invalid arguments; use --help.");
    return 1;
  }
  const port = Number(argv[1]);
  await requireFreePort(port);
  const directory = await mkdtemp("/tmp/carberk-api-");
  await chmod(directory, 0o700);
  const logFile = join(directory, "api.log");
  const log = await open(logFile, "wx", 0o600);
  try {
    await log.chmod(0o600);
    const child = spawn("pnpm", ["--filter", "@auto-tm/api", "dev"], {
      cwd: ROOT, detached: true,
      env: { ...process.env, PORT: String(port), LISTING_VIDEO_API_ORIGIN: `http://localhost:${port}` },
      stdio: ["ignore", log.fd, log.fd],
    });
    const closed = new Promise(done => child.once("close", done));
    const exited = new Promise(done => {
      child.once("error", () => done(1));
      child.once("exit", (code, signal) => done(signal ? 1 : code ?? 1));
    });
    let interrupted = 0, stopping;
    const group = signal => {
      if (!child.pid) return false;
      try { process.kill(-child.pid, signal); return true; }
      catch (error) { if (error.code === "ESRCH") return false; throw error; }
    };
    const stop = () => stopping ??= (async () => {
      if (!group("SIGTERM")) return;
      for (let i = 0; i < 40; i++) {
        await delay(25);
        if (!group(0)) return;
      }
      group("SIGKILL");
      for (let i = 0; i < 40; i++) {
        await delay(25);
        if (!group(0)) return;
      }
      throw new Refusal("OWNED_SHUTDOWN_INCOMPLETE: inspect the reported process group; preserve other sessions.");
    })();
    const interrupt = code => { interrupted = code; void stop().catch(() => {}); };
    const onInt = () => interrupt(130), onTerm = () => interrupt(143);
    process.on("SIGINT", onInt);
    process.on("SIGTERM", onTerm);
    child.once("spawn", () => {
      console.log(JSON.stringify({ status: "starting-owned-api", directory, logFile, pid: process.pid, processGroup: child.pid, port, worktree: ROOT }));
    });
    try {
      const code = await exited;
      await stop();
      await closed;
      return interrupted || code;
    } finally {
      try { await stop(); }
      finally {
        process.removeListener("SIGINT", onInt);
        process.removeListener("SIGTERM", onTerm);
      }
    }
  } finally {
    await log.close();
  }
}

try { process.exitCode = await main(process.argv.slice(2)); }
catch (error) {
  console.error(error instanceof Refusal ? error.message : "Owned API startup failed; raw diagnostics suppressed. Use --help and inspect the private session log if reported.");
  process.exitCode = 1;
}

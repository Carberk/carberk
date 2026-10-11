#!/usr/bin/env node
/** Guard staging/PR Metro sessions and build a local Debug simulator client. */
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import net from "node:net";

const mobileRoot = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(mobileRoot, "../..");
const iosDir = path.join(mobileRoot, "ios");

export const RAILWAY_PROJECT_ID = "176ddec0-dd65-4087-b82c-798599fc2ebe";
export const BUNDLE_ID = "tm.auto.app";
export const LOCAL_SIMULATOR_IOS = "16.0";

/** `--env staging` or `--env pr-<N>` (or the full Railway name) to a Railway environment name. */
export function railwayEnvironmentName(value) {
  if (!value) throw new Error("--env is required: staging or pr-<number>");
  if (/^production/i.test(value)) {
    throw new Error("native:metro does not point a development client at production");
  }
  if (value === "staging") return "staging";
  const pr = /^(?:pr-|auto\.tm-rewrite-pr-)(\d+)$/.exec(value);
  if (pr) return `auto.tm-rewrite-pr-${pr[1]}`;
  throw new Error(`Unknown --env "${value}": use staging or pr-<number>`);
}

/** The EXPO_PUBLIC_* values for Metro, from the api service's variables and eas.json. */
export function expoPublicEnv(apiVariables, easJson) {
  const domain = apiVariables.RAILWAY_PUBLIC_DOMAIN;
  const media = apiVariables.MINIO_PUBLIC_URL;
  if (!domain || !/^[a-z0-9.-]+$/i.test(domain)) throw new Error("The api service has no RAILWAY_PUBLIC_DOMAIN in this environment");
  if (!media || !/^https:\/\//.test(media)) {
    throw new Error("The api service has no https MINIO_PUBLIC_URL in this environment; photos would not load");
  }
  const mediaUrl = new URL(media);
  if (mediaUrl.username || mediaUrl.password || mediaUrl.search || mediaUrl.hash || mediaUrl.hostname.endsWith(".internal")) {
    throw new Error("The api service must have a public, credential-free MINIO_PUBLIC_URL");
  }
  const staticEnv = Object.fromEntries(
    Object.entries({ ...easJson.build.base.env, ...easJson.build.staging.env }).filter(([key]) =>
      key.startsWith("EXPO_PUBLIC_"),
    ),
  );
  return {
    ...staticEnv,
    EXPO_PUBLIC_ENV: "staging",
    EXPO_PUBLIC_API_URL: `https://${domain}/api/v1`,
    EXPO_PUBLIC_WS_URL: `wss://${domain}/ws/chat`,
    EXPO_PUBLIC_MEDIA_URL: media.replace(/\/$/, ""),
  };
}

/** The runtime origins a served bundle must carry; returns the names of the missing ones. */
export function missingFromBundle(bundle, env) {
  return ["EXPO_PUBLIC_API_URL", "EXPO_PUBLIC_WS_URL", "EXPO_PUBLIC_MEDIA_URL"].filter(
    (name) => !bundle.includes(env[name]),
  );
}

export function parseArgs(argv) {
  const [command, ...rest] = argv.filter((arg) => arg !== "--");
  const options = { command };
  for (let index = 0; index < rest.length; index += 1) {
    const flag = rest[index];
    const value = rest[index + 1];
    if (!["--env", "--udid", "--port"].includes(flag)) throw new Error(`Unknown option ${flag}`);
    if (!value || value.startsWith("--")) throw new Error(`Missing value for ${flag}`);
    if (flag === "--env") options.env = value;
    else if (flag === "--udid") options.udid = value;
    else if (flag === "--port") options.port = Number(value);
    index += 1;
  }
  if (command === "ios" && !options.udid) throw new Error("--udid is required (xcrun simctl list devices available)");
  if (options.port === undefined) throw new Error("--port is required; select a port that belongs to this session");
  if (!Number.isInteger(options.port) || options.port <= 0 || options.port > 65535) throw new Error("--port must be a number from 1 to 65535");
  return options;
}

const UTF8 = { LANG: "en_US.UTF-8", LC_ALL: "en_US.UTF-8" };

function run(label, command, args, { cwd = mobileRoot, env = process.env } = {}) {
  console.log(`\n==> ${label}`);
  execFileSync(command, args, { cwd, env, stdio: "inherit" });
}

async function reachable(target) {
  try {
    const response = await fetch(target, { method: "GET", signal: AbortSignal.timeout(15000) });
    return response.status;
  } catch {
    return 0;
  }
}

async function waitForMetro(port, child) {
  for (let attempt = 0; attempt < 180; attempt += 1) {
    if (child.exitCode !== null) throw new Error("Metro exited before it was ready");
    try {
      const status = await (await fetch(`http://127.0.0.1:${port}/status`, { signal: AbortSignal.timeout(2000) })).text();
      if (status.includes("running")) return;
    } catch {
      // not listening yet
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error("Metro did not report running within 3 minutes");
}

async function metro({ env: target, port }) {
  const environment = railwayEnvironmentName(target);
  console.log(`==> Resolve ${environment} from Railway (api service)`);
  let raw;
  try {
    raw = execFileSync(
      process.env.RAILWAY_CLI ?? "railway",
      ["variables", "-p", RAILWAY_PROJECT_ID, "-e", environment, "-s", "api", "--json"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
  } catch {
    throw new Error("Railway variable lookup failed; use a logged-in CLI supporting variables --project, optionally via RAILWAY_CLI");
  }
  const easJson = JSON.parse(fs.readFileSync(path.join(mobileRoot, "eas.json"), "utf8"));
  let apiVariables;
  try { apiVariables = JSON.parse(raw); } catch { throw new Error("Railway returned invalid variable JSON"); }
  const publicEnv = expoPublicEnv(apiVariables, easJson);
  for (const name of ["EXPO_PUBLIC_API_URL", "EXPO_PUBLIC_WS_URL", "EXPO_PUBLIC_MEDIA_URL", "EXPO_PUBLIC_ENV"]) {
    console.log(`    ${name}=${publicEnv[name]}`);
  }

  const apiOrigin = publicEnv.EXPO_PUBLIC_API_URL.replace(/\/api\/v1$/, "");
  const ready = await reachable(`${apiOrigin}/readyz`);
  if (ready !== 200) throw new Error(`${apiOrigin}/readyz answered ${ready || "nothing"}; is the API deployed?`);
  const media = await reachable(publicEnv.EXPO_PUBLIC_MEDIA_URL);
  if (media === 0 || media >= 500) throw new Error(`Media host ${publicEnv.EXPO_PUBLIC_MEDIA_URL} is unreachable`);
  console.log(`    readyz 200, media host answers ${media}`);

  await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", () => reject(new Error(`Port ${port} is occupied or unavailable; leave its process running and select another port`)));
    server.listen(port, () => server.close(resolve));
  });

  run("Rebuild @auto-tm/contracts dist (Metro resolves it)", "pnpm", ["--filter", "@auto-tm/contracts", "build"], {
    cwd: repoRoot,
  });

  console.log(`\n==> Start Metro on port ${port} (--dev-client --clear)`);
  const child = spawn("pnpm", ["exec", "expo", "start", "--dev-client", "--clear", "--port", String(port)], {
    cwd: mobileRoot,
    env: { ...process.env, ...publicEnv, CI: "1", EXPO_NO_DOTENV: "1" },
    detached: process.platform !== "win32",
    stdio: "inherit",
  });
  const stop = () => {
    if (child.exitCode !== null) return;
    try {
      if (process.platform === "win32") child.kill("SIGINT");
      else process.kill(-child.pid, "SIGINT");
    } catch { /* already stopped */ }
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);

  try {
    await waitForMetro(port, child);
    const bundleUrl = `http://127.0.0.1:${port}/.expo/.virtual-metro-entry.bundle?platform=ios&dev=true&minify=false`;
    const response = await fetch(bundleUrl, { signal: AbortSignal.timeout(180000) });
    if (!response.ok) throw new Error(`Metro bundle answered ${response.status}`);
    const bundle = await response.text();
    const missing = missingFromBundle(bundle, publicEnv);
    if (missing.length > 0) {
      throw new Error(`The served bundle lacks ${missing.join(", ")}`);
    }
    fs.mkdirSync(path.join(mobileRoot, ".expo"), { recursive: true });
    fs.writeFileSync(path.join(mobileRoot, ".expo", `native-session-${port}.json`), JSON.stringify(publicEnv));
    console.log(
      `\nOK: Metro serves ${environment} (API, socket and media origins are in the bundle).\n` +
        `    Launch the dev client: pnpm --filter @auto-tm/mobile native:ios -- --udid <SIMULATOR_UUID> --port ${port}\n` +
        `    Or, already installed: xcrun simctl launch <SIMULATOR_UUID> ${BUNDLE_ID} -RCT_jsLocation 127.0.0.1:${port}\n` +
        "    Restart this command after editing tailwind.config.js: NativeWind's watcher crashes Metro on that change.",
    );
  } catch (error) {
    stop();
    throw error;
  }
}

async function ios({ udid, port }) {
  if (!udid) throw new Error("--udid is required (xcrun simctl list devices available)");
  const receipt = path.join(mobileRoot, ".expo", `native-session-${port}.json`);
  if (!fs.existsSync(receipt)) throw new Error("Start native:metro in this worktree on the selected port before installing a client");
  const publicEnv = JSON.parse(fs.readFileSync(receipt, "utf8"));
  const response = await fetch(`http://127.0.0.1:${port}/.expo/.virtual-metro-entry.bundle?platform=ios&dev=true&minify=false`, {
    signal: AbortSignal.timeout(180000),
  });
  if (!response.ok || missingFromBundle(await response.text(), publicEnv).length) {
    throw new Error("The selected Metro bundle does not match this guarded session");
  }
  const env = { ...process.env, ...UTF8 };

  if (!fs.existsSync(path.join(iosDir, "Podfile"))) {
    run("ios/ missing: expo prebuild -p ios --no-install", "pnpm", ["exec", "expo", "prebuild", "-p", "ios", "--no-install"], { env });
  }
  run("pod install (UTF-8 locale)", "pod", ["install"], { cwd: iosDir, env });

  const workspace = fs.readdirSync(iosDir).find((entry) => entry.endsWith(".xcworkspace"));
  if (!workspace) throw new Error("pod install produced no .xcworkspace");
  const scheme = workspace.replace(/\.xcworkspace$/, "");
  run(`xcodebuild ${scheme} (Debug, simulator ${udid})`, "xcodebuild", [
    "-workspace", workspace, "-scheme", scheme, "-configuration", "Debug", "-sdk", "iphonesimulator",
    "-destination", `id=${udid}`, "-derivedDataPath", "build", "-quiet", "build",
    `IPHONEOS_DEPLOYMENT_TARGET=${LOCAL_SIMULATOR_IOS}`,
  ], { cwd: iosDir, env });

  const appPath = path.join(iosDir, "build/Build/Products/Debug-iphonesimulator", `${scheme}.app`);
  try {
    execFileSync("xcrun", ["simctl", "boot", udid], { stdio: "ignore" });
  } catch {
    // already booted
  }
  run("Install on the simulator", "xcrun", ["simctl", "install", udid, appPath]);
  try {
    execFileSync("xcrun", ["simctl", "terminate", udid, BUNDLE_ID], { stdio: "ignore" });
  } catch {
    // not running
  }
  run(`Launch against Metro on 127.0.0.1:${port}`, "xcrun", [
    "simctl", "launch", udid, BUNDLE_ID, "-RCT_jsLocation", `127.0.0.1:${port}`,
  ]);
  console.log(`\nOK: ${BUNDLE_ID} installed on ${udid} and pointed at Metro on port ${port}.`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.command === "metro") return metro(options);
  if (options.command === "ios") return ios(options);
  throw new Error("Usage: native-session.mjs metro --env <staging|pr-N> --port N | ios --udid <UUID> --port N");
}

if (process.argv[1] && path.resolve(process.argv[1]) === url.fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`\nFAIL: ${error.message}`);
    process.exit(1);
  });
}

#!/usr/bin/env node
/**
 * Local Android release build, guarded against the three staleness traps that
 * a plain `./gradlew assembleRelease` walks into:
 *
 * 1. Metro resolves `@auto-tm/contracts` to its gitignored `dist/`, which goes
 *    stale locally and then crashes the app with `TypeError: undefined is not
 *    a function` wherever newer contracts code is called. EAS is immune
 *    (`eas-build-post-install` rebuilds contracts); local builds are not.
 *    This script always rebuilds contracts first.
 * 2. Gradle's `createBundleReleaseJsAndAssets` tracks neither workspace dist
 *    files nor `EXPO_PUBLIC_*` env as inputs, so an incremental build can
 *    repackage a stale JS bundle. This script deletes the bundle outputs so
 *    the task re-runs.
 * 3. `expo prebuild` without `--clean` does not regenerate launcher icons or
 *    other asset-derived resources, so after changing `assets/images/*`,
 *    the splash, or the app name the generated `android/` keeps the old
 *    branding. This script compares mtimes and runs `prebuild --clean` only
 *    when assets or app.config.js are newer than the generated resources.
 *
 * It finishes by verifying the APK actually embeds a Hermes bundle — the red
 * "Unable to load script" box means an APK without one was installed.
 *
 * Usage: pnpm --filter @auto-tm/mobile build:android:local [--abi arm64-v8a]
 * Env overrides: EXPO_PUBLIC_API_URL, EXPO_PUBLIC_WS_URL, EXPO_PUBLIC_MEDIA_URL,
 * EXPO_PUBLIC_ENV (defaults point at the production backend).
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import url from "node:url";

const args = process.argv.slice(2);
const supportedAbis = ["armeabi-v7a", "arm64-v8a", "x86", "x86_64"];
if (args.length && (args.length !== 2 || args[0] !== "--abi" || !supportedAbis.includes(args[1]))) {
  console.error(`Usage: build:android:local [--abi ${supportedAbis.join("|")}]`);
  process.exit(1);
}
const abi = args[1];

const mobileRoot = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(mobileRoot, "../..");
const androidDir = path.join(mobileRoot, "android");
const apkPath = path.join(androidDir, "app/build/outputs/apk/release/app-release.apk");
const HERMES_MAGIC = Buffer.from([0xc6, 0x1f, 0xbc, 0x03]);

// Static EXPO_PUBLIC_* defaults come from eas.json (single source for the app
// version and scheme); the backend URLs are not in eas.json by design
// (validate-eas-build-env) and default to production here. ANDROID_APPLICATION_ID
// is deliberately not read: local builds stay tm.auto.app.
const easJson = JSON.parse(fs.readFileSync(path.join(mobileRoot, "eas.json"), "utf8"));
const easDefaults = Object.fromEntries(
  Object.entries({ ...easJson.build.base.env, ...easJson.build.production.env }).filter(
    ([key]) => key.startsWith("EXPO_PUBLIC_"),
  ),
);

const env = {
  ...easDefaults,
  EXPO_PUBLIC_API_URL: "https://api.autotm.bagtyyar.dev/api/v1",
  EXPO_PUBLIC_WS_URL: "wss://api.autotm.bagtyyar.dev/ws/chat",
  EXPO_PUBLIC_MEDIA_URL: "https://media.autotm.bagtyyar.dev",
  EXPO_PUBLIC_ENV: "production",
  ...process.env,
  NODE_OPTIONS: `--max-old-space-size=8192 ${process.env.NODE_OPTIONS ?? ""}`.trim(),
  ANDROID_HOME: process.env.ANDROID_HOME ?? path.join(os.homedir(), "Library/Android/sdk"),
};

function run(label, command, args, cwd) {
  console.log(`\n==> ${label}`);
  execFileSync(command, args, { cwd, env, stdio: "inherit" });
}

function newestMtimeMs(entry) {
  const stat = fs.statSync(entry);
  if (!stat.isDirectory()) return stat.mtimeMs;
  return fs.readdirSync(entry).reduce(
    (newest, child) => Math.max(newest, newestMtimeMs(path.join(entry, child))),
    stat.mtimeMs,
  );
}

run("Rebuild @auto-tm/contracts dist", "pnpm", ["--filter", "@auto-tm/contracts", "build"], repoRoot);

const brandingInputs = [
  path.join(mobileRoot, "app.config.js"),
  path.join(mobileRoot, "assets/images"),
];
const generatedRes = path.join(androidDir, "app/src/main/res");
const assetsNewerThanRes =
  fs.existsSync(generatedRes) &&
  Math.max(...brandingInputs.map(newestMtimeMs)) > newestMtimeMs(generatedRes);

if (!fs.existsSync(androidDir) || assetsNewerThanRes) {
  run(
    assetsNewerThanRes
      ? "Branding assets changed since prebuild — regenerate android/ (prebuild --clean)"
      : "android/ missing — generate it (prebuild --clean)",
    "npx",
    ["expo", "prebuild", "--clean", "-p", "android"],
    mobileRoot,
  );
}

for (const stale of [
  "app/build/generated/assets/react",
  "app/build/generated/res/react",
  "app/build/generated/sourcemaps/react",
  "app/build/intermediates/assets/release",
  "app/build/outputs/apk/release",
]) {
  fs.rmSync(path.join(androidDir, stale), { recursive: true, force: true });
}

run("assembleRelease (JS bundle forced to re-run)", "./gradlew", [
  "assembleRelease", "--max-workers=2", "--no-parallel", "--priority=low", "--no-daemon",
  ...(abi ? [`-PreactNativeArchitectures=${abi}`] : []),
], androidDir);

console.log("\n==> Verify the APK embeds a Hermes bundle");
let bundle;
try {
  // The release bundle is several MB; the default maxBuffer (1 MiB) throws ENOBUFS.
  bundle = execFileSync("unzip", ["-p", apkPath, "assets/index.android.bundle"], {
    maxBuffer: 64 * 1024 * 1024,
  });
} catch {
  bundle = null;
}
if (!bundle || bundle.length === 0 || !bundle.subarray(0, 4).equals(HERMES_MAGIC)) {
  console.error(
    `FAIL: ${apkPath} has no valid Hermes bundle. ` +
      "Installing it shows the red 'Unable to load script' screen. " +
      "Check the createBundleReleaseJsAndAssets log above for a Metro error.",
  );
  process.exit(1);
}

console.log(`\nOK: ${apkPath}`);
console.log("Install with:");
console.log(`  $ANDROID_HOME/platform-tools/adb install -r "${apkPath}"`);
